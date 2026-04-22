import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { registerHandlers } from "../src/bot/handlers.js";
import { ProjectMemoryService } from "../src/orchestrator/memoryService.js";
import { PromptLibraryService } from "../src/orchestrator/promptLibraryService.js";

type Handler = (ctx: TestContext) => Promise<void> | void;

interface ReplyRecord {
  text: string;
  options?: Record<string, unknown>;
}

interface TestContext {
  chat: {
    id: number;
  };
  from: {
    id: number;
  };
  message: {
    text?: string;
    voice?: {
      file_id: string;
      mime_type?: string;
    };
    photo?: Array<{
      file_id: string;
      file_size?: number;
    }>;
    caption?: string;
  };
  callbackQuery?: {
    data?: string;
  };
  replies: ReplyRecord[];
  reply: (text: string, options?: Record<string, unknown>) => Promise<void>;
  answerCbQuery: (text?: string) => Promise<void>;
}

class FakeBot {
  readonly commands = new Map<string, Handler>();
  readonly events = new Map<string, Handler>();
  startHandler: Handler | null = null;
  readonly telegram = {
    sendMessage: async () => ({ message_id: 1 }),
    sendVoice: async () => ({})
  };

  start(handler: Handler): void {
    this.startHandler = handler;
  }

  command(name: string, handler: Handler): void {
    this.commands.set(name, handler);
  }

  on(event: string, handler: Handler): void {
    this.events.set(event, handler);
  }
}

function createContext(
  text: string,
  chatId = 1,
  messageOverrides: Partial<TestContext["message"]> = {}
): TestContext {
  const replies: ReplyRecord[] = [];
  return {
    chat: { id: chatId },
    from: { id: chatId },
    message: {
      text,
      ...messageOverrides
    },
    replies,
    reply: async (replyText: string, options?: Record<string, unknown>) => {
      replies.push({
        text: replyText,
        options
      });
    },
    answerCbQuery: async (answerText?: string) => {
      if (answerText) {
        replies.push({ text: answerText });
      }
    }
  };
}

function createDependencies(
  overrides: {
    sendPrompt?: (...args: any[]) => Promise<unknown>;
    continuePendingPrompt?: (...args: any[]) => Promise<unknown>;
    projectStatusExecute?: (...args: any[]) => Promise<unknown>;
    listPromptQueue?: () => Array<Record<string, unknown>>;
    enqueuePrompt?: (...args: any[]) => Record<string, unknown>;
    removeQueuedPrompt?: (...args: any[]) => Record<string, unknown>;
    runNextQueuedPrompt?: (...args: any[]) => Promise<unknown>;
    audioTranscribe?: () => Promise<{ text: string; fileName: string }>;
    telegramMediaDownloader?: (...args: any[]) => Promise<{
      filePath: string;
      fileName: string;
      mimeType?: string;
    }>;
    audioSummaryManager?: {
      isEnabled(): boolean;
      createSummaryRequest(
        chatId: string | number,
        text: string,
        workdir?: string
      ): string | null;
      resolveRequest(
        chatId: string | number,
        requestId: string
      ): {
        chatId: string;
        text: string;
        workdir?: string;
        createdAt: number;
      } | null;
      offerForContext(
        ctx: TestContext,
        text: string,
        locale: string
      ): Promise<boolean>;
      offerFinalActionsForChat(
        chatId: string | number,
        text: string,
        locale: string,
        workdir?: string
      ): Promise<boolean>;
      sendSummaryForChat(
        chatId: string | number,
        text: string
      ): Promise<boolean>;
      handleCallback(
        ctx: TestContext,
        requestId: string,
        locale: string
      ): Promise<boolean>;
    };
    workdir?: string;
    memoryService?: ProjectMemoryService;
    promptLibraryService?: PromptLibraryService;
    adminActions?: {
      restart?: () => Promise<void>;
    } | null;
  } = {}
) {
  const bot = new FakeBot();
  const promptCalls: unknown[] = [];
  const workdir = overrides.workdir || process.cwd();
  const ptyManager = {
    getLanguage: () => "en",
    sendPrompt:
      overrides.sendPrompt ||
      (async (...args: unknown[]) => {
        promptCalls.push(args);
        return {
          started: true,
          mode: "sdk"
        };
      }),
    continuePendingPrompt:
      overrides.continuePendingPrompt ||
      (async () => ({
        started: false,
        reason: "no_pending_prompt"
      })),
    getStatus: () => ({
      backend: "sdk",
      active: false,
      activeMode: null,
      lastMode: null,
      lastExitCode: null,
      lastExitSignal: null,
      projectSessionId: null,
      preferredModel: null,
      language: "en",
      verboseOutput: false,
      ptySupported: null,
      workdir,
      relativeWorkdir: ".",
      workspaceRoot: workdir,
      command: "codex",
      mcpServers: [],
      workflowSystem: "superpowers",
      workflowPhase: "none"
    }),
    getRecentProjects: () => [],
    listProjects: () => [],
    listPromptQueue: overrides.listPromptQueue || (() => []),
    enqueuePrompt:
      overrides.enqueuePrompt ||
      (() => ({
        ok: true,
        item: {
          id: "queue-1",
          index: 1,
          text: "queued task",
          relativeWorkdir: ".",
          createdAt: new Date().toISOString()
        }
      })),
    removeQueuedPrompt:
      overrides.removeQueuedPrompt ||
      (() => ({
        ok: false,
        reason: "not_found"
      })),
    clearPromptQueue: () => ({
      ok: true,
      count: 0
    }),
    runNextQueuedPrompt:
      overrides.runNextQueuedPrompt ||
      (async () => ({
        started: false,
        reason: "no_pending_prompt"
      })),
    switchWorkdir: () => ({
      workdir: process.cwd(),
      relativePath: "."
    }),
    switchToPreviousWorkdir: () => ({
      workdir: process.cwd(),
      relativePath: "."
    }),
    resolveProjectWorkdir: () => null,
    resetCurrentProjectConversation: () => ({
      closed: false
    }),
    interrupt: () => true,
    closeSession: () => true,
    isVerbose: () => false,
    setVerbose: () => false,
    setLanguage: () => "en",
    setPreferredModel: () => "gpt-5.4",
    clearPreferredModel: () => {},
    getOperationalContinuationState: () => ({
      active: false,
      activeMode: null,
      workflowPhase: "none",
      workdir,
      relativeWorkdir: ".",
      pendingPromptText: null,
      queuedItems: [],
      lastPromptText: null,
      lastPromptAt: null,
      lastFinalResponseText: null,
      lastFinalizedAt: null
    })
  };

  registerHandlers({
    bot,
    ptyManager: ptyManager as any,
    shellManager: {
      isEnabled: () => false,
      isReadOnly: () => true,
      getAllowedCommands: () => [],
      inspectCommand: () => {
        throw new Error("not used");
      },
      execute: async () => ({ started: false, reason: "busy" })
    } as any,
    devServerManager: {
      start: async () => ({
        started: true,
        scriptName: "dev",
        packageManager: "npm",
        command: "npm run dev"
      }),
      getStatus: () => ({
        running: false,
        status: "stopped",
        workdir: process.cwd(),
        startedByChatId: null,
        command: null,
        packageManager: null,
        scriptName: null,
        pid: null,
        startedAt: null,
        exitedAt: null,
        exitCode: null,
        signal: null,
        detectedUrl: null
      }),
      stop: () => false,
      getLogs: () => "(no logs yet)",
      getUrl: () => null
    } as any,
    skills: {
      project_status: {
        inspect: async () => ({
          projectProfile: "memoria-viva-project-profile",
          decisionSource: "profile_only",
          canonicalSources: [],
          memorySources: [],
          currentStatus: {
            projectName: "AgendadorConsultasOticas",
            primaryFocus: "front-end",
            latestClosedBlock: "669-680",
            nextEligibleBlock: "681-692",
            executionFormal: "Nao confirmado",
            liveEvidence: null,
            publicEvidence: null
          },
          progressSummary: ["669-680: 100% concluido"],
          nextStepSummary: ["- Continuar o bloco ja planejado."],
          nextQueue: ["- 681-692 -> bloco planejado"],
          suggestedCommands: [
            "- npm run frontend:audit:recurring",
            "- npm run frontend:confidence:report"
          ],
          openRisks: [],
          relevantMemory: [],
          memoryConfidence: "none",
          usedOperationalState: true,
          renderHints: {
            variant: "default",
            missingSections: []
          }
        }),
        execute:
          overrides.projectStatusExecute ||
          (async ({ variant }: { variant?: string }) => ({
            text: `variant: ${variant || "default"}`
          }))
      },
      github: {
        execute: async () => ({ text: "unused" }),
        getTestStatus: async () => null
      },
      mcp: {
        execute: async () => ({ text: "unused" }),
        mcpClient: {
          listServers: () => []
        }
      }
    } as any,
    skillRegistry: {
      list: () => [],
      isEnabled: () => true,
      enable: () => ({
        changed: true,
        skills: []
      }),
      disable: () => ({
        changed: true,
        skills: []
      })
    } as any,
    scheduler: {
      triggerDailySummaryNow: async () => {}
    } as any,
    memoryService:
      overrides.memoryService ||
      ({
        buildMemoryPacket: async () => null,
        renderMemoryPacket: (_packet: unknown, prompt: string) => prompt,
        buildSourceDisclosure: () => "",
        listCandidates: async () => [],
        listProposals: async () => [],
        proposePromotion: async () => null,
        discardCandidate: async () => null,
        explainCandidate: async () => null,
        applyPromotion: async () => ({ ok: false, reason: "missing" }),
        cancelProposal: async () => null,
        readOperationalFile: async () => null,
        captureCandidate: async () => null
      } as any),
    promptLibraryService:
      overrides.promptLibraryService || new PromptLibraryService(),
    audioTranscriber: {
      isEnabled: () => true,
      transcribeTelegramAudio:
        overrides.audioTranscribe ||
        (async () => ({
          text: "audio transcript",
          fileName: "voice-note.ogg"
        }))
    } as any,
    audioSummaryManager:
      overrides.audioSummaryManager ||
      ({
        isEnabled: () => false,
        createSummaryRequest: () => null,
        resolveRequest: () => null,
        offerForContext: async () => false,
        offerFinalActionsForChat: async () => false,
        sendSummaryForChat: async () => false,
        handleCallback: async () => false
      } as any),
    telegramMediaDownloader:
      overrides.telegramMediaDownloader ||
      (async () => ({
        filePath: "/tmp/telegram-image.jpg",
        fileName: "telegram-image.jpg",
        mimeType: "image/jpeg"
      })),
    telegramConfig: {
      apiBase: "https://api.telegram.org",
      botToken: "test-token",
      proxyUrl: undefined
    },
    ...(overrides.adminActions === undefined
      ? {
          adminActions: {
            restart: async () => {}
          }
        }
      : overrides.adminActions === null
        ? {}
        : {
            adminActions: overrides.adminActions
          })
  });

  return { bot, ptyManager, promptCalls };
}

test("restart command reports when restart control is unavailable", async () => {
  const { bot } = createDependencies({
    adminActions: null
  });
  const ctx = createContext("/restart");
  const handler = bot.commands.get("restart");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies[0].text, /restart control is not enabled/i);
});

test("restart command announces restart and calls the admin action", async () => {
  let restartCalls = 0;
  const { bot } = createDependencies({
    adminActions: {
      restart: async () => {
        restartCalls += 1;
      }
    }
  });
  const ctx = createContext("/restart");
  const handler = bot.commands.get("restart");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(restartCalls, 1);
  assert.match(ctx.replies[0].text, /restarting the bot process/i);
});

test("help command renders deterministic help text", async () => {
  const { bot } = createDependencies();
  const ctx = createContext("/help");
  const handler = bot.commands.get("help");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies[0].text, /fluxo deterministico/i);
  assert.match(ctx.replies[0].text, /\/project/i);
});

test("menu command renders dashboard with inline buttons", async () => {
  const { bot } = createDependencies();
  const ctx = createContext("/menu");
  const handler = bot.commands.get("menu");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies[0].text, /Menu deterministico/i);
  const inlineKeyboard = (
    ctx.replies[0].options?.reply_markup as {
      inline_keyboard?: Array<Array<{ callback_data?: string }>>;
    }
  )?.inline_keyboard;
  assert.equal(inlineKeyboard?.[0]?.[0]?.callback_data, "menu:project");
});

test("text handler sends free text directly to Codex", async () => {
  const prompts: string[] = [];
  const { bot } = createDependencies({
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    }
  });
  const ctx = createContext("qual sprint atual?");
  const handler = bot.events.get("text");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(prompts.length, 1);
  assert.match(prompts[0] || "", /qual sprint atual\?/i);
  assert.match(ctx.replies[0]?.text || "", /Pedido enviado ao Codex/i);
});

test("continue-style free text prioritizes live operational state before canonical memory", async () => {
  const prompts: string[] = [];
  const { bot, ptyManager } = createDependencies({
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    },
    memoryService: {
      buildMemoryPacket: async () => ({
        workdir: "C:/CodexProjetos/AgendadorConsultasOticas",
        currentObjective: "front-end",
        latestClosedBlock: "765-776",
        nextEligibleBlock: "777-788",
        tacticalNotes: ["- repo still says front-end"],
        relevantMemory: [],
        sources: [],
        confidence: "medium",
        usedOperationalState: true
      }),
      renderMemoryPacket: (_packet: unknown, prompt: string) => prompt,
      buildSourceDisclosure: () => "",
      listCandidates: () => [],
      proposePromotion: () => null,
      discardCandidate: () => null,
      explainCandidate: () => null,
      applyPromotion: async () => ({ ok: false, reason: "missing" }),
      cancelProposal: () => null,
      readOperationalFile: async () => null,
      captureCandidate: () => null
    } as any
  });
  (ptyManager.getOperationalContinuationState as any) = () => ({
    active: false,
    activeMode: null,
    workflowPhase: "verifying",
    workdir: "C:/CodexProjetos/AgendadorConsultasOticas",
    relativeWorkdir: "AgendadorConsultasOticas",
    pendingPromptText: null,
    queuedItems: [],
    lastPromptText: "continue a bateria de testes ao vivo",
    lastPromptAt: "2026-04-20T17:00:00.000Z",
    lastFinalResponseText:
      "Estou no bloco da bateria viva do backend e da auditoria completa do runtime.",
    lastFinalizedAt: "2026-04-20T17:01:00.000Z"
  });

  const ctx = createContext("continue de onde voce parou");
  const handler = bot.events.get("text");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    prompts[0] || "",
    /Operational continuation state for this chat/i
  );
  assert.match(
    prompts[0] || "",
    /live cut: continue a bateria de testes ao vivo/i
  );
  assert.doesNotMatch(prompts[0] || "", /last live result:/i);
  assert.doesNotMatch(prompts[0] || "", /active session:/i);
  assert.match(
    prompts[0] || "",
    /Durable memoria-viva fallback only if needed:/i
  );
  assert.match(prompts[0] || "", /current objective: front-end/i);
  assert.match(prompts[0] || "", /next eligible block: 777-788/i);
  assert.match(prompts[0] || "", /tactical note: repo still says front-end/i);
  assert.doesNotMatch(prompts[0] || "", /latest closed block:/i);
  assert.match(prompts[0] || "", /prefer the operational continuation state/i);
  assert.match(
    prompts[0] || "",
    /Do not treat prior assistant narration as verified live state/i
  );
});

test("operational status question returns runtime status instead of sending a prompt", async () => {
  const prompts: string[] = [];
  const deps = createDependencies({
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    },
    listPromptQueue: () => [
      {
        id: "queue-1",
        index: 1,
        text: "continue a bateria",
        relativeWorkdir: "AgendadorConsultasOticas",
        createdAt: new Date().toISOString()
      }
    ]
  });
  const { bot: operationalBot, ptyManager } = deps;
  (ptyManager.getOperationalContinuationState as any) = () => ({
    active: false,
    activeMode: null,
    workflowPhase: "none",
    workdir: process.cwd(),
    relativeWorkdir: ".",
    pendingPromptText: null,
    queuedItems: [
      {
        id: "queue-1",
        index: 1,
        text: "continue a bateria",
        workdir: process.cwd(),
        relativeWorkdir: "AgendadorConsultasOticas",
        createdAt: new Date().toISOString()
      }
    ],
    lastPromptText: "continue a bateria",
    lastPromptAt: new Date().toISOString(),
    lastFinalResponseText: null,
    lastFinalizedAt: null
  });
  const ctx = createContext("o que esta fazendo?");
  const handler = operationalBot.events.get("text");

  assert.ok(handler);
  await handler!(ctx);

  assert.deepEqual(prompts, []);
  assert.match(ctx.replies[0]?.text || "", /Estado operacional atual/i);
  assert.match(ctx.replies[0]?.text || "", /queue: 1 pending/i);
  assert.match(
    ctx.replies[0]?.text || "",
    /runtime posture: queued work pending/i
  );
});

test("status command is localized to pt-BR and shows whether the bot is working", async () => {
  const { bot, ptyManager } = createDependencies();
  (ptyManager.getLanguage as any) = () => "pt-BR";
  (ptyManager.getStatus as any) = () => ({
    backend: "sdk",
    active: true,
    activeMode: "sdk",
    lastMode: "sdk",
    lastExitCode: 0,
    lastExitSignal: null,
    projectSessionId: "session-1",
    preferredModel: null,
    language: "pt-BR",
    verboseOutput: false,
    ptySupported: null,
    workdir: "C:/CodexProjetos/AgendadorConsultasOticas",
    relativeWorkdir: "AgendadorConsultasOticas",
    workspaceRoot: "C:/CodexProjetos",
    command: "codex",
    mcpServers: [],
    workflowSystem: "superpowers",
    workflowPhase: "working"
  });
  (ptyManager.getOperationalContinuationState as any) = () => ({
    active: true,
    activeMode: "sdk",
    workflowPhase: "working",
    workdir: "C:/CodexProjetos/AgendadorConsultasOticas",
    relativeWorkdir: "AgendadorConsultasOticas",
    pendingPromptText: null,
    queuedItems: [],
    lastPromptText: "continue a bateria viva",
    lastPromptAt: new Date(Date.now() - 30_000).toISOString(),
    lastFinalResponseText: null,
    lastFinalizedAt: null
  });
  (ptyManager.getRecentProjects as any) = () => [
    {
      relativePath: "AgendadorConsultasOticas",
      path: "C:/CodexProjetos/AgendadorConsultasOticas"
    }
  ];

  const ctx = createContext("/status");
  const handler = bot.commands.get("status");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies[0]?.text || "", /situacao: trabalhando/i);
  assert.match(ctx.replies[0]?.text || "", /ativo: sim/i);
  assert.match(ctx.replies[0]?.text || "", /modo ativo: sdk/i);
  assert.match(ctx.replies[0]?.text || "", /fase do workflow: working/i);
  assert.match(
    ctx.replies[0]?.text || "",
    /postura operacional: trabalhando agora/i
  );
});

test("status command surfaces queued work before silence heuristics", async () => {
  const { bot, ptyManager } = createDependencies();
  (ptyManager.getLanguage as any) = () => "pt-BR";
  (ptyManager.getStatus as any) = () => ({
    backend: "sdk",
    active: false,
    activeMode: null,
    lastMode: "sdk",
    lastExitCode: 0,
    lastExitSignal: null,
    projectSessionId: "session-1",
    preferredModel: null,
    language: "pt-BR",
    verboseOutput: false,
    ptySupported: null,
    workdir: "C:/CodexProjetos/dex-agent",
    relativeWorkdir: "dex-agent",
    workspaceRoot: "C:/CodexProjetos",
    command: "codex",
    mcpServers: [],
    workflowSystem: "superpowers",
    workflowPhase: "none"
  });
  (ptyManager.getOperationalContinuationState as any) = () => ({
    active: false,
    activeMode: null,
    workflowPhase: "none",
    workdir: "C:/CodexProjetos/dex-agent",
    relativeWorkdir: "dex-agent",
    pendingPromptText: null,
    queuedItems: [
      {
        id: "queue-1",
        index: 1,
        text: "continuar o proximo passo",
        workdir: "C:/CodexProjetos/dex-agent",
        relativeWorkdir: "dex-agent",
        createdAt: new Date().toISOString()
      }
    ],
    lastPromptText: "continuar o proximo passo",
    lastPromptAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    lastFinalResponseText: "sprint anterior encerrado",
    lastFinalizedAt: new Date(Date.now() - 8 * 60 * 60_000).toISOString()
  });

  const ctx = createContext("/status");
  const handler = bot.commands.get("status");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    ctx.replies[0]?.text || "",
    /postura operacional: fila pendente/i
  );
  assert.match(ctx.replies[0]?.text || "", /fila viva: 1 pendente/i);
  assert.match(
    ctx.replies[0]?.text || "",
    /proximo: continuar o proximo passo/i
  );
});

test("status command flags prolonged silence when no work is pending", async () => {
  const { bot, ptyManager } = createDependencies();
  (ptyManager.getLanguage as any) = () => "pt-BR";
  (ptyManager.getStatus as any) = () => ({
    backend: "sdk",
    active: false,
    activeMode: null,
    lastMode: "sdk",
    lastExitCode: 0,
    lastExitSignal: null,
    projectSessionId: "session-1",
    preferredModel: null,
    language: "pt-BR",
    verboseOutput: false,
    ptySupported: null,
    workdir: "C:/CodexProjetos/dex-agent",
    relativeWorkdir: "dex-agent",
    workspaceRoot: "C:/CodexProjetos",
    command: "codex",
    mcpServers: [],
    workflowSystem: "superpowers",
    workflowPhase: "none"
  });
  (ptyManager.getOperationalContinuationState as any) = () => ({
    active: false,
    activeMode: null,
    workflowPhase: "none",
    workdir: "C:/CodexProjetos/dex-agent",
    relativeWorkdir: "dex-agent",
    pendingPromptText: null,
    queuedItems: [],
    lastPromptText: "fechar o sprint anterior",
    lastPromptAt: new Date(Date.now() - 9 * 60 * 60_000).toISOString(),
    lastFinalResponseText: "sprint anterior encerrado",
    lastFinalizedAt: new Date(Date.now() - 9 * 60 * 60_000).toISOString()
  });

  const ctx = createContext("/status");
  const handler = bot.commands.get("status");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    ctx.replies[0]?.text || "",
    /postura operacional: silencio prolongado/i
  );
  assert.match(ctx.replies[0]?.text || "", /ultimo fechamento:/i);
});

test("interrupt shows queue state with actionable buttons when items remain pending", async () => {
  const { bot } = createDependencies({
    listPromptQueue: () => [
      {
        id: "queue-1",
        index: 1,
        text: "continue a bateria",
        relativeWorkdir: "AgendadorConsultasOticas",
        createdAt: new Date().toISOString()
      }
    ]
  });
  const ctx = createContext("/interrupt");
  const handler = bot.commands.get("interrupt");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(ctx.replies.length, 2);
  assert.match(
    ctx.replies[0]?.text || "",
    /Interrupted the active Codex run|Interromp/i
  );
  assert.match(ctx.replies[1]?.text || "", /Estado atual da fila|queue state/i);

  const inlineKeyboard = (
    ctx.replies[1]?.options?.reply_markup as {
      inline_keyboard?: Array<Array<{ callback_data?: string }>>;
    }
  )?.inline_keyboard;

  assert.equal(inlineKeyboard?.[0]?.[0]?.callback_data, "queue:run");
});

test("memory command lists pending candidates and can promote one", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-memory-handler-")
  );
  const memoryService = new ProjectMemoryService();
  await memoryService.captureCandidate({
    workdir,
    text: "Decision: keep MEMORY.ndjson append-only and require confirmation before durable writes.",
    source: {
      type: "operator",
      detail: "test"
    },
    evidence: {
      type: "operator",
      value: "test assertion"
    }
  });

  const { bot } = createDependencies({
    workdir,
    memoryService
  });

  const memoryHandler = bot.commands.get("memory");
  assert.ok(memoryHandler);

  const candidatesCtx = createContext("/memory candidates");
  await memoryHandler!(candidatesCtx);
  assert.match(candidatesCtx.replies.at(-1)?.text || "", /Memory Candidates/i);

  const promoteCtx = createContext("/memory promote 0");
  await memoryHandler!(promoteCtx);
  assert.match(
    promoteCtx.replies.at(-1)?.text || "",
    /Proposal ready for review/i
  );
});

test("menu callback inbox opens the inbox dashboard", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-menu-inbox-")
  );
  const memoryService = new ProjectMemoryService();
  await memoryService.captureCandidate({
    workdir,
    text: "Decision: inbox candidates must survive restart.",
    source: {
      type: "operator",
      detail: "menu test"
    },
    evidence: {
      type: "operator",
      value: "menu assertion"
    }
  });

  const { bot } = createDependencies({
    workdir,
    memoryService
  });
  const handler = bot.events.get("callback_query");
  assert.ok(handler);

  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "menu:inbox"
  };

  await handler!(ctx);

  assert.match(ctx.replies.at(-1)?.text || "", /Memory inbox/i);
});

test("memory help shows the memory system guide entrypoint", async () => {
  const { bot } = createDependencies();
  const ctx = createContext("/memory help");
  const handler = bot.commands.get("memory");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    ctx.replies.at(-1)?.text || "",
    /Sistema de memoria do Dex Agent/i
  );
  assert.match(ctx.replies.at(-1)?.text || "", /INDEX/i);
  assert.match(ctx.replies.at(-1)?.text || "", /PROJECT/i);
  assert.match(ctx.replies.at(-1)?.text || "", /memory\\-system/i);
  assert.match(ctx.replies.at(-1)?.text || "", /README\\.md/i);
});

test("memory remember returns a proposal ready for review", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-memory-remember-")
  );
  const memoryService = new ProjectMemoryService();
  const { bot } = createDependencies({
    workdir,
    memoryService
  });
  const handler = bot.commands.get("memory");

  assert.ok(handler);

  const ctx = createContext(
    "/memory remember rule: keep durable memory proposal-first"
  );
  await handler!(ctx);

  const replyText = ctx.replies.at(-1)?.text || "";
  assert.match(replyText, /Proposal ready for review/i);
  const inlineKeyboard = (
    ctx.replies.at(-1)?.options?.reply_markup as {
      inline_keyboard?: Array<Array<{ callback_data?: string }>>;
    }
  )?.inline_keyboard;
  assert.ok(
    inlineKeyboard
      ?.flat()
      .some((button) => /inbox:confirm:/i.test(button.callback_data || ""))
  );
});

test("remember command is a short alias for memory remember", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-remember-alias-")
  );
  const memoryService = new ProjectMemoryService();
  const { bot } = createDependencies({
    workdir,
    memoryService
  });
  const handler = bot.commands.get("remember");

  assert.ok(handler);

  const ctx = createContext(
    "/remember decision: use proposal-first writes for durable memory"
  );
  await handler!(ctx);

  const replyText = ctx.replies.at(-1)?.text || "";
  assert.match(replyText, /Proposal ready for review/i);
});

test("remember command preserves explicit skill intent and opens a project skill proposal", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-remember-skill-")
  );
  const memoryService = new ProjectMemoryService();
  const { bot } = createDependencies({
    workdir,
    memoryService
  });
  const handler = bot.commands.get("remember");

  assert.ok(handler);

  const ctx = createContext(
    "/remember isso tem que virar skill de projeto: Use este prompt de retomada em uma nova conversa: Projeto: Dex Agent"
  );
  await handler!(ctx);

  const replyText = ctx.replies.at(-1)?.text || "";
  assert.match(replyText, /Proposal ready for review/i);
  assert.match(replyText, /Project skill/i);
});

test("weak remember capture returns a refinement guide instead of a dead end", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-remember-refine-")
  );
  const memoryService = new ProjectMemoryService();
  const { bot } = createDependencies({
    workdir,
    memoryService
  });
  const handler = bot.commands.get("remember");

  assert.ok(handler);

  const ctx = createContext("/remember ok");
  await handler!(ctx);

  const replyText = ctx.replies.at(-1)?.text || "";
  assert.match(replyText, /still too weak to become a memory candidate/i);
  assert.match(replyText, /refinador\\-intencao/i);
  assert.match(
    replyText,
    /1\\\. destino: memoria \\| skill deste repo \\| skill global \\| estado vivo/i
  );
});

test("refinar command exposes the guided refinement path explicitly", async () => {
  const { bot } = createDependencies();
  const handler = bot.commands.get("refinar");

  assert.ok(handler);

  const ctx = createContext("/refinar guarda isso");
  await handler!(ctx);

  const replyText = ctx.replies.at(-1)?.text || "";
  assert.match(replyText, /refinador\\-intencao/i);
  assert.match(
    replyText,
    /repo alvo: dex-agent raiz \\| repo filho \\| ainda nao sei/i
  );
});

test("refinar command without payload shows usage and the refinement guide", async () => {
  const { bot } = createDependencies();
  const handler = bot.commands.get("refinar");

  assert.ok(handler);

  const ctx = createContext("/refinar");
  await handler!(ctx);

  const replyText = ctx.replies.at(-1)?.text || "";
  assert.match(replyText, /Uso: \/refinar <texto\\?>/i);
  assert.match(replyText, /still too weak to become a memory candidate/i);
});

test("explicit free-text remember shortcut creates a proposal instead of sending a Codex prompt", async () => {
  const prompts: string[] = [];
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-remember-shortcut-")
  );
  const memoryService = new ProjectMemoryService();
  const { bot } = createDependencies({
    workdir,
    memoryService,
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    }
  });
  const handler = bot.events.get("text");

  assert.ok(handler);

  const ctx = createContext(
    "guarda isso: rule: durable memory should stay proposal-first"
  );
  await handler!(ctx);

  assert.deepEqual(prompts, []);
  const replyText = ctx.replies.at(-1)?.text || "";
  assert.match(replyText, /Proposal ready for review/i);
});

test("explicit free-text skill shortcut preserves the skill destination", async () => {
  const prompts: string[] = [];
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-skill-shortcut-")
  );
  const memoryService = new ProjectMemoryService();
  const { bot } = createDependencies({
    workdir,
    memoryService,
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    }
  });
  const handler = bot.events.get("text");

  assert.ok(handler);

  const ctx = createContext(
    "guarda isso como skill de projeto: Use este prompt de retomada em uma nova conversa: Projeto: Dex Agent"
  );
  await handler!(ctx);

  assert.deepEqual(prompts, []);
  const replyText = ctx.replies.at(-1)?.text || "";
  assert.match(replyText, /Proposal ready for review/i);
  assert.match(replyText, /Project skill/i);
});

test("memory callback confirm writes durable memory", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-memory-callback-")
  );
  const memoryService = new ProjectMemoryService();
  await memoryService.captureCandidate({
    workdir,
    text: "Rule: durable memory must always be proposal-first.",
    source: {
      type: "operator",
      detail: "test"
    },
    evidence: {
      type: "operator",
      value: "callback test"
    }
  });
  const proposal = await memoryService.proposePromotion(workdir, 0);
  assert.ok(proposal);

  const { bot } = createDependencies({
    workdir,
    memoryService
  });
  const callbackHandler = bot.events.get("callback_query");
  assert.ok(callbackHandler);

  const ctx = createContext("", 1);
  ctx.callbackQuery = {
    data: `memory:confirm:${proposal!.id}`
  };

  await callbackHandler!(ctx);

  const ledgerPath = path.join(workdir, ".agents", "MEMORY.ndjson");
  const ledger = await fs.readFile(ledgerPath, "utf8");
  assert.match(ledger, /proposal-first/i);
  assert.match(ctx.replies.at(-1)?.text || "", /Memory promoted/i);
});

test("inbox command lists persisted candidates and proposals", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-inbox-handler-")
  );
  const memoryService = new ProjectMemoryService();
  await memoryService.captureCandidate({
    workdir,
    text: "Decision: keep inbox candidates durable across restart.",
    source: {
      type: "operator",
      detail: "test"
    },
    evidence: {
      type: "operator",
      value: "inbox assertion"
    }
  });
  await memoryService.proposePromotion(workdir, 0);

  const { bot } = createDependencies({
    workdir,
    memoryService
  });
  const handler = bot.commands.get("inbox");

  assert.ok(handler);

  const overviewCtx = createContext("/inbox");
  await handler!(overviewCtx);
  assert.match(overviewCtx.replies.at(-1)?.text || "", /Memory inbox/i);
  assert.match(overviewCtx.replies.at(-1)?.text || "", /candidates: 1/i);
  assert.match(overviewCtx.replies.at(-1)?.text || "", /proposals: 1/i);
  assert.match(overviewCtx.replies.at(-1)?.text || "", /recent context: 0/i);
  assert.match(overviewCtx.replies.at(-1)?.text || "", /durable memory: 1/i);
  assert.match(overviewCtx.replies.at(-1)?.text || "", /skill candidates: 0/i);

  const proposalsCtx = createContext("/inbox proposals");
  await handler!(proposalsCtx);
  assert.match(proposalsCtx.replies.at(-1)?.text || "", /Inbox Proposals/i);
});

test("inbox overview hides absolute local paths and raw abs path targets", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-inbox-path-noise-")
  );
  const memoryService = new ProjectMemoryService();
  await memoryService.captureCandidate({
    workdir,
    text: "Procedimento: use [HANDOFF.md](/abs/path/C:/CodexProjetos/dex-agent/.agents/HANDOFF.md:24) e revise C:/CodexProjetos/dex-agent/src/orchestrator/memoryService.ts:569 antes de continuar.",
    source: {
      type: "operator",
      detail: "test"
    },
    evidence: {
      type: "operator",
      value: "ui path noise"
    }
  });

  const { bot } = createDependencies({
    workdir,
    memoryService
  });
  const handler = bot.commands.get("inbox");

  assert.ok(handler);

  const overviewCtx = createContext("/inbox");
  await handler!(overviewCtx);

  const text = overviewCtx.replies.at(-1)?.text || "";
  assert.match(text, /HANDOFF\\\.md/i);
  assert.doesNotMatch(text, /\/abs\/path\//i);
  assert.doesNotMatch(text, /C:\/CodexProjetos\//i);
  assert.doesNotMatch(text, /C:\\CodexProjetos\\/i);
});

test("inbox candidates and why keep manual-review items humanized without forcing skill stage", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-inbox-humanized-")
  );
  const memoryService = new ProjectMemoryService();
  await memoryService.captureCandidate({
    workdir,
    text: "Use este prompt de retomada em uma nova conversa: ```text Projeto: AgendadorConsultasOticas Quero retomar exatamente do estado vivo deste projeto.```",
    promptText: "isso tem que virar skill de projeto",
    source: {
      type: "operator",
      detail: "test"
    },
    evidence: {
      type: "assistant",
      value: "finalized:AgendadorConsultasOticas"
    }
  });

  const { bot } = createDependencies({
    workdir,
    memoryService
  });
  const inboxHandler = bot.commands.get("inbox");
  const callbackHandler = bot.events.get("callback_query");

  assert.ok(inboxHandler);
  assert.ok(callbackHandler);

  const candidatesCtx = createContext("/inbox candidates");
  await inboxHandler!(candidatesCtx);
  assert.match(
    candidatesCtx.replies.at(-1)?.text || "",
    /Pending memory candidates/i
  );
  assert.match(
    candidatesCtx.replies.at(-1)?.text || "",
    /Project resumption prompt/i
  );
  assert.match(candidatesCtx.replies.at(-1)?.text || "", /Fact/i);
  assert.doesNotMatch(
    candidatesCtx.replies.at(-1)?.text || "",
    /Skill candidate/i
  );

  const whyCtx = createContext("", 1, { text: undefined });
  whyCtx.callbackQuery = {
    data: "inbox:why:0"
  };
  await callbackHandler!(whyCtx);

  const whyText = whyCtx.replies.at(-1)?.text || "";
  assert.match(whyText, /Candidate details/i);
  assert.match(whyText, /why review this/i);
  assert.match(whyText, /stage: Durable memory/i);
  assert.doesNotMatch(whyText, /why it matters/i);
});

test("inbox promote shows proposal copy with humanized destination", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-proposal-humanized-")
  );
  const memoryService = new ProjectMemoryService();
  await memoryService.captureCandidate({
    workdir,
    text: "Use este prompt de retomada em uma nova conversa: ```text Projeto: AgendadorConsultasOticas Quero retomar exatamente do estado vivo deste projeto.```",
    promptText: "isso tem que virar skill de projeto",
    source: {
      type: "operator",
      detail: "test"
    },
    evidence: {
      type: "assistant",
      value: "finalized:AgendadorConsultasOticas"
    }
  });

  const { bot } = createDependencies({
    workdir,
    memoryService
  });
  const handler = bot.commands.get("inbox");

  assert.ok(handler);

  const promoteCtx = createContext("/inbox promote 0");
  await handler!(promoteCtx);

  const proposalText = promoteCtx.replies.at(-1)?.text || "";
  assert.match(proposalText, /Proposal ready for review/i);
  assert.match(proposalText, /Project skill/i);
  assert.doesNotMatch(proposalText, /finalized_codex_response/i);
});

test("project command renders structured project status", async () => {
  const { bot } = createDependencies({
    projectStatusExecute: async ({ variant }: { variant?: string }) => ({
      text: `variant: ${variant || "default"}`
    })
  });
  const ctx = createContext("/project next");
  const handler = bot.commands.get("project");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies.at(-1)?.text || "", /variant: next/i);
});

test("project command accepts prompts variant explicitly", async () => {
  const { bot } = createDependencies({
    projectStatusExecute: async ({ variant }: { variant?: string }) => ({
      text: `variant: ${variant || "default"}`
    })
  });
  const ctx = createContext("/project prompts");
  const handler = bot.commands.get("project");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies.at(-1)?.text || "", /variant: prompts/i);
});

test("free text prompt injects relevant skill context before sending to Codex", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-skill-prompt-")
  );

  const { bot, promptCalls } = createDependencies({
    workdir,
    memoryService: {
      buildMemoryPacket: async () => null,
      renderMemoryPacket: (_packet: unknown, prompt: string) => prompt,
      buildSourceDisclosure: () => null,
      listCandidates: async () => [],
      proposePromotion: async () => null,
      discardCandidate: async () => null,
      explainCandidate: async () => null,
      applyPromotion: async () => ({ ok: false, reason: "missing" }),
      cancelProposal: async () => null,
      readOperationalFile: async () => null,
      captureCandidate: async () => null,
      getSkillPromotionService: () => ({
        findRelevantSkills: async () => [
          {
            name: "retomada-projeto",
            relativeSkillPath: "skills/retomada-projeto/SKILL.md",
            snippet: "Leia ACTIVE.md e HANDOFF.md antes de agir.",
            score: 20
          }
        ],
        renderRelevantSkillsPacket: (_skills: unknown[], prompt: string) =>
          [
            "Reusable project skills likely relevant:",
            "- retomada-projeto (skills/retomada-projeto/SKILL.md)",
            "Leia ACTIVE.md e HANDOFF.md antes de agir.",
            "",
            "User request:",
            prompt
          ].join("\n")
      })
    } as any
  });
  const handler = bot.events.get("text");
  assert.ok(handler);

  const ctx = createContext(
    "retome o projeto lendo ACTIVE.md e HANDOFF.md",
    1,
    { text: "retome o projeto lendo ACTIVE.md e HANDOFF.md" }
  );

  await handler!(ctx);

  const firstPrompt = String((promptCalls[0] as any)?.[1] || "");
  assert.match(firstPrompt, /Reusable project skills likely relevant/i);
  assert.match(firstPrompt, /retomada-projeto/i);
});

test("repo command confirms when the project really changed", async () => {
  const { bot, ptyManager } = createDependencies();
  (ptyManager.getStatus as any) = () => ({
    backend: "sdk",
    active: false,
    activeMode: null,
    lastMode: null,
    lastExitCode: null,
    lastExitSignal: null,
    projectSessionId: null,
    preferredModel: null,
    language: "en",
    verboseOutput: false,
    ptySupported: null,
    workdir: "C:/CodexProjetos/ControlePessoal",
    relativeWorkdir: "ControlePessoal",
    workspaceRoot: "C:/CodexProjetos",
    command: "codex",
    mcpServers: [],
    workflowSystem: "superpowers",
    workflowPhase: "none"
  });
  (ptyManager.listProjects as any) = () => [
    {
      name: "AgendadorConsultasOticas",
      path: "C:/CodexProjetos/AgendadorConsultasOticas",
      relativePath: "AgendadorConsultasOticas"
    }
  ];
  (ptyManager.switchWorkdir as any) = () => ({
    workdir: "C:/CodexProjetos/AgendadorConsultasOticas",
    relativePath: "AgendadorConsultasOticas"
  });

  const ctx = createContext("/repo AgendadorConsultasOticas");
  const handler = bot.commands.get("repo");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies[0].text, /Project switched successfully/i);
  assert.match(
    ctx.replies[0].text,
    /active project: AgendadorConsultasOticas/i
  );
});

test("repo command lists clickable shortcuts for available projects", async () => {
  const { bot, ptyManager } = createDependencies();
  (ptyManager.getStatus as any) = () => ({
    backend: "sdk",
    active: false,
    activeMode: null,
    lastMode: null,
    lastExitCode: null,
    lastExitSignal: null,
    projectSessionId: null,
    preferredModel: null,
    language: "en",
    verboseOutput: false,
    ptySupported: null,
    workdir: "C:/CodexProjetos/ControlePessoal",
    relativeWorkdir: "ControlePessoal",
    workspaceRoot: "C:/CodexProjetos",
    command: "codex",
    mcpServers: [],
    workflowSystem: "superpowers",
    workflowPhase: "none"
  });
  (ptyManager.listProjects as any) = () => [
    {
      name: "AgendadorConsultasOticas",
      path: "C:/CodexProjetos/AgendadorConsultasOticas",
      relativePath: "AgendadorConsultasOticas"
    },
    {
      name: "ControlePessoal",
      path: "C:/CodexProjetos/ControlePessoal",
      relativePath: "ControlePessoal"
    }
  ];
  (ptyManager.getRecentProjects as any) = () => [
    {
      relativePath: "ControlePessoal",
      path: "C:/CodexProjetos/ControlePessoal"
    },
    {
      relativePath: "AgendadorConsultasOticas",
      path: "C:/CodexProjetos/AgendadorConsultasOticas"
    }
  ];

  const ctx = createContext("/repo");
  const handler = bot.commands.get("repo");

  assert.ok(handler);
  await handler!(ctx);

  const inlineKeyboard = (
    ctx.replies[0].options?.reply_markup as {
      inline_keyboard?: Array<Array<{ callback_data?: string }>>;
    }
  )?.inline_keyboard;
  assert.equal(
    inlineKeyboard?.[0]?.[0]?.callback_data,
    "repo:switch:AgendadorConsultasOticas"
  );
  assert.equal(
    inlineKeyboard?.[0]?.[1]?.callback_data,
    "repo:switch:ControlePessoal"
  );
});

test("repo command says when the requested project is already active", async () => {
  const { bot, ptyManager } = createDependencies();
  (ptyManager.getStatus as any) = () => ({
    backend: "sdk",
    active: false,
    activeMode: null,
    lastMode: null,
    lastExitCode: null,
    lastExitSignal: null,
    projectSessionId: null,
    preferredModel: null,
    language: "en",
    verboseOutput: false,
    ptySupported: null,
    workdir: "C:/CodexProjetos/AgendadorConsultasOticas",
    relativeWorkdir: "AgendadorConsultasOticas",
    workspaceRoot: "C:/CodexProjetos",
    command: "codex",
    mcpServers: [],
    workflowSystem: "superpowers",
    workflowPhase: "none"
  });
  (ptyManager.listProjects as any) = () => [
    {
      name: "AgendadorConsultasOticas",
      path: "C:/CodexProjetos/AgendadorConsultasOticas",
      relativePath: "AgendadorConsultasOticas"
    }
  ];
  (ptyManager.switchWorkdir as any) = () => ({
    workdir: "C:/CodexProjetos/AgendadorConsultasOticas",
    relativePath: "AgendadorConsultasOticas"
  });

  const ctx = createContext("/repo AgendadorConsultasOticas");
  const handler = bot.commands.get("repo");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies[0].text, /already active/i);
  assert.match(
    ctx.replies[0].text,
    /active project: AgendadorConsultasOticas/i
  );
});

test("project status callback routes the selected variant through the skill", async () => {
  const calls: string[] = [];
  const { bot } = createDependencies({
    projectStatusExecute: async ({ variant }: { variant?: string }) => {
      calls.push(variant || "default");
      return {
        text: `variant: ${variant || "default"}`
      };
    }
  });
  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "project_status:commands"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.deepEqual(calls, ["commands"]);
  assert.match(ctx.replies.at(-1)?.text || "", /variant: commands/i);
});

test("repo callback switches the project explicitly", async () => {
  const { bot, ptyManager } = createDependencies();
  (ptyManager.getStatus as any) = () => ({
    backend: "sdk",
    active: false,
    activeMode: null,
    lastMode: null,
    lastExitCode: null,
    lastExitSignal: null,
    projectSessionId: null,
    preferredModel: null,
    language: "en",
    verboseOutput: false,
    ptySupported: null,
    workdir: "C:/CodexProjetos/ControlePessoal",
    relativeWorkdir: "ControlePessoal",
    workspaceRoot: "C:/CodexProjetos",
    command: "codex",
    mcpServers: [],
    workflowSystem: "superpowers",
    workflowPhase: "none"
  });
  (ptyManager.switchWorkdir as any) = () => ({
    workdir: "C:/CodexProjetos/AgendadorConsultasOticas",
    relativePath: "AgendadorConsultasOticas"
  });

  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "repo:switch:AgendadorConsultasOticas"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    ctx.replies.at(-1)?.text || "",
    /Project switched successfully/i
  );
});

test("project commands callback sends the selected preset to Codex", async () => {
  const prompts: string[] = [];
  const { bot } = createDependencies({
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    }
  });
  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "project_status:command:0"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(prompts[0] || "", /frontend:audit:recurring/i);
});

test("project prompts callback sends the selected ready-made prompt to Codex", async () => {
  const prompts: string[] = [];
  const { bot } = createDependencies({
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    }
  });
  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "project_status:prompt:builtin~0"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(prompts[0] || "", /2 blocos completos em sequencia/i);
  assert.ok(
    ctx.replies.some((reply) => reply.text.includes("Pedido enviado ao Codex"))
  );
});

test("prompts command can add, list, run, and remove custom prompts", async () => {
  const prompts: string[] = [];
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-prompts-handler-")
  );
  const promptLibraryService = new PromptLibraryService();
  const { bot } = createDependencies({
    workdir,
    promptLibraryService,
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    }
  });

  const handler = bot.commands.get("prompts");
  assert.ok(handler);

  const addCtx = createContext(
    "/prompts add planning :: Sprint implementacao :: /plan concordo com voce quero crie os sprint de planejamento de implementacao usando $sprinter"
  );
  await handler!(addCtx);
  assert.match(addCtx.replies.at(-1)?.text || "", /Prompt salvo/i);

  const listCtx = createContext("/prompts");
  await handler!(listCtx);
  const promptLibraryText = listCtx.replies
    .map((reply) => reply.text || "")
    .join("\n");
  assert.match(promptLibraryText, /Biblioteca de Prompts/i);
  assert.match(promptLibraryText, /Execucao/i);
  assert.match(promptLibraryText, /Custom/i);
  assert.match(promptLibraryText, /Sprint implementacao/i);
  assert.match(promptLibraryText, /2 blocos seguidos/i);
  assert.match(promptLibraryText, /tipo: Planejamento/i);
  assert.doesNotMatch(promptLibraryText, /selector:/i);
  assert.doesNotMatch(promptLibraryText, /source:/i);
  assert.doesNotMatch(promptLibraryText, /intent:/i);

  const stored = await promptLibraryService.listPrompts(workdir);
  assert.equal(stored.length, 1);

  const runCtx = createContext(`/prompts run custom:${stored[0]!.id}`);
  await handler!(runCtx);
  assert.match(
    prompts[0] || "",
    /crie os sprint de planejamento de implementacao usando \$sprinter/i
  );

  const runBuiltinByIndexCtx = createContext("/prompts run 1");
  await handler!(runBuiltinByIndexCtx);
  assert.match(prompts[1] || "", /2 blocos completos em sequencia/i);

  const removeCtx = createContext(`/prompts remove custom:${stored[0]!.id}`);
  await handler!(removeCtx);
  assert.match(removeCtx.replies.at(-1)?.text || "", /Prompt removido/i);
  assert.equal((await promptLibraryService.listPrompts(workdir)).length, 0);
});

test("project continue callback sends the planned sprint prompt to Codex", async () => {
  const prompts: string[] = [];
  const { bot } = createDependencies({
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    }
  });
  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "project_status:continue:default"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(prompts[0] || "", /Continue o proximo sprint ja programado/i);
  assert.match(prompts[0] || "", /681-692/i);
  assert.ok(
    ctx.replies.some((reply) => reply.text.includes("Pedido enviado ao Codex"))
  );
});

test("final action plan callback sends a planning prompt from the finalized result", async () => {
  const prompts: string[] = [];
  const { bot } = createDependencies({
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    },
    audioSummaryManager: {
      isEnabled: () => true,
      createSummaryRequest: () => "req-1",
      resolveRequest: () => ({
        chatId: "1",
        text: "Bloco concluido com sucesso e pronto para o proximo sprint.",
        workdir: "C:/CodexProjetos/AgendadorConsultasOticas",
        createdAt: Date.now()
      }),
      offerForContext: async () => false,
      offerFinalActionsForChat: async () => false,
      sendSummaryForChat: async () => false,
      handleCallback: async () => false
    }
  });
  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "final_action:plan:req-1"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(prompts[0] || "", /Planning mode only/i);
  assert.match(prompts[0] || "", /Bloco concluido com sucesso/i);
  assert.ok(
    ctx.replies.some((reply) => reply.text.includes("Pedido enviado ao Codex"))
  );
});

test("final action execute callback sends an approval prompt from the finalized result", async () => {
  const prompts: string[] = [];
  const { bot } = createDependencies({
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    },
    audioSummaryManager: {
      isEnabled: () => true,
      createSummaryRequest: () => "req-1",
      resolveRequest: () => ({
        chatId: "1",
        text: "Implementacao aprovada e sprint encerrado.",
        workdir: "C:/CodexProjetos/AgendadorConsultasOticas",
        createdAt: Date.now()
      }),
      offerForContext: async () => false,
      offerFinalActionsForChat: async () => false,
      sendSummaryForChat: async () => false,
      handleCallback: async () => false
    }
  });
  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "final_action:execute:req-1"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    prompts[0] || "",
    /approval for exactly one follow-up execution scoped to the finalized conclusion/i
  );
  assert.match(
    prompts[0] || "",
    /Do not reinterpret this click as blanket approval for unrelated work, a new meeting, or a full replan/i
  );
  assert.match(
    prompts[0] || "",
    /Execute only the next eligible block or next concrete implementation step/i
  );
  assert.match(prompts[0] || "", /Implementacao aprovada e sprint encerrado/i);
  assert.ok(
    ctx.replies.some((reply) => reply.text.includes("Pedido enviado ao Codex"))
  );
});

test("final action review callback sends a specialist review prompt from the finalized result", async () => {
  const prompts: string[] = [];
  const { bot } = createDependencies({
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    },
    audioSummaryManager: {
      isEnabled: () => true,
      createSummaryRequest: () => "req-1",
      resolveRequest: () => ({
        chatId: "1",
        text: "Existe tensao de governanca entre candidate e skill real.",
        workdir: "C:/CodexProjetos/AgendadorConsultasOticas",
        createdAt: Date.now()
      }),
      offerForContext: async () => false,
      offerFinalActionsForChat: async () => false,
      sendSummaryForChat: async () => false,
      handleCallback: async () => false
    }
  });
  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "final_action:review:req-1"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(prompts[0] || "", /Faca uma reuniao com especialistas/i);
  assert.match(prompts[0] || "", /Existe tensao de governanca/i);
});

test("final action organize callback opens the inbox overview for the stored workdir", async () => {
  const { bot } = createDependencies({
    audioSummaryManager: {
      isEnabled: () => true,
      createSummaryRequest: () => "req-1",
      resolveRequest: () => ({
        chatId: "1",
        text: "Implementacao aprovada e sprint encerrado.",
        workdir: "C:/CodexProjetos/AgendadorConsultasOticas",
        createdAt: Date.now()
      }),
      offerForContext: async () => false,
      offerFinalActionsForChat: async () => false,
      sendSummaryForChat: async () => false,
      handleCallback: async () => false
    },
    memoryService: {
      buildMemoryPacket: async () => null,
      renderMemoryPacket: (_packet: unknown, prompt: string) => prompt,
      buildSourceDisclosure: () => "",
      listCandidates: async () => [],
      listProposals: async () => [],
      proposePromotion: async () => null,
      discardCandidate: async () => null,
      explainCandidate: async () => null,
      applyPromotion: async () => ({ ok: false, reason: "missing" }),
      cancelProposal: async () => null,
      readOperationalFile: async () => null,
      captureCandidate: async () => null
    } as any
  });
  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "final_action:organize:req-1"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.ok(
    ctx.replies.some((reply) =>
      /No pending memory candidates or proposals|Nenhum/i.test(reply.text || "")
    )
  );
});

test("menu callback project opens the project card", async () => {
  const calls: string[] = [];
  const { bot } = createDependencies({
    projectStatusExecute: async ({ variant }: { variant?: string }) => {
      calls.push(variant || "default");
      return {
        text: `variant: ${variant || "default"}`
      };
    }
  });
  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "menu:project"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.deepEqual(calls, ["default"]);
});

test("queue command lists the current queue", async () => {
  const { bot } = createDependencies({
    listPromptQueue: () => [
      {
        id: "queue-1",
        index: 1,
        text: "revisar email",
        relativeWorkdir: "ControlePessoal",
        createdAt: new Date().toISOString()
      }
    ]
  });
  const ctx = createContext("/queue");
  const handler = bot.commands.get("queue");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies[0].text, /revisar email/i);
  assert.match(ctx.replies[0].text, /ControlePessoal/i);
  const inlineKeyboard = (
    ctx.replies[0].options?.reply_markup as {
      inline_keyboard?: Array<Array<{ text?: string }>>;
    }
  )?.inline_keyboard;
  assert.deepEqual(
    inlineKeyboard?.[0]?.map((button) => button.text),
    ["▶️ Rodar proximo", "🔄 Atualizar"]
  );
});

test("queue run executes the next queued item", async () => {
  const { bot } = createDependencies({
    runNextQueuedPrompt: async () => ({
      started: true,
      mode: "sdk"
    })
  });
  const ctx = createContext("/queue run");
  const handler = bot.commands.get("queue");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(ctx.replies.length, 1);
});

test("queue callback run executes the next queued item", async () => {
  const { bot } = createDependencies({
    runNextQueuedPrompt: async () => ({
      started: true,
      mode: "sdk"
    })
  });
  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "queue:run"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(ctx.replies.length, 2);
  assert.match(ctx.replies[0].text, /Status refreshed/i);
  assert.match(
    ctx.replies[1].text,
    /Queued item sent to Codex|Item da fila enviado ao Codex/i
  );
});

test("queue callback remove deletes an item and refreshes the queue", async () => {
  const { bot } = createDependencies({
    listPromptQueue: () => [],
    removeQueuedPrompt: () => ({
      ok: true,
      removed: {
        id: "queue-1",
        text: "revisar email"
      },
      count: 0
    })
  });
  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "queue:remove:queue-1"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies[0].text, /Status refreshed/i);
  assert.match(ctx.replies[1].text, /revisar email/i);
  assert.match(ctx.replies[2].text, /fila deste chat esta vazia/i);
});

test("voice handler transcribes audio and forwards transcript to Codex", async () => {
  const prompts: string[] = [];
  const { bot } = createDependencies({
    audioTranscribe: async () => ({
      text: "pesquise aonde fica o projeto controle pessoal",
      fileName: "voice-note.ogg"
    }),
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    }
  });
  const ctx = createContext("", 1, {
    text: undefined,
    voice: {
      file_id: "voice-id",
      mime_type: "audio/ogg"
    }
  });
  const handler = bot.events.get("voice");

  assert.ok(handler);
  await handler!(ctx);

  assert.deepEqual(prompts, ["pesquise aonde fica o projeto controle pessoal"]);
});

test("image handler forwards images to Codex even without caption", async () => {
  const promptPayloads: unknown[] = [];
  const { bot } = createDependencies({
    sendPrompt: async (_ctx: unknown, prompt: unknown) => {
      promptPayloads.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    }
  });
  const ctx = createContext("", 1, {
    text: undefined,
    photo: [{ file_id: "photo-id" }]
  });
  const handler = bot.events.get("photo");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(Array.isArray(promptPayloads[0]), true);
  const payload = promptPayloads[0] as Array<{ type: string; text?: string }>;
  assert.equal(payload[0]?.type, "text");
  assert.match(
    payload[0]?.text || "",
    /Analise esta imagem enviada no Telegram/i
  );
});
