import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { Telegraf } from "telegraf";
import { loadConfig } from "./config.js";
import { RuntimeStateStore } from "./runtimeStateStore.js";
import { createAuthMiddleware } from "./bot/middleware.js";
import { registerHandlers } from "./bot/handlers.js";
import { getTelegramCommands } from "./bot/commandCatalog.js";
import type { Locale } from "./bot/i18n.js";
import {
  notifyRecoverableQueuesOnStartup,
  notifyBootReadyOnStartup
} from "./bot/startupQueueRecovery.js";
import { McpClient } from "./orchestrator/mcpClient.js";
import { SkillRegistry } from "./orchestrator/skillRegistry.js";
import { McpSkill } from "./orchestrator/skills/mcpSkill.js";
import { GitHubSkill } from "./orchestrator/skills/githubSkill.js";
import { ProjectStatusSkill } from "./orchestrator/skills/projectStatusSkill.js";
import { ProjectMemoryService } from "./orchestrator/memoryService.js";
import { ProjectReuseEngine } from "./orchestrator/reuseEngine.js";
import { PromptLibraryService } from "./orchestrator/promptLibraryService.js";
import { DashboardAdminService } from "./orchestrator/dashboardAdminService.js";
import { PtyManager } from "./runner/ptyManager.js";
import { ShellManager } from "./runner/shellManager.js";
import { DevServerManager } from "./runner/devServerManager.js";
import { Scheduler } from "./cron/scheduler.js";
import { toErrorMessage } from "./lib/errors.js";
import { AudioTranscriber } from "./lib/audioTranscription.js";
import { AudioTts } from "./lib/audioTts.js";
import { AudioSummaryManager } from "./lib/audioSummaryManager.js";
import { AdminWebServer } from "./lib/adminWebServer.js";
import { ImageAttachmentManager } from "./lib/imageAttachmentManager.js";
import { maybeRunSpecialAutopilotAfterFinalized } from "./lib/specialAutopilot.js";
import { createTelegramApiAgent } from "./lib/telegramApi.js";
import { archiveCompletedSprintSurfaces } from "./orchestrator/memorySurfaceMaintenance.js";
import { createRestartBootstrapScript } from "./restartBootstrap.js";
import { launchTelegramBotWithRetry } from "./telegramLaunch.js";

const config = loadConfig();
const telegramApiAgent = createTelegramApiAgent(config.telegram.proxyUrl);
const bot = new Telegraf(config.telegram.botToken, {
  handlerTimeout: 120000,
  telegram: {
    apiRoot: config.telegram.apiBase,
    ...(telegramApiAgent
      ? { agent: telegramApiAgent, attachmentAgent: telegramApiAgent }
      : {})
  }
});
const stateStore = new RuntimeStateStore({ config });
let mcpClient: McpClient | null = null;
let skillRegistry: SkillRegistry | null = null;
let ptyManager: PtyManager | null = null;
let isShuttingDown = false;
const runtimeDir = path.join(process.cwd(), ".runtime");
const pidPath = path.join(runtimeDir, "dex-agent.pid");
const dropPendingUpdatesMarkerPath = path.join(
  runtimeDir,
  "drop-pending-updates.once"
);

async function saveRuntimeState(): Promise<void> {
  if (!mcpClient || !skillRegistry || !ptyManager) return;
  await stateStore.save({
    mcp: mcpClient.exportState(),
    skills: skillRegistry.exportState(),
    runner: ptyManager.exportState()
  });
}

async function restartBotProcess(): Promise<void> {
  await saveRuntimeState();
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.writeFile(dropPendingUpdatesMarkerPath, "1", "utf8");

  const bootstrapScript = createRestartBootstrapScript({
    parentPid: process.pid,
    cwd: process.cwd()
  });

  const launcher = spawn(process.execPath, ["-e", bootstrapScript], {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    windowsHide: true,
    stdio: "ignore"
  });
  launcher.unref();

  await shutdown("RESTART");
}

async function runStartupMemorySurfaceMaintenance(): Promise<void> {
  try {
    const results = await archiveCompletedSprintSurfaces({
      repoRoots: [config.runner.cwd],
      write: true
    });
    const archivedEntries = results.reduce(
      (total, result) => total + result.archivedEntries,
      0
    );
    const movedFiles = results.reduce(
      (total, result) => total + result.movedFiles.length,
      0
    );
    if (archivedEntries || movedFiles) {
      console.log(
        `[memory] archived completed sprint surfaces: entries=${archivedEntries}, files=${movedFiles}`
      );
    }
  } catch (error) {
    console.error(
      "[memory] startup sprint archive maintenance failed:",
      toErrorMessage(error)
    );
  }
}

bot.use(createAuthMiddleware(config));

await runStartupMemorySurfaceMaintenance();

const runtimeState = await stateStore.load();
mcpClient = new McpClient(config, {
  onChange: () => void saveRuntimeState()
});
mcpClient.restoreState(runtimeState.mcp);
mcpClient.warmConnections({
  onError: (error: unknown) => {
    const message = toErrorMessage(error);
    console.error("[mcp] connect failed:", message);
  }
});

const githubSkill = new GitHubSkill({ config });
const mcpSkill = new McpSkill({ mcpClient });
const memoryService = new ProjectMemoryService();
const reuseEngine = new ProjectReuseEngine(memoryService);
const promptLibraryService = new PromptLibraryService();
const dashboardAdminService = new DashboardAdminService();
const adminWebServer = new AdminWebServer(dashboardAdminService);
const projectStatusSkill = new ProjectStatusSkill(
  memoryService,
  promptLibraryService
);
const skills = {
  project_status: projectStatusSkill,
  github: githubSkill,
  mcp: mcpSkill
};
skillRegistry = new SkillRegistry(skills, {
  onChange: () => void saveRuntimeState()
});
skillRegistry.restoreState(runtimeState.skills);

const audioSummaryManager = new AudioSummaryManager({
  bot,
  tts: new AudioTts(config.audio.tts)
});
const imageAttachmentManager = new ImageAttachmentManager({
  bot
});

const FINALIZED_CAPTURE_TIMEOUT_MS = 15000;
const FINALIZED_MEDIA_TIMEOUT_MS = 30000;
const FINALIZED_ACTION_TIMEOUT_MS = 15000;

async function offerFinalActionsIfEnabled({
  chatId,
  text,
  locale,
  workdir
}: {
  chatId: string | number;
  text: string;
  locale: Locale;
  workdir: string;
}): Promise<void> {
  if (!config.finalActions.autoOffer) {
    console.info(
      `[finalized] final action auto-offer disabled for chat ${chatId}. Set FINAL_ACTIONS_AUTO_OFFER=true to enable.`
    );
    return;
  }

  await audioSummaryManager.offerFinalActionsForChat(
    chatId,
    text,
    locale,
    workdir
  );
}

async function runFinalizedStep(
  label: string,
  step: () => Promise<void>,
  timeoutMs: number
): Promise<void> {
  let timeout: NodeJS.Timeout | null = null;
  const stepPromise = step().catch((error) => {
    console.error(`[finalized] ${label} failed:`, toErrorMessage(error));
  });
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timeout = globalThis.setTimeout(() => resolve("timeout"), timeoutMs);
  });

  const result = await Promise.race([stepPromise, timeoutPromise]);
  if (timeout) {
    globalThis.clearTimeout(timeout);
  }
  if (result === "timeout") {
    console.warn(`[finalized] ${label} timed out after ${timeoutMs}ms.`);
  }
}

ptyManager = new PtyManager({
  bot,
  config,
  onChange: () => void saveRuntimeState(),
  onResponseFinalized: async ({ chatId, text, workdir, promptText }) => {
    const locale = ptyManager?.getLanguage(chatId) || "en";
    await runFinalizedStep(
      "memory capture",
      async () => {
        const captureResult = await reuseEngine.captureFinalizedResponse({
          chatId,
          workdir,
          text,
          promptText
        });
        if (captureResult.message) {
          await bot.telegram
            .sendMessage(chatId, captureResult.message)
            .catch(() => {});
        }
      },
      FINALIZED_CAPTURE_TIMEOUT_MS
    );
    await runFinalizedStep(
      "referenced image delivery",
      async () => {
        await imageAttachmentManager.sendReferencedImages({
          chatId,
          text,
          workdir
        });
      },
      FINALIZED_MEDIA_TIMEOUT_MS
    );
    const runner = ptyManager;
    if (!runner) {
      await runFinalizedStep(
        "final action buttons",
        async () => {
          await offerFinalActionsIfEnabled({
            chatId,
            text,
            locale,
            workdir
          });
        },
        FINALIZED_ACTION_TIMEOUT_MS
      );
      return;
    }
    let autopilotResult = {
      triggered: false,
      stopped: false
    };
    await runFinalizedStep(
      "special autopilot",
      async () => {
        autopilotResult = await maybeRunSpecialAutopilotAfterFinalized({
          bot,
          ptyManager: runner,
          chatId,
          locale,
          text
        });
      },
      FINALIZED_ACTION_TIMEOUT_MS
    );
    if (!autopilotResult.triggered && !autopilotResult.stopped) {
      await runFinalizedStep(
        "final action buttons",
        async () => {
          await offerFinalActionsIfEnabled({
            chatId,
            text,
            locale,
            workdir
          });
        },
        FINALIZED_ACTION_TIMEOUT_MS
      );
    }
  }
});
ptyManager.restoreState(runtimeState.runner);
for (const chatId of Object.keys(runtimeState.skills?.chats || {})) {
  try {
    skillRegistry.enable(chatId, "project_status");
  } catch {
    // Ignore missing-state migrations and keep startup resilient.
  }
}
const shellManager = new ShellManager({
  config
});
const devServerManager = new DevServerManager();
const audioTranscriber = new AudioTranscriber({
  config: config.audio.transcription
});

const scheduler = new Scheduler({
  bot,
  config
});
scheduler.start();

registerHandlers({
  bot,
  ptyManager,
  shellManager,
  devServerManager,
  skills,
  skillRegistry,
  scheduler,
  memoryService,
  reuseEngine,
  promptLibraryService,
  dashboardAdminService,
  adminWebServer,
  audioTranscriber,
  audioSummaryManager,
  telegramConfig: {
    apiBase: config.telegram.apiBase,
    botToken: config.telegram.botToken,
    proxyUrl: config.telegram.proxyUrl
  },
  instance: config.instance,
  adminActions: {
    restart: restartBotProcess
  }
});

bot.catch(async (error: unknown, ctx: any) => {
  console.error("[bot] unhandled error:", error);
  const message = toErrorMessage(error);
  await ctx.reply(`Bot error: ${message}`).catch(() => {});
});

let dropPendingUpdates = false;
try {
  await fs.access(dropPendingUpdatesMarkerPath);
  dropPendingUpdates = true;
} catch {
  dropPendingUpdates = false;
}

const { pollingTask } = await launchTelegramBotWithRetry(bot as any, {
  dropPendingUpdates
});
await fs.mkdir(runtimeDir, { recursive: true });
await fs.writeFile(pidPath, String(process.pid), "utf8");
if (dropPendingUpdates) {
  await fs.rm(dropPendingUpdatesMarkerPath, { force: true }).catch(() => {});
}
await bot.telegram
  .callApi("setMyCommands", {
    commands: getTelegramCommands()
  })
  .catch((error) =>
    console.warn("[telegram] setMyCommands failed:", toErrorMessage(error))
  );
await bot.telegram
  .callApi("setChatMenuButton", {
    menu_button: {
      type: "commands"
    }
  })
  .catch((error) =>
    console.warn("[telegram] setChatMenuButton failed:", toErrorMessage(error))
  );
const bootMode = dropPendingUpdates ? "restart" : "startup";
const queueRecoveryHandledChatIds = await notifyRecoverableQueuesOnStartup(
  bot,
  ptyManager,
  bootMode
).catch((error) => {
  console.warn(
    "[startup] queue recovery notification failed:",
    toErrorMessage(error)
  );
  return new Set<string>();
});
await notifyBootReadyOnStartup(
  bot,
  ptyManager,
  config.telegram.proactiveUserIds,
  bootMode,
  queueRecoveryHandledChatIds
).catch((error) =>
  console.warn(
    "[startup] boot-ready notification failed:",
    toErrorMessage(error)
  )
);
console.log("Dex Agent started.");
void pollingTask.catch((error: unknown) => {
  if (isShuttingDown) {
    return;
  }

  console.error("[telegram] polling stopped:", toErrorMessage(error));
});

async function shutdown(signal: string): Promise<void> {
  isShuttingDown = true;
  console.log(`Shutting down by ${signal}...`);
  scheduler.stop();
  await ptyManager?.shutdown();
  await devServerManager.shutdown();
  await adminWebServer.shutdown();
  await mcpClient?.closeAll();
  bot.stop(signal);
  await fs.rm(pidPath, { force: true }).catch(() => {});
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
