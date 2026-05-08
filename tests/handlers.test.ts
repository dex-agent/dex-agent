import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { registerHandlers } from "../src/bot/handlers.js";
import { AdminWebServer } from "../src/lib/adminWebServer.js";
import { ProjectMemoryService } from "../src/orchestrator/memoryService.js";
import { PromptLibraryService } from "../src/orchestrator/promptLibraryService.js";

const DISABLE_GLOBAL_MEMORY = { globalMemoriesRoot: null } as const;

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
      getLatestFinalActionText?(
        chatId: string | number,
        workdir?: string
      ): string | null;
    };
    workdir?: string;
    memoryService?: ProjectMemoryService;
    promptLibraryService?: PromptLibraryService;
    dashboardAdminService?: {
      inspect(workdir: string): Promise<{
        workdir: string;
        modules: Array<{
          key: "prompts" | "history" | "operation" | "settings";
          label: string;
          status: "enabled" | "planned";
          mode: "editable" | "read-only";
          reason: string | null;
        }>;
        prompts: {
          items: Array<{
            source: "builtin" | "custom";
            selector?: string;
            label?: string;
            intent?: string;
            removable?: boolean;
          }>;
          capabilities: string[];
        };
        history: {
          candidates: unknown[];
          proposals: unknown[];
          capabilities: string[];
        };
        operation: {
          enabled: false;
          reason: string;
        };
        settings: {
          enabled: false;
          reason: string;
        };
      }>;
    };
    adminWebServer?: {
      getLink(workdir: string): Promise<string>;
    };
    adminActions?: {
      restart?: () => Promise<void>;
    } | null;
    operationalContinuationState?: Record<string, unknown>;
    instance?: {
      contextMode: "workspace" | "instance";
      id: string;
      projectLabel: string;
    };
  } = {}
) {
  const bot = new FakeBot();
  const promptCalls: unknown[] = [];
  const workdir = overrides.workdir || process.cwd();
  const defaultProjectState = {
    lastSessionId: "",
    lastMode: null,
    lastExitCode: null,
    lastExitSignal: null,
    lastWorkflowPhase: null,
    lastPromptText: null,
    lastPromptAt: null,
    lastFinalResponseText: null as string | null,
    lastFinalizedAt: null as string | null
  };
  const ptyManager = {
    config: {
      runner: {
        cwd: workdir
      },
      instance: overrides.instance || {
        contextMode: "workspace",
        id: "dex-agent",
        projectLabel: path.basename(workdir)
      }
    },
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
      preferredReasoningEffort: null,
      language: "en",
      verboseOutput: false,
      specialAutopilotEnabled: false,
      specialAutopilotRemainingResponses: 0,
      ptySupported: null,
      workdir,
      relativeWorkdir: ".",
      workspaceRoot: workdir,
      command: "codex",
      mcpServers: [],
      instance: overrides.instance || {
        contextMode: "workspace",
        id: "dex-agent",
        projectLabel: path.basename(workdir)
      },
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
    setPreferredReasoningEffort: () => "medium",
    clearPreferredReasoningEffort: () => {},
    getSpecialAutopilotStatus: () => ({
      enabled: false,
      remainingResponses: 0
    }),
    setSpecialAutopilot: (_chatId: number, remainingResponses: number) => ({
      enabled: remainingResponses > 0,
      remainingResponses
    }),
    clearSpecialAutopilot: () => ({
      enabled: false,
      remainingResponses: 0
    }),
    consumeSpecialAutopilotStep: () => ({
      enabled: false,
      remainingResponses: 0
    }),
    getProjectState: () => defaultProjectState,
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
      lastFinalizedAt: null,
      ...(overrides.operationalContinuationState || {})
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
            projectName: "ProjetoAlphaTeste",
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
    dashboardAdminService: overrides.dashboardAdminService as any,
    adminWebServer:
      overrides.adminWebServer ||
      ({
        getLink: async (workdir: string) =>
          `http://127.0.0.1:3999/admin?workdir=${encodeURIComponent(workdir)}`
      } satisfies Pick<AdminWebServer, "getLink">),
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
    instance: overrides.instance,
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

test("plan command attaches latest finalized action text for contextual planning", async () => {
  const latestReview = [
    "Finding 1:",
    "- Premissa: cadastro perde resposta factual quando valor vem junto com endereco solto.",
    "- Prioridade: P1",
    "",
    "Finding 2:",
    "- Premissa: smoke de nome salvo passa sem validar reaproveitamento.",
    "- Prioridade: P2"
  ].join("\n");
  const { bot, promptCalls } = createDependencies({
    audioSummaryManager: {
      isEnabled: () => false,
      createSummaryRequest: () => null,
      resolveRequest: () => null,
      offerForContext: async () => false,
      offerFinalActionsForChat: async () => false,
      sendSummaryForChat: async () => false,
      handleCallback: async () => false,
      getLatestFinalActionText: () => latestReview
    }
  });
  const ctx = createContext(
    "/plan modo Planejamento consolidar tudo que ja foi levantado nos achados em cima daqui"
  );
  const handler = bot.commands.get("plan");

  assert.ok(handler);
  await handler!(ctx);

  const prompt = String((promptCalls[0] as unknown[])[1] || "");
  assert.match(prompt, /Immediate conversation context/i);
  assert.match(prompt, /primary source/i);
  assert.match(prompt, /Finding 1:/i);
  assert.match(prompt, /cadastro perde resposta factual/i);
  assert.match(prompt, /Finding 2:/i);
  assert.match(prompt, /do not replace the current planning target/i);
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

test("reasoning command shows the current chat preference", async () => {
  const { bot, ptyManager } = createDependencies();
  (ptyManager.getLanguage as any) = () => "pt-BR";
  (ptyManager.getStatus as any) = () => ({
    backend: "sdk",
    active: false,
    activeMode: null,
    lastMode: null,
    lastExitCode: null,
    lastExitSignal: null,
    projectSessionId: null,
    preferredModel: null,
    preferredReasoningEffort: "xhigh",
    language: "pt-BR",
    verboseOutput: false,
    ptySupported: null,
    workdir: process.cwd(),
    relativeWorkdir: ".",
    workspaceRoot: process.cwd(),
    command: "codex",
    mcpServers: [],
    workflowSystem: "superpowers",
    workflowPhase: "none"
  });
  const ctx = createContext("/reasoning", 1);
  const handler = bot.commands.get("reasoning");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies.at(-1)?.text || "", /Alt/i);
});

test("reasoning command accepts portuguese aliases and rebuilds the session", async () => {
  let applied: string | null = null;
  let closedCalls = 0;
  const { bot, ptyManager } = createDependencies();
  (ptyManager.getLanguage as any) = () => "pt-BR";
  (ptyManager.setPreferredReasoningEffort as any) = (
    _chatId: number,
    effort: string
  ) => {
    applied = effort;
    return effort;
  };
  (ptyManager.closeSession as any) = () => {
    closedCalls += 1;
    return true;
  };
  const ctx = createContext("/raciocinio altissimo", 1);
  const handler = bot.commands.get("raciocinio");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(applied, "xhigh");
  assert.equal(closedCalls, 1);
  assert.match(
    ctx.replies.at(-1)?.text || "",
    /sessao atual foi reconstruida/i
  );
  assert.match(ctx.replies.at(-1)?.text || "", /Alt/i);
});

test("reasoning command resets to the default", async () => {
  let cleared = 0;
  let closedCalls = 0;
  const { bot, ptyManager } = createDependencies();
  (ptyManager.getLanguage as any) = () => "pt-BR";
  (ptyManager.clearPreferredReasoningEffort as any) = () => {
    cleared += 1;
  };
  (ptyManager.closeSession as any) = () => {
    closedCalls += 1;
    return true;
  };
  const ctx = createContext("/reasoning reset", 1);
  const handler = bot.commands.get("reasoning");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(cleared, 1);
  assert.equal(closedCalls, 1);
  assert.match(ctx.replies.at(-1)?.text || "", /padrao do Codex/i);
});

test("autopilot command shows the current special autopilot status", async () => {
  const { bot, ptyManager } = createDependencies();
  (ptyManager.getLanguage as any) = () => "pt-BR";
  (ptyManager.getSpecialAutopilotStatus as any) = () => ({
    enabled: true,
    remainingResponses: 4
  });
  const ctx = createContext("/autopilot", 1);
  const handler = bot.commands.get("autopilot");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies.at(-1)?.text || "", /ligado/i);
  assert.match(ctx.replies.at(-1)?.text || "", /4/i);
});

test("autopilot command arms the special autopilot for a fixed number of finalized responses", async () => {
  let applied: number | null = null;
  const { bot, ptyManager } = createDependencies();
  (ptyManager.getLanguage as any) = () => "pt-BR";
  (ptyManager.setSpecialAutopilot as any) = (
    _chatId: number,
    remainingResponses: number
  ) => {
    applied = remainingResponses;
    return {
      enabled: true,
      remainingResponses
    };
  };
  const ctx = createContext("/autopilot 3", 1);
  const handler = bot.commands.get("autopilot");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(applied, 3);
  assert.match(ctx.replies.at(-1)?.text || "", /3 resposta/i);
});

test("autopilot command accepts the portuguese alias and can disable the special mode", async () => {
  let cleared = 0;
  const { bot, ptyManager } = createDependencies();
  (ptyManager.getLanguage as any) = () => "pt-BR";
  (ptyManager.clearSpecialAutopilot as any) = () => {
    cleared += 1;
    return {
      enabled: false,
      remainingResponses: 0
    };
  };
  const ctx = createContext("/piloto off", 1);
  const handler = bot.commands.get("piloto");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(cleared, 1);
  assert.match(ctx.replies.at(-1)?.text || "", /desligado/i);
});

test("autopilot resume continues from the last finalized response and consumes one configured step", async () => {
  const prompts: string[] = [];
  let remainingResponses = 2;
  const { bot, ptyManager } = createDependencies({
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    }
  });
  (ptyManager.getLanguage as any) = () => "pt-BR";
  (ptyManager.getSpecialAutopilotStatus as any) = () => ({
    enabled: remainingResponses > 0,
    remainingResponses
  });
  (ptyManager.consumeSpecialAutopilotStep as any) = () => {
    remainingResponses = Math.max(0, remainingResponses - 1);
    return {
      enabled: remainingResponses > 0,
      remainingResponses
    };
  };
  (ptyManager.getProjectState as any) = () => ({
    lastFinalResponseText:
      "Proximo passo: continuar exatamente do ponto salvo do sprint.",
    lastFinalizedAt: "2026-04-23T12:00:00.000Z"
  });
  (ptyManager.getOperationalContinuationState as any) = () => ({
    active: false,
    activeMode: null,
    workflowPhase: "none",
    workdir: process.cwd(),
    relativeWorkdir: ".",
    pendingPromptText: null,
    queuedItems: [],
    lastPromptText: null,
    lastPromptAt: null,
    lastFinalResponseText:
      "Proximo passo: continuar exatamente do ponto salvo do sprint.",
    lastFinalizedAt: "2026-04-23T12:00:00.000Z"
  });

  const ctx = createContext("/autopilot resume", 1);
  const handler = bot.commands.get("autopilot");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(prompts.length, 1);
  assert.match(prompts[0] || "", /autopilot execution run/i);
  assert.match(prompts[0] || "", /ponto salvo do sprint/i);
  assert.equal(remainingResponses, 1);
  assert.ok(
    ctx.replies.some((reply) =>
      /Retomada do piloto automatico enviada ao Codex/i.test(reply.text || "")
    )
  );
  assert.ok(
    ctx.replies.some((reply) => /Restantes: 1/i.test(reply.text || ""))
  );
});

test("autopilot resume requires the special autopilot to be armed", async () => {
  const prompts: string[] = [];
  const { bot, ptyManager } = createDependencies({
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    }
  });
  (ptyManager.getLanguage as any) = () => "pt-BR";

  const ctx = createContext("/piloto retomar", 1);
  const handler = bot.commands.get("piloto");

  assert.ok(handler);
  await handler!(ctx);

  assert.deepEqual(prompts, []);
  assert.match(ctx.replies.at(-1)?.text || "", /nao esta armado/i);
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
  assert.ok(
    inlineKeyboard?.some((row) =>
      row.some((button) => button.callback_data === "menu:admin")
    )
  );
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
        workdir: "C:/CodexProjetos/ProjetoAlphaTeste",
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
    workdir: "C:/CodexProjetos/ProjetoAlphaTeste",
    relativeWorkdir: "ProjetoAlphaTeste",
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
        relativeWorkdir: "ProjetoAlphaTeste",
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
        relativeWorkdir: "ProjetoAlphaTeste",
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

test("operational next-step question routes to project status next instead of Codex", async () => {
  const prompts: string[] = [];
  const projectStatusCalls: Array<{ variant?: string; workdir?: string }> = [];
  const { bot } = createDependencies({
    workdir: "C:/CodexProjetos/ProjetoAlphaTeste",
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    },
    projectStatusExecute: async (args: {
      variant?: string;
      workdir?: string;
    }) => {
      projectStatusCalls.push(args);
      return {
        text: `project status variant: ${args.variant || "default"}`
      };
    }
  });
  const ctx = createContext("qual o proximo passo seguro?");
  const handler = bot.events.get("text");

  assert.ok(handler);
  await handler!(ctx);

  assert.deepEqual(prompts, []);
  assert.equal(projectStatusCalls.length, 1);
  assert.equal(projectStatusCalls[0]?.variant, "next");
  assert.equal(
    projectStatusCalls[0]?.workdir,
    "C:/CodexProjetos/ProjetoAlphaTeste"
  );
  assert.match(ctx.replies.at(-1)?.text || "", /project status variant: next/i);
});

test("operational next-step question ignores contaminated recent context", async () => {
  const prompts: string[] = [];
  const projectStatusCalls: Array<{ variant?: string }> = [];
  const { bot, ptyManager } = createDependencies({
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: true,
        mode: "sdk"
      };
    },
    projectStatusExecute: async (args: { variant?: string }) => {
      projectStatusCalls.push(args);
      return {
        text: "project status next from canonical state"
      };
    }
  });
  (ptyManager.getOperationalContinuationState as any) = () => ({
    active: false,
    activeMode: null,
    workflowPhase: "none",
    workdir: process.cwd(),
    relativeWorkdir: ".",
    pendingPromptText: null,
    queuedItems: [],
    lastPromptText: "envie exatamente: qual o proximo passo seguro?",
    lastPromptAt: new Date().toISOString(),
    lastFinalResponseText:
      "Recomendado: enviar novamente qual o proximo passo seguro?",
    lastFinalizedAt: new Date().toISOString()
  });
  const ctx = createContext("qual o proximo passo seguro?");
  const handler = bot.events.get("text");

  assert.ok(handler);
  await handler!(ctx);

  assert.deepEqual(prompts, []);
  assert.equal(projectStatusCalls.length, 1);
  assert.equal(projectStatusCalls[0]?.variant, "next");
  assert.match(
    ctx.replies.at(-1)?.text || "",
    /project status next from canonical state/i
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
    workdir: "C:/CodexProjetos/ProjetoAlphaTeste",
    relativeWorkdir: "ProjetoAlphaTeste",
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
    workdir: "C:/CodexProjetos/ProjetoAlphaTeste",
    relativeWorkdir: "ProjetoAlphaTeste",
    pendingPromptText: null,
    queuedItems: [],
    lastPromptText: "continue a bateria viva",
    lastPromptAt: new Date(Date.now() - 30_000).toISOString(),
    lastFinalResponseText: null,
    lastFinalizedAt: null
  });
  (ptyManager.getRecentProjects as any) = () => [
    {
      relativePath: "ProjetoAlphaTeste",
      path: "C:/CodexProjetos/ProjetoAlphaTeste"
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
        relativeWorkdir: "ProjetoAlphaTeste",
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
  const memoryService = new ProjectMemoryService(
    undefined,
    DISABLE_GLOBAL_MEMORY
  );
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
  const memoryService = new ProjectMemoryService(
    undefined,
    DISABLE_GLOBAL_MEMORY
  );
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
  const memoryService = new ProjectMemoryService(
    undefined,
    DISABLE_GLOBAL_MEMORY
  );
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
  const memoryService = new ProjectMemoryService(
    undefined,
    DISABLE_GLOBAL_MEMORY
  );
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
  const memoryService = new ProjectMemoryService(
    undefined,
    DISABLE_GLOBAL_MEMORY
  );
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
  const memoryService = new ProjectMemoryService(
    undefined,
    DISABLE_GLOBAL_MEMORY
  );
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
  const memoryService = new ProjectMemoryService(
    undefined,
    DISABLE_GLOBAL_MEMORY
  );
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
  const memoryService = new ProjectMemoryService(
    undefined,
    DISABLE_GLOBAL_MEMORY
  );
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
  const memoryService = new ProjectMemoryService(
    undefined,
    DISABLE_GLOBAL_MEMORY
  );
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
  const memoryService = new ProjectMemoryService(
    undefined,
    DISABLE_GLOBAL_MEMORY
  );
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
  const memoryService = new ProjectMemoryService(
    undefined,
    DISABLE_GLOBAL_MEMORY
  );
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
  const memoryService = new ProjectMemoryService(
    undefined,
    DISABLE_GLOBAL_MEMORY
  );
  await memoryService.captureCandidate({
    workdir,
    text: "Use este prompt de retomada em uma nova conversa: ```text Projeto: ProjetoAlphaTeste Quero retomar exatamente do estado vivo deste projeto.```",
    promptText: "isso tem que virar skill de projeto",
    source: {
      type: "operator",
      detail: "test"
    },
    evidence: {
      type: "assistant",
      value: "finalized:ProjetoAlphaTeste"
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
  const memoryService = new ProjectMemoryService(
    undefined,
    DISABLE_GLOBAL_MEMORY
  );
  await memoryService.captureCandidate({
    workdir,
    text: "Use este prompt de retomada em uma nova conversa: ```text Projeto: ProjetoAlphaTeste Quero retomar exatamente do estado vivo deste projeto.```",
    promptText: "isso tem que virar skill de projeto",
    source: {
      type: "operator",
      detail: "test"
    },
    evidence: {
      type: "assistant",
      value: "finalized:ProjetoAlphaTeste"
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
    workdir: "C:/CodexProjetos/ProjetoBetaTeste",
    relativeWorkdir: "ProjetoBetaTeste",
    workspaceRoot: "C:/CodexProjetos",
    command: "codex",
    mcpServers: [],
    workflowSystem: "superpowers",
    workflowPhase: "none"
  });
  (ptyManager.listProjects as any) = () => [
    {
      name: "ProjetoAlphaTeste",
      path: "C:/CodexProjetos/ProjetoAlphaTeste",
      relativePath: "ProjetoAlphaTeste"
    }
  ];
  (ptyManager.switchWorkdir as any) = () => ({
    workdir: "C:/CodexProjetos/ProjetoAlphaTeste",
    relativePath: "ProjetoAlphaTeste"
  });

  const ctx = createContext("/repo ProjetoAlphaTeste");
  const handler = bot.commands.get("repo");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies[0].text, /Project switched successfully/i);
  assert.match(ctx.replies[0].text, /active project: ProjetoAlphaTeste/i);
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
    workdir: "C:/CodexProjetos/ProjetoBetaTeste",
    relativeWorkdir: "ProjetoBetaTeste",
    workspaceRoot: "C:/CodexProjetos",
    command: "codex",
    mcpServers: [],
    workflowSystem: "superpowers",
    workflowPhase: "none"
  });
  (ptyManager.listProjects as any) = () => [
    {
      name: "ProjetoAlphaTeste",
      path: "C:/CodexProjetos/ProjetoAlphaTeste",
      relativePath: "ProjetoAlphaTeste"
    },
    {
      name: "ProjetoBetaTeste",
      path: "C:/CodexProjetos/ProjetoBetaTeste",
      relativePath: "ProjetoBetaTeste"
    }
  ];
  (ptyManager.getRecentProjects as any) = () => [
    {
      relativePath: "ProjetoBetaTeste",
      path: "C:/CodexProjetos/ProjetoBetaTeste"
    },
    {
      relativePath: "ProjetoAlphaTeste",
      path: "C:/CodexProjetos/ProjetoAlphaTeste"
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
    "repo:switch:ProjetoAlphaTeste"
  );
  assert.equal(
    inlineKeyboard?.[0]?.[1]?.callback_data,
    "repo:switch:ProjetoBetaTeste"
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
    workdir: "C:/CodexProjetos/ProjetoAlphaTeste",
    relativeWorkdir: "ProjetoAlphaTeste",
    workspaceRoot: "C:/CodexProjetos",
    command: "codex",
    mcpServers: [],
    workflowSystem: "superpowers",
    workflowPhase: "none"
  });
  (ptyManager.listProjects as any) = () => [
    {
      name: "ProjetoAlphaTeste",
      path: "C:/CodexProjetos/ProjetoAlphaTeste",
      relativePath: "ProjetoAlphaTeste"
    }
  ];
  (ptyManager.switchWorkdir as any) = () => ({
    workdir: "C:/CodexProjetos/ProjetoAlphaTeste",
    relativePath: "ProjetoAlphaTeste"
  });

  const ctx = createContext("/repo ProjetoAlphaTeste");
  const handler = bot.commands.get("repo");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies[0].text, /already active/i);
  assert.match(ctx.replies[0].text, /active project: ProjetoAlphaTeste/i);
});

test("repo command is blocked in fixed instance mode", async () => {
  const { bot, ptyManager } = createDependencies({
    instance: {
      contextMode: "instance",
      id: "projeto-alpha-teste",
      projectLabel: "ProjetoAlphaTeste"
    }
  });
  let switchCalls = 0;
  (ptyManager.switchWorkdir as any) = () => {
    switchCalls += 1;
    return {
      workdir: "C:/CodexProjetos/ProjetoBetaTeste",
      relativePath: "ProjetoBetaTeste"
    };
  };

  const ctx = createContext("/repo ProjetoBetaTeste");
  const handler = bot.commands.get("repo");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(switchCalls, 0);
  assert.match(ctx.replies[0].text, /fixed to one project/i);
  assert.match(ctx.replies[0].text, /ProjetoAlphaTeste/);
});

test("repo callback is blocked in fixed instance mode", async () => {
  const { bot, ptyManager } = createDependencies({
    instance: {
      contextMode: "instance",
      id: "projeto-alpha-teste",
      projectLabel: "ProjetoAlphaTeste"
    }
  });
  let switchCalls = 0;
  (ptyManager.switchWorkdir as any) = () => {
    switchCalls += 1;
    return {
      workdir: "C:/CodexProjetos/ProjetoBetaTeste",
      relativePath: "ProjetoBetaTeste"
    };
  };

  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "repo:switch:ProjetoBetaTeste"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(switchCalls, 0);
  assert.match(ctx.replies.at(-1)?.text || "", /fixed to one project/i);
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
    workdir: "C:/CodexProjetos/ProjetoBetaTeste",
    relativeWorkdir: "ProjetoBetaTeste",
    workspaceRoot: "C:/CodexProjetos",
    command: "codex",
    mcpServers: [],
    workflowSystem: "superpowers",
    workflowPhase: "none"
  });
  (ptyManager.switchWorkdir as any) = () => ({
    workdir: "C:/CodexProjetos/ProjetoAlphaTeste",
    relativePath: "ProjetoAlphaTeste"
  });

  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "repo:switch:ProjetoAlphaTeste"
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

test("project prompt retomada preset uses index-first recovery order", async () => {
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
    data: "project_status:prompt:builtin~28"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(prompts[0] || "", /Leia primeiro INDEX\.md/i);
  assert.match(prompts[0] || "", /AGENTS\.md se existir/i);
  assert.match(prompts[0] || "", /INDEX\.md local relevante/i);
  assert.match(
    prompts[0] || "",
    /ACTIVE\.md, HANDOFF\.md, \.codex\/napkin\.md/i
  );
  assert.match(
    prompts[0] || "",
    /\.agents\/sprints\/INDEX\.md quando houver sprint\/bloco/i
  );
  assert.match(
    prompts[0] || "",
    /\.agents\/ESTACIONAMENTO\.md quando houver residuo\/reabertura/i
  );
  assert.match(prompts[0] || "", /MEMORY\.ndjson como ledger/i);
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
        text: [
          "Bloco concluido com sucesso e pronto para o proximo sprint.",
          "",
          "**Proximo passo**",
          "Abrir explicitamente outro bloco.",
          "",
          "**Proximo especialista indicado**",
          "$sprinter"
        ].join("\n"),
        workdir: "C:/CodexProjetos/ProjetoAlphaTeste",
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
    data: "final_action:pl:req-1"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(prompts[0] || "", /Planning mode only/i);
  assert.match(prompts[0] || "", /Modo planejamento usando \$sprinter/i);
  assert.match(prompts[0] || "", /planejamento de bloco e sprints detalhados/i);
  assert.match(
    prompts[0] || "",
    /Restart protocol now, Suggested commands, Next queue, First steps if resuming now e Progress snapshot/i
  );
  assert.match(
    prompts[0] || "",
    /INDEX\.md raiz -> AGENTS\.md -> INDEX\.md local relevante -> arquivo alvo -> ACTIVE\.md \+ HANDOFF\.md/i
  );
  assert.match(prompts[0] || "", /\.codex\/napkin\.md/i);
  assert.match(
    prompts[0] || "",
    /\.agents\/ESTACIONAMENTO\.md quando houver residuo\/reabertura/i
  );
  assert.match(prompts[0] || "", /\.agents\/MEMORY\.ndjson como ledger/i);
  assert.match(prompts[0] || "", /\.agents\/sprints\/INDEX\.md/i);
  assert.match(prompts[0] || "", /Markdown parseavel canonico/i);
  assert.match(prompts[0] || "", /Nao use MEMORY\/ como destino novo/i);
  assert.match(
    prompts[0] || "",
    /Todo plano deve terminar com Proximo passo e Proximo especialista indicado/i
  );
  assert.match(prompts[0] || "", /\$sprinter/i);
  assert.match(prompts[0] || "", /Bloco concluido com sucesso/i);
  assert.ok(
    ctx.replies.some((reply) =>
      /Transform into planning received/i.test(reply.text || "")
    )
  );
  assert.ok(
    ctx.replies.some((reply) => reply.text.includes("Pedido enviado ao Codex"))
  );
});

test("final action handoff callback routes one cut to the next specialist", async () => {
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
        text: [
          "A implementacao precisa de revisao antes de seguir.",
          "",
          "**Proximo passo**",
          "Revisar os diffs do CTA final.",
          "",
          "**Proximo especialista indicado**",
          "Renata Review"
        ].join("\n"),
        workdir: "C:/CodexProjetos/ProjetoAlphaTeste",
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
    data: "final_action:sp:req-1"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(prompts[0] || "", /encaminhamento de um unico proximo corte/i);
  assert.match(prompts[0] || "", /\$ancora-fluxo/i);
  assert.match(prompts[0] || "", /Renata Review/i);
  assert.match(prompts[0] || "", /Nao replaneje o bloco/i);
  assert.match(prompts[0] || "", /Seguir, segurar ou retornar/i);
  assert.ok(
    ctx.replies.some((reply) =>
      /Send to Renata Review received/i.test(reply.text || "")
    )
  );
  assert.ok(
    ctx.replies.some((reply) =>
      /Callback do botao Encaminhar para Renata Review recebido/i.test(
        reply.text || ""
      )
    )
  );
  assert.ok(
    ctx.replies.some((reply) =>
      /Pedido enviado ao Codex/i.test(reply.text || "")
    )
  );
});

test("final action continue short callback sends a safe next-step prompt from the finalized result", async () => {
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
        text: [
          "Implementacao aprovada e sprint encerrado.",
          "",
          "**Proximo passo**",
          "Comecar pela fase 1 com o garimpeiro."
        ].join("\n"),
        workdir: "C:/CodexProjetos/ProjetoAlphaTeste",
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
    data: "final_action:c1:req-1"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    prompts[0] || "",
    /approval for exactly one small and safe follow-up execution scoped to the finalized conclusion/i
  );
  assert.match(
    prompts[0] || "",
    /Execute exactly this next safe step if it is still valid: Comecar pela fase 1 com o garimpeiro\./i
  );
  assert.match(
    prompts[0] || "",
    /Do not reinterpret this click as blanket approval for unrelated work, a new meeting, or a full replan/i
  );
  assert.match(prompts[0] || "", /Implementacao aprovada e sprint encerrado/i);
  assert.ok(
    ctx.replies.some((reply) =>
      /Short continue received/i.test(reply.text || "")
    )
  );
  assert.ok(
    ctx.replies.some((reply) =>
      /Callback do botao Proximo passo recebido/i.test(reply.text || "")
    )
  );
  assert.ok(
    ctx.replies.some((reply) =>
      /Botao Proximo passo acionado/i.test(reply.text || "")
    )
  );
});

test("final action continue short callback pulls suggested specialists from the finalized result when present", async () => {
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
        text: [
          "**Current block status**",
          "- Nome: `ux Telegram - poluicao visual residual`",
          "- sugestao_especialistas_sessao: `organizador-ao-vivo`, `questionador`, `chato`"
        ].join("\n"),
        workdir: "C:/CodexProjetos/dex-agent",
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
    data: "final_action:c1:req-1"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    prompts[0] || "",
    /Adicione os especialistas sugeridos para sessao antes de executar/i
  );
  assert.match(prompts[0] || "", /organizador-ao-vivo/i);
  assert.match(prompts[0] || "", /questionador/i);
  assert.match(prompts[0] || "", /chato/i);
});

test("final action continue medium callback approves closing the current sprint or block", async () => {
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
        text: "Implementacao aprovada e sprint atual em andamento.",
        workdir: "C:/CodexProjetos/dex-agent",
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
    data: "final_action:c2:req-1"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    prompts[0] || "",
    /continue beyond a single micro-step and close the current sprint or current open block/i
  );
  assert.match(
    prompts[0] || "",
    /without stopping after the first tiny follow-up/i
  );
  assert.match(
    prompts[0] || "",
    /Do not reinterpret this click as approval for all future open sprints/i
  );
  assert.ok(
    ctx.replies.some((reply) =>
      /Sprint continue received/i.test(reply.text || "")
    )
  );
  assert.ok(
    ctx.replies.some((reply) =>
      /Callback do botao Continuar sprint recebido/i.test(reply.text || "")
    )
  );
  assert.ok(
    ctx.replies.some((reply) =>
      /Botao Continuar sprint acionado/i.test(reply.text || "")
    )
  );
});

test("final action continue full callback approves all open planned sprints until 100 percent or blocker", async () => {
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
        text: "Sprint atual concluido e fila aberta para os proximos cortes.",
        workdir: "C:/CodexProjetos/dex-agent",
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
    data: "final_action:c3:req-1"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(prompts[0] || "", /conclude the entire current open block/i);
  assert.match(
    prompts[0] || "",
    /implementation, review, test, and honest verdict/i
  );
  assert.match(
    prompts[0] || "",
    /Do not reinterpret this click as approval for future blocks/i
  );
  assert.ok(
    ctx.replies.some((reply) =>
      /Finish whole block received/i.test(reply.text || "")
    )
  );
  assert.ok(
    ctx.replies.some((reply) =>
      /Callback do botao Concluir bloco todo recebido/i.test(reply.text || "")
    )
  );
  assert.ok(
    ctx.replies.some((reply) =>
      /Botao Concluir bloco todo acionado/i.test(reply.text || "")
    )
  );
});

test("final action autopilot callback activates anchor-flow guidance and specialist support", async () => {
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
        text: "A linha atual ja tem contexto aprovado e precisa seguir ate o fim.",
        workdir: "C:/CodexProjetos/dex-agent",
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
    data: "final_action:ap:req-1"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(prompts[0] || "", /Ative \$ancora-fluxo/i);
  assert.match(
    prompts[0] || "",
    /Use reunioes rapidas e concisas de especialistas/i
  );
  assert.match(prompts[0] || "", /\$kant/i);
  assert.match(prompts[0] || "", /\$chato/i);
  assert.match(prompts[0] || "", /\$focado/i);
  assert.match(prompts[0] || "", /\$garimpeiro/i);
  assert.match(prompts[0] || "", /\$estacionamento/i);
  assert.match(prompts[0] || "", /\$bruno-brain/i);
  assert.match(
    prompts[0] || "",
    /Cada fase, especialista ou reuniao deve indicar explicitamente Proximo passo, Proximo especialista indicado/i
  );
  assert.match(
    prompts[0] || "",
    /Se o trabalho travar por escopo aberto, falta de opcoes ou falta de caminho claro/i
  );
  assert.match(
    prompts[0] || "",
    /INDEX\.md raiz -> AGENTS\.md -> INDEX\.md local relevante -> arquivo alvo -> ACTIVE\.md \+ HANDOFF\.md/i
  );
  assert.match(prompts[0] || "", /\.codex\/napkin\.md/i);
  assert.match(
    prompts[0] || "",
    /\.agents\/ESTACIONAMENTO\.md quando houver residuo\/reabertura/i
  );
  assert.match(prompts[0] || "", /\.agents\/MEMORY\.ndjson como ledger/i);
  assert.match(prompts[0] || "", /So use busca textual como fallback/i);
  assert.match(prompts[0] || "", /Resultado real/i);
  assert.match(
    prompts[0] || "",
    /Decisao do piloto: seguir \| parar \| retornar/i
  );
  assert.match(prompts[0] || "", /Por que segui ou parei/i);
  assert.match(prompts[0] || "", /Ponto cego/i);
  assert.match(prompts[0] || "", /Dica de ouro/i);
  assert.match(prompts[0] || "", /Opcoes seguras/i);
  assert.match(prompts[0] || "", /Proximo passo recomendado/i);
  assert.match(prompts[0] || "", /Proximo especialista indicado/i);
  assert.ok(
    ctx.replies.some((reply) => /Autopilot received/i.test(reply.text || ""))
  );
  assert.ok(
    ctx.replies.some((reply) =>
      /Callback do botao Piloto automatico recebido/i.test(reply.text || "")
    )
  );
  assert.ok(
    ctx.replies.some((reply) =>
      /Botao Piloto automatico acionado/i.test(reply.text || "")
    )
  );
});

test("final action autopilot x3 arms and starts a controlled autopilot run", async () => {
  const prompts: string[] = [];
  let armedCount = 0;
  let consumed = 0;
  const { bot, ptyManager } = createDependencies({
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
        text: "A linha atual precisa de piloto controlado ate fechar o bloco.",
        workdir: "C:/CodexProjetos/dex-agent",
        createdAt: Date.now()
      }),
      offerForContext: async () => false,
      offerFinalActionsForChat: async () => false,
      sendSummaryForChat: async () => false,
      handleCallback: async () => false
    }
  });
  (ptyManager.getLanguage as any) = () => "pt-BR";
  (ptyManager.setSpecialAutopilot as any) = (
    _chatId: number,
    remainingResponses: number
  ) => {
    armedCount = remainingResponses;
    return {
      enabled: true,
      remainingResponses
    };
  };
  (ptyManager.consumeSpecialAutopilotStep as any) = () => {
    consumed += 1;
    return {
      enabled: true,
      remainingResponses: 2
    };
  };
  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "final_action:ax:req-1"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(armedCount, 3);
  assert.equal(consumed, 1);
  assert.match(prompts[0] || "", /autopilot execution run/i);
  assert.ok(
    ctx.replies.some((reply) => /Piloto x3 acionado/i.test(reply.text || ""))
  );
  assert.ok(
    ctx.replies.some((reply) => /Restantes: 2/i.test(reply.text || ""))
  );
});

test("final action legacy execute callback maps to short continue and keeps a distinct queue label when Codex is busy", async () => {
  const prompts: string[] = [];
  const { bot } = createDependencies({
    sendPrompt: async (_ctx: unknown, prompt: string) => {
      prompts.push(prompt);
      return {
        started: false,
        reason: "queued",
        activeMode: "sdk",
        queueLength: 1,
        item: {
          id: "queue-1",
          index: 1,
          text: "Botao Proximo passo acionado",
          workdir: "C:/CodexProjetos/dex-agent",
          relativeWorkdir: "dex-agent",
          createdAt: new Date().toISOString()
        }
      };
    },
    audioSummaryManager: {
      isEnabled: () => true,
      createSummaryRequest: () => "req-1",
      resolveRequest: () => ({
        chatId: "1",
        text: "Implementacao aprovada e sprint encerrado.",
        workdir: "C:/CodexProjetos/ProjetoAlphaTeste",
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
    /approval for exactly one small and safe follow-up execution scoped to the finalized conclusion/i
  );
  assert.ok(
    ctx.replies.some((reply) =>
      /Short continue received/i.test(reply.text || "")
    )
  );
  assert.ok(
    ctx.replies.some((reply) =>
      /Callback do botao Proximo passo recebido/i.test(reply.text || "")
    )
  );
  assert.ok(
    ctx.replies.some((reply) =>
      /Botao Proximo passo acionado/i.test(reply.text || "")
    )
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
        workdir: "C:/CodexProjetos/ProjetoAlphaTeste",
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
    data: "final_action:rv:req-1"
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
        workdir: "C:/CodexProjetos/ProjetoAlphaTeste",
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
    data: "final_action:ib:req-1"
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

test("menu callback admin opens the internal admin dashboard", async () => {
  const inspected: string[] = [];
  const { bot } = createDependencies({
    workdir: "C:\\CodexProjetos\\dex-agent",
    dashboardAdminService: {
      inspect: async (workdir: string) => {
        inspected.push(workdir);
        return {
          workdir,
          modules: [
            {
              key: "prompts",
              label: "Prompts",
              status: "enabled",
              mode: "editable",
              reason: null
            },
            {
              key: "history",
              label: "Historico",
              status: "enabled",
              mode: "editable",
              reason: null
            },
            {
              key: "operation",
              label: "Operacao",
              status: "planned",
              mode: "read-only",
              reason:
                "Ainda falta uma fronteira dedicada para mutacoes de fila."
            },
            {
              key: "settings",
              label: "Configuracoes",
              status: "planned",
              mode: "read-only",
              reason:
                "Ainda nao existe um ConfigService proprio para escrita segura."
            }
          ],
          prompts: {
            items: [
              {
                source: "builtin",
                selector: "builtin:0",
                label: "Retomar trabalho",
                intent: "continue",
                removable: false
              },
              {
                source: "custom",
                selector: "custom:abc-123",
                label: "Sprint atual",
                intent: "planning",
                removable: true
              }
            ],
            capabilities: [
              "listBuiltins",
              "listCustom",
              "createCustom",
              "removeCustom"
            ]
          },
          history: {
            candidates: [{}],
            proposals: [],
            capabilities: [
              "listCandidates",
              "listProposals",
              "explainCandidate",
              "discardCandidate",
              "proposePromotion",
              "cancelProposal"
            ]
          },
          operation: {
            enabled: false,
            reason: "Mutacoes de fila continuam fora do v1."
          },
          settings: {
            enabled: false,
            reason:
              "Configuracoes seguem em leitura ate existir fronteira segura."
          }
        };
      }
    }
  });
  const ctx = createContext("", 1, { text: undefined });
  ctx.callbackQuery = {
    data: "menu:admin"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.deepEqual(inspected, ["C:\\CodexProjetos\\dex-agent"]);
  assert.match(
    ctx.replies[1]?.text || "",
    /Admin dashboard \\?\(internal v1\\?\)/i
  );
  assert.match(ctx.replies[1]?.text || "", /Prompts: enabled \/ editable/i);
  assert.match(ctx.replies[1]?.text || "", /Historico: enabled \/ editable/i);
  const inlineKeyboard = (
    ctx.replies[1]?.options?.reply_markup as {
      inline_keyboard?: Array<Array<{ callback_data?: string }>>;
    }
  )?.inline_keyboard;
  assert.ok(
    inlineKeyboard?.some((row) =>
      row.some((button) => button.callback_data === "admin:prompts")
    )
  );
  assert.ok(
    inlineKeyboard?.some((row) =>
      row.some((button) => button.callback_data === "admin:history")
    )
  );
});

test("admin command opens the same internal admin dashboard snapshot", async () => {
  const { bot } = createDependencies({
    dashboardAdminService: {
      inspect: async (workdir: string) => ({
        workdir,
        modules: [
          {
            key: "prompts",
            label: "Prompts",
            status: "enabled",
            mode: "editable",
            reason: null
          },
          {
            key: "history",
            label: "Historico",
            status: "enabled",
            mode: "editable",
            reason: null
          },
          {
            key: "operation",
            label: "Operacao",
            status: "planned",
            mode: "read-only",
            reason: "Ainda falta uma fronteira dedicada para mutacoes de fila."
          },
          {
            key: "settings",
            label: "Configuracoes",
            status: "planned",
            mode: "read-only",
            reason:
              "Ainda nao existe um ConfigService proprio para escrita segura."
          }
        ],
        prompts: {
          items: [
            {
              source: "builtin",
              selector: "builtin:0",
              label: "Retomar trabalho",
              intent: "continue",
              removable: false
            },
            {
              source: "custom",
              selector: "custom:abc-123",
              label: "Sprint atual",
              intent: "planning",
              removable: true
            }
          ],
          capabilities: [
            "listBuiltins",
            "listCustom",
            "createCustom",
            "removeCustom"
          ]
        },
        history: {
          candidates: [{}],
          proposals: [],
          capabilities: [
            "listCandidates",
            "listProposals",
            "explainCandidate",
            "discardCandidate",
            "proposePromotion",
            "cancelProposal"
          ]
        },
        operation: {
          enabled: false,
          reason: "Mutacoes de fila continuam fora do v1."
        },
        settings: {
          enabled: false,
          reason:
            "Configuracoes seguem em leitura ate existir fronteira segura."
        }
      })
    }
  });
  const ctx = createContext("/admin");
  const handler = bot.commands.get("admin");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    ctx.replies[0]?.text || "",
    /Admin dashboard \\?\(internal v1\\?\)/i
  );
  assert.match(ctx.replies[0]?.text || "", /History:/i);
});

test("admin link returns a real local dashboard URL", async () => {
  const { bot } = createDependencies({
    adminWebServer: {
      getLink: async () => "http://127.0.0.1:3999/admin?workdir=test-repo"
    }
  });
  const ctx = createContext("/admin link");
  const handler = bot.commands.get("admin");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    ctx.replies[0]?.text || "",
    /Admin web link ready|Link web do admin pronto/i
  );
  assert.match(ctx.replies[0]?.text || "", /127\\\.0\\\.0\\\.1:3999/i);
  assert.match(ctx.replies[0]?.text || "", /workdir\\=test\\-repo/i);
});

test("admin prompts command opens the focused prompts module", async () => {
  const { bot } = createDependencies({
    dashboardAdminService: {
      inspect: async (workdir: string) => ({
        workdir,
        modules: [],
        prompts: {
          items: [
            {
              source: "builtin",
              selector: "builtin:0",
              label: "Retomar trabalho",
              intent: "continue",
              removable: false
            },
            {
              source: "custom",
              selector: "custom:abc-123",
              label: "Sprint atual",
              intent: "planning",
              removable: true
            }
          ],
          capabilities: [
            "listBuiltins",
            "listCustom",
            "createCustom",
            "removeCustom"
          ]
        },
        history: {
          candidates: [],
          proposals: [],
          capabilities: []
        },
        operation: {
          enabled: false,
          reason: "Mutacoes de fila continuam fora do v1."
        },
        settings: {
          enabled: false,
          reason:
            "Configuracoes seguem em leitura ate existir fronteira segura."
        }
      })
    }
  });
  const ctx = createContext("/admin prompts");
  const handler = bot.commands.get("admin");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    ctx.replies[0]?.text || "",
    /Admin prompts \\?\(internal v1\\?\)/i
  );
  assert.match(
    ctx.replies[0]?.text || "",
    /builtin:0\s+\\?\|\s+Retomar trabalho/i
  );
  assert.match(
    ctx.replies[0]?.text || "",
    /custom:abc\\?-123\s+\\?\|\s+Sprint atual/i
  );
  assert.match(ctx.replies[0]?.text || "", /removable/i);
});

test("admin prompts add creates a custom prompt through the admin flow", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-admin-prompts-handler-")
  );
  const promptLibraryService = new PromptLibraryService();
  const { bot } = createDependencies({
    workdir,
    promptLibraryService
  });
  const handler = bot.commands.get("admin");

  assert.ok(handler);

  const addCtx = createContext(
    "/admin prompts add planning :: Sprint implementacao :: /plan continue a implementacao usando $sprinter"
  );
  await handler!(addCtx);
  assert.match(addCtx.replies.at(-1)?.text || "", /Admin prompt created/i);
  assert.match(addCtx.replies.at(-1)?.text || "", /custom:/i);

  const listCtx = createContext("/admin prompts");
  await handler!(listCtx);
  assert.match(listCtx.replies[0]?.text || "", /Sprint implementacao/i);
  assert.match(listCtx.replies[0]?.text || "", /Planning|Planejamento/i);
});

test("admin prompts remove deletes a custom prompt through the admin flow", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-admin-prompts-remove-")
  );
  const promptLibraryService = new PromptLibraryService();
  const { bot } = createDependencies({
    workdir,
    promptLibraryService
  });
  const handler = bot.commands.get("admin");

  assert.ok(handler);

  const addCtx = createContext(
    "/admin prompts add planning :: Sprint implementacao :: /plan continue a implementacao usando $sprinter"
  );
  await handler!(addCtx);

  const stored = await promptLibraryService.listPrompts(workdir);
  assert.equal(stored.length, 1);

  const removeCtx = createContext(
    `/admin prompts remove custom:${stored[0]!.id}`
  );
  await handler!(removeCtx);
  assert.match(removeCtx.replies.at(-1)?.text || "", /Admin prompt removed/i);
  assert.equal((await promptLibraryService.listPrompts(workdir)).length, 0);
});

test("admin history command opens the focused history module", async () => {
  const { bot } = createDependencies({
    dashboardAdminService: {
      inspect: async (workdir: string) => ({
        workdir,
        modules: [],
        prompts: {
          items: [],
          capabilities: []
        },
        history: {
          candidates: [
            {
              selector: "candidate:cand-1",
              title: "Bloco validado",
              confidence: 0.8,
              stage: "durable_memory",
              kind: "task_state"
            }
          ],
          proposals: [
            {
              selector: "proposal:prop-1",
              title: "Promover bloco",
              destination: "memory",
              confidence: 0.8
            }
          ],
          capabilities: [
            "listCandidates",
            "listProposals",
            "explainCandidate",
            "discardCandidate",
            "proposePromotion",
            "cancelProposal"
          ]
        },
        operation: {
          enabled: false,
          reason: "Mutacoes de fila continuam fora do v1."
        },
        settings: {
          enabled: false,
          reason:
            "Configuracoes seguem em leitura ate existir fronteira segura."
        }
      })
    }
  });
  const ctx = createContext("/admin history");
  const handler = bot.commands.get("admin");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    ctx.replies[0]?.text || "",
    /Admin history \\?\(internal v1\\?\)/i
  );
  assert.match(ctx.replies[0]?.text || "", /candidate:cand\\?-1/i);
  assert.match(ctx.replies[0]?.text || "", /proposal:prop\\?-1/i);
});

test("admin history explain shows the candidate explanation", async () => {
  const { bot } = createDependencies({
    memoryService: {
      buildMemoryPacket: async () => null,
      renderMemoryPacket: (_packet: unknown, prompt: string) => prompt,
      buildSourceDisclosure: () => "",
      listCandidates: async () => [],
      listProposals: async () => [],
      proposePromotion: async () => null,
      discardCandidate: async () => null,
      explainCandidate: async () =>
        "Candidate explains the current block state.",
      applyPromotion: async () => ({ ok: false, reason: "missing" }),
      cancelProposal: async () => null,
      readOperationalFile: async () => null,
      captureCandidate: async () => null
    } as any
  });
  const ctx = createContext("/admin history explain candidate:cand-1");
  const handler = bot.commands.get("admin");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    ctx.replies[0]?.text || "",
    /Admin history explain|Explicacao do historico do admin/i
  );
  assert.match(
    ctx.replies[0]?.text || "",
    /Candidate explains the current block state/i
  );
});

test("admin history discard removes the candidate", async () => {
  const { bot } = createDependencies({
    memoryService: {
      buildMemoryPacket: async () => null,
      renderMemoryPacket: (_packet: unknown, prompt: string) => prompt,
      buildSourceDisclosure: () => "",
      listCandidates: async () => [],
      listProposals: async () => [],
      proposePromotion: async () => null,
      discardCandidate: async () => ({
        id: "cand-1",
        title: "Bloco validado",
        summary: "Resumo curto",
        kind: "task_state",
        stage: "durable_memory",
        baseKind: "task_state",
        scope: "project",
        destination: "memory",
        confidence: 0.8,
        createdAt: "2026-04-22T00:00:00.000Z"
      }),
      explainCandidate: async () => null,
      applyPromotion: async () => ({ ok: false, reason: "missing" }),
      cancelProposal: async () => null,
      readOperationalFile: async () => null,
      captureCandidate: async () => null
    } as any
  });
  const ctx = createContext("/admin history discard candidate:cand-1");
  const handler = bot.commands.get("admin");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    ctx.replies[0]?.text || "",
    /Admin history candidate discarded|Candidato do historico do admin descartado/i
  );
  assert.match(ctx.replies[0]?.text || "", /candidate:cand\\-1/i);
});

test("admin history propose creates a proposal", async () => {
  const { bot } = createDependencies({
    memoryService: {
      buildMemoryPacket: async () => null,
      renderMemoryPacket: (_packet: unknown, prompt: string) => prompt,
      buildSourceDisclosure: () => "",
      listCandidates: async () => [],
      listProposals: async () => [],
      proposePromotion: async () => ({
        id: "prop-1",
        candidateId: "cand-1",
        destination: "memory",
        entry: {
          title: "Bloco validado",
          summary: "Resumo curto",
          kind: "task_state",
          stage: "proposal_review",
          confidence: 0.8
        },
        createdAt: "2026-04-22T00:00:00.000Z",
        reason: "Manual review requested.",
        skillDraft: null
      }),
      discardCandidate: async () => null,
      explainCandidate: async () => null,
      applyPromotion: async () => ({ ok: false, reason: "missing" }),
      cancelProposal: async () => null,
      readOperationalFile: async () => null,
      captureCandidate: async () => null
    } as any
  });
  const ctx = createContext("/admin history propose candidate:cand-1");
  const handler = bot.commands.get("admin");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    ctx.replies[0]?.text || "",
    /Admin history proposal created|Proposal do historico do admin criada/i
  );
  assert.match(ctx.replies[0]?.text || "", /proposal:prop\\-1/i);
  assert.match(ctx.replies[0]?.text || "", /candidate:cand\\-1/i);
});

test("admin history cancel cancels a proposal", async () => {
  const { bot } = createDependencies({
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
      cancelProposal: async () => ({
        id: "prop-1",
        candidateId: "cand-1",
        destination: "memory",
        entry: {
          title: "Bloco validado",
          summary: "Resumo curto",
          kind: "task_state",
          stage: "proposal_review",
          confidence: 0.8
        },
        createdAt: "2026-04-22T00:00:00.000Z",
        reason: "Manual review requested.",
        skillDraft: null
      }),
      readOperationalFile: async () => null,
      captureCandidate: async () => null
    } as any
  });
  const ctx = createContext("/admin history cancel proposal:prop-1");
  const handler = bot.commands.get("admin");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(
    ctx.replies[0]?.text || "",
    /Admin history proposal canceled|Proposal do historico do admin cancelada/i
  );
  assert.match(ctx.replies[0]?.text || "", /proposal:prop\\-1/i);
  assert.match(ctx.replies[0]?.text || "", /candidate:cand\\-1/i);
});

test("queue command lists the current queue", async () => {
  const { bot } = createDependencies({
    listPromptQueue: () => [
      {
        id: "queue-1",
        index: 1,
        text: "revisar email",
        relativeWorkdir: "ProjetoBetaTeste",
        createdAt: new Date().toISOString()
      }
    ]
  });
  const ctx = createContext("/queue");
  const handler = bot.commands.get("queue");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies[0].text, /revisar email/i);
  assert.match(ctx.replies[0].text, /ProjetoBetaTeste/i);
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

test("fila alias lists the current queue", async () => {
  const { bot } = createDependencies({
    listPromptQueue: () => [
      {
        id: "queue-1",
        index: 1,
        text: "revisar permissoes",
        relativeWorkdir: "ProjetoDeltaTeste",
        createdAt: new Date().toISOString()
      }
    ]
  });
  const ctx = createContext("/fila");
  const handler = bot.commands.get("fila");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies[0].text, /revisar permissoes/i);
  assert.match(ctx.replies[0].text, /ProjetoDeltaTeste/i);
});

test("second text prompt while Codex is active gets clear queue feedback", async () => {
  const { bot } = createDependencies({
    sendPrompt: async () => ({
      started: false,
      reason: "queued",
      activeMode: "sdk",
      queueLength: 1,
      item: {
        id: "queue-1",
        index: 1,
        text: "novo pedido",
        relativeWorkdir: ".",
        createdAt: new Date().toISOString()
      }
    })
  });
  const ctx = createContext("novo pedido");
  const handler = bot.events.get("text");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies.at(-1)?.text || "", /already working/i);
  assert.match(ctx.replies.at(-1)?.text || "", /\/queue|\/fila/i);
});

test("short progress follow-up while active reports status instead of starting a run", async () => {
  let promptCalls = 0;
  const { bot } = createDependencies({
    sendPrompt: async () => {
      promptCalls += 1;
      return {
        started: true,
        mode: "sdk"
      };
    },
    operationalContinuationState: {
      active: true,
      activeMode: "sdk",
      lastPromptText: "analisar permissao de consultas",
      queuedItems: [
        {
          id: "queue-1",
          index: 1,
          text: "ajustar copy",
          relativeWorkdir: ".",
          createdAt: new Date().toISOString()
        }
      ]
    }
  });
  const ctx = createContext("conseguiu ver?");
  const handler = bot.events.get("text");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(promptCalls, 0);
  assert.match(ctx.replies[0].text, /still processing/i);
  assert.match(ctx.replies[0].text, /analisar permissao/i);
  assert.match(ctx.replies[0].text, /\/queue|\/fila/i);
});

test("same-workdir conflict still points to continue", async () => {
  const { bot } = createDependencies({
    sendPrompt: async () => ({
      started: false,
      reason: "workspace_busy",
      activeMode: "sdk",
      blockingChatId: "100000003",
      relativeWorkdir: "."
    })
  });
  const ctx = createContext("editar painel");
  const handler = bot.events.get("text");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(ctx.replies.at(-1)?.text || "", /Another chat/i);
  assert.match(ctx.replies.at(-1)?.text || "", /\/continue/i);
});

test("agora command sends a normal prompt when this chat is idle", async () => {
  const { bot, promptCalls } = createDependencies();
  const ctx = createContext("/agora revisar copy do painel");
  const handler = bot.commands.get("agora");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(promptCalls.length, 1);
  assert.match(String((promptCalls[0] as any[])[1]), /revisar copy do painel/i);
  assert.match(ctx.replies.at(-1)?.text || "", /no active run/i);
});

test("inject alias interrupts the active same-chat run and sends an urgent resume prompt", async () => {
  let interruptCalls = 0;
  let closeCalls = 0;
  const { bot, ptyManager, promptCalls } = createDependencies({
    operationalContinuationState: {
      active: true,
      activeMode: "sdk",
      lastPromptText: "implementar permissao de consultas",
      queuedItems: [
        {
          id: "queue-1",
          index: 1,
          text: "ajustar copy depois",
          relativeWorkdir: ".",
          createdAt: new Date().toISOString()
        }
      ]
    }
  });
  (ptyManager.interrupt as any) = () => {
    interruptCalls += 1;
    return true;
  };
  (ptyManager.closeSession as any) = () => {
    closeCalls += 1;
    return true;
  };

  const ctx = createContext("/inject antes veja esta regra urgente");
  const handler = bot.commands.get("inject");

  assert.ok(handler);
  await handler!(ctx);

  assert.equal(interruptCalls, 1);
  assert.equal(closeCalls, 1);
  assert.equal(promptCalls.length, 1);
  const sentPrompt = String((promptCalls[0] as any[])[1]);
  assert.match(sentPrompt, /Urgent Telegram instruction/i);
  assert.match(sentPrompt, /implementar permissao de consultas/i);
  assert.match(sentPrompt, /antes veja esta regra urgente/i);
  assert.match(sentPrompt, /Existing queue: 1 pending/i);
  assert.match(
    ctx.replies.at(-1)?.text || "",
    /interrupted the active Codex run/i
  );
  assert.match(ctx.replies.at(-1)?.text || "", /queue was preserved/i);
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
      text: "pesquise aonde fica o projeto beta",
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

  assert.deepEqual(prompts, ["pesquise aonde fica o projeto beta"]);
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
