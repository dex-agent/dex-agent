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
      ): { chatId: string; text: string; workdir?: string; createdAt: number } | null;
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
  const inlineKeyboard = (ctx.replies[0].options?.reply_markup as {
    inline_keyboard?: Array<Array<{ callback_data?: string }>>;
  })?.inline_keyboard;
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

  assert.match(prompts[0] || "", /Operational continuation state for this chat/i);
  assert.match(prompts[0] || "", /last live result: Estou no bloco da bateria viva do backend/i);
  assert.match(prompts[0] || "", /Canonical memoria-viva fallback:/i);
  assert.match(prompts[0] || "", /current objective: front-end/i);
  assert.match(prompts[0] || "", /prefer the operational continuation state/i);
});

test("operational status question returns runtime status instead of sending a prompt", async () => {
  const prompts: string[] = [];
  const { bot } = createDependencies({
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
  const ctx = createContext("o que esta fazendo?");
  const handler = bot.events.get("text");

  assert.ok(handler);
  await handler!(ctx);

  assert.deepEqual(prompts, []);
  assert.match(ctx.replies[0]?.text || "", /Estado operacional atual/i);
  assert.match(ctx.replies[0]?.text || "", /queued items: 1/i);
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
  assert.match(ctx.replies[0]?.text || "", /Interrupted the active Codex run|Interromp/i);
  assert.match(ctx.replies[1]?.text || "", /Estado atual da fila|queue state/i);

  const inlineKeyboard = (ctx.replies[1]?.options?.reply_markup as {
    inline_keyboard?: Array<Array<{ callback_data?: string }>>;
  })?.inline_keyboard;

  assert.equal(inlineKeyboard?.[0]?.[0]?.callback_data, "queue:run");
});

test("memory command lists pending candidates and can promote one", async () => {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "dex-agent-memory-handler-"));
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
  assert.match(promoteCtx.replies.at(-1)?.text || "", /Memory Promotion Proposal/i);
});

test("menu callback inbox opens the inbox dashboard", async () => {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "dex-agent-menu-inbox-"));
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

  assert.match(ctx.replies.at(-1)?.text || "", /Sistema de memoria do Dex Agent/i);
  assert.match(ctx.replies.at(-1)?.text || "", /memory\\-system/i);
  assert.match(ctx.replies.at(-1)?.text || "", /README\\.md/i);
});

test("memory callback confirm writes durable memory", async () => {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "dex-agent-memory-callback-"));
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
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "dex-agent-inbox-handler-"));
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

  const proposalsCtx = createContext("/inbox proposals");
  await handler!(proposalsCtx);
  assert.match(proposalsCtx.replies.at(-1)?.text || "", /Inbox Proposals/i);
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
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "dex-agent-skill-prompt-"));

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
  assert.match(ctx.replies[0].text, /active project: AgendadorConsultasOticas/i);
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

  const inlineKeyboard = (ctx.replies[0].options?.reply_markup as {
    inline_keyboard?: Array<Array<{ callback_data?: string }>>;
  })?.inline_keyboard;
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
  assert.match(ctx.replies[0].text, /active project: AgendadorConsultasOticas/i);
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

  assert.match(ctx.replies.at(-1)?.text || "", /Project switched successfully/i);
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

  assert.match(prompts[0] || "", /panorama executivo honesto/i);
  assert.ok(
    ctx.replies.some((reply) => reply.text.includes("Pedido enviado ao Codex"))
  );
});

test("prompts command can add, list, run, and remove custom prompts", async () => {
  const prompts: string[] = [];
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "dex-agent-prompts-handler-"));
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
  assert.match(listCtx.replies.at(-1)?.text || "", /Biblioteca de Prompts/i);
  assert.match(listCtx.replies.at(-1)?.text || "", /Sprint implementacao/i);

  const stored = await promptLibraryService.listPrompts(workdir);
  assert.equal(stored.length, 1);

  const runCtx = createContext(`/prompts run custom:${stored[0]!.id}`);
  await handler!(runCtx);
  assert.match(
    prompts[0] || "",
    /crie os sprint de planejamento de implementacao usando \$sprinter/i
  );

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

test("final action continue callback sends an approval prompt from the finalized result", async () => {
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
    data: "final_action:continue:req-1"
  };
  const handler = bot.events.get("callback_query");

  assert.ok(handler);
  await handler!(ctx);

  assert.match(prompts[0] || "", /Considere a conclusao abaixo como aprovada/i);
  assert.match(prompts[0] || "", /Implementacao aprovada e sprint encerrado/i);
  assert.ok(
    ctx.replies.some((reply) => reply.text.includes("Pedido enviado ao Codex"))
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
  // @ts-expect-error reply_markup is loosely typed in the test stub.
  assert.deepEqual(ctx.replies[0].options?.reply_markup?.inline_keyboard?.[0]?.map((button: any) => button.text), [
    "▶️ Rodar proximo",
    "🔄 Atualizar"
  ]);
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
  assert.match(ctx.replies[1].text, /Queued item sent to Codex|Item da fila enviado ao Codex/i);
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
  assert.match(payload[0]?.text || "", /Analise esta imagem enviada no Telegram/i);
});
