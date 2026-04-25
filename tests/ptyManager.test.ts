import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { PtyManager } from "../src/runner/ptyManager.js";

type PtyManagerConstructorOptions = ConstructorParameters<typeof PtyManager>[0];
type TelegramStub = PtyManagerConstructorOptions["bot"]["telegram"];
type CodexClientFactory = NonNullable<
  PtyManagerConstructorOptions["codexClientFactory"]
>;

interface ManagerOverrides {
  runnerCwd?: string;
  workspaceRoot?: string;
  instanceMode?: "workspace" | "instance";
  telegram?: TelegramStub;
  backend?: PtyManagerConstructorOptions["config"]["runner"]["backend"];
  sdkThreadOptions?: Partial<
    PtyManagerConstructorOptions["config"]["runner"]["sdkThreadOptions"]
  >;
  codexClientFactory?: CodexClientFactory;
  onResponseFinalized?: PtyManagerConstructorOptions["onResponseFinalized"];
}

interface FakeSequence {
  initialId?: string | null;
  events: () => AsyncGenerator<unknown>;
}

type FakeCall =
  | { action: "start"; options: Record<string, unknown> }
  | { action: "resume"; id: string; options: Record<string, unknown> };

interface SentMessageRecord {
  chatId: string | number;
  text: string;
  messageId?: number;
  edited?: boolean;
}

function createManager(overrides: ManagerOverrides = {}) {
  const runnerCwd = overrides.runnerCwd || process.cwd();
  const workspaceRoot = overrides.workspaceRoot || runnerCwd;
  const telegram: TelegramStub = overrides.telegram || {
    sendMessage: async () => ({ message_id: 1 }),
    editMessageText: async () => ({}),
    deleteMessage: async () => ({})
  };
  return new PtyManager({
    bot: {
      telegram
    },
    config: {
      runner: {
        backend: overrides.backend || "cli",
        command: "codex",
        args: [],
        cwd: runnerCwd,
        apiKey: "",
        baseUrl: "",
        throttleMs: 10,
        maxBufferChars: 1000,
        telegramChunkSize: 3900,
        sdkConfig: {},
        sdkThreadOptions: {
          skipGitRepoCheck: true,
          additionalDirectories: [],
          ...overrides.sdkThreadOptions
        }
      },
      workspace: {
        root: workspaceRoot
      },
      instance: {
        contextMode: overrides.instanceMode || "workspace",
        id: "dex-agent",
        projectLabel: path.basename(runnerCwd)
      },
      reasoning: {
        mode: "spoiler"
      },
      mcp: {
        servers: [
          {
            name: "context7",
            command: "npx",
            args: [],
            cwd: runnerCwd,
            env: {}
          },
          {
            name: "sequential-thinking",
            command: "npx",
            args: [],
            cwd: runnerCwd,
            env: {}
          }
        ]
      }
    },
    codexClientFactory: overrides.codexClientFactory,
    onResponseFinalized: overrides.onResponseFinalized
  });
}

function createFakeCodexClient(
  sequences: FakeSequence[],
  calls: FakeCall[] = [],
  inputs: unknown[] = []
): CodexClientFactory {
  return (() => ({
    startThread(options: Record<string, unknown> = {}) {
      const next = sequences.shift();
      if (!next) {
        throw new Error("No fake SDK sequence available for startThread");
      }

      calls.push({
        action: "start",
        options
      });

      return {
        id: next.initialId || null,
        async runStreamed(input: unknown) {
          inputs.push(input);
          return {
            events: next.events()
          };
        }
      };
    },
    resumeThread(id: string, options: Record<string, unknown> = {}) {
      const next = sequences.shift();
      if (!next) {
        throw new Error("No fake SDK sequence available for resumeThread");
      }

      calls.push({
        action: "resume",
        id,
        options
      });

      return {
        id: next.initialId || id,
        async runStreamed(input: unknown) {
          inputs.push(input);
          return {
            events: next.events()
          };
        }
      };
    }
  })) as CodexClientFactory;
}

function createExecFallbackSession(
  chatId: string,
  workdir = process.cwd(),
  mode: "exec" | "sdk" | "pty" = "exec"
): ReturnType<PtyManager["startExecSessionWithOptions"]> {
  return {
    mode,
    streamMessageIds: [],
    chatId,
    workdir
  } as unknown as ReturnType<PtyManager["startExecSessionWithOptions"]>;
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out while waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("pty manager stores model preference per chat", () => {
  const manager = createManager();

  manager.setPreferredModel(123, "gpt-5-codex");
  const status = manager.getStatus(123);

  assert.equal(status.preferredModel, "gpt-5-codex");

  manager.clearPreferredModel(123);
  assert.equal(manager.getStatus(123).preferredModel, null);
});

test("pty manager stores reasoning effort preference per chat", () => {
  const manager = createManager();

  manager.setPreferredReasoningEffort(123, "xhigh");
  const status = manager.getStatus(123);

  assert.equal(status.preferredReasoningEffort, "xhigh");

  manager.clearPreferredReasoningEffort(123);
  assert.equal(manager.getStatus(123).preferredReasoningEffort, null);
});

test("pty manager forwards reasoning effort to cli commands", () => {
  const manager = createManager();

  manager.setPreferredModel(123, "gpt-5.4");
  manager.setPreferredReasoningEffort(123, "high");

  assert.deepEqual(manager.getCommandArgsForSession(123), [
    "-m",
    "gpt-5.4",
    "-c",
    "model_reasoning_effort=high"
  ]);
  assert.deepEqual(manager.getExecArgs(123, "hello"), [
    "exec",
    "-m",
    "gpt-5.4",
    "-c",
    "model_reasoning_effort=high",
    "hello"
  ]);
  assert.deepEqual(
    manager.getInteractiveArgs(123, { resumeSessionId: "sess-1" }),
    ["resume", "-m", "gpt-5.4", "-c", "model_reasoning_effort=high", "sess-1"]
  );
});

test("pty manager lets chat reasoning effort override sdk defaults", () => {
  const manager = createManager({
    backend: "sdk",
    sdkThreadOptions: {
      modelReasoningEffort: "low"
    }
  });

  assert.equal(
    manager.getSdkThreadOptions(55, process.cwd()).modelReasoningEffort,
    "low"
  );

  manager.setPreferredReasoningEffort(55, "xhigh");

  assert.equal(
    manager.getSdkThreadOptions(55, process.cwd()).modelReasoningEffort,
    "xhigh"
  );
});

test("pty manager stores verbose preference per chat", () => {
  const manager = createManager();

  assert.equal(manager.isVerbose(123), false);
  manager.setVerbose(123, true);
  assert.equal(manager.isVerbose(123), true);
  assert.equal(manager.getStatus(123).verboseOutput, true);
});

test("pty manager stores the special autopilot state per chat", () => {
  const manager = createManager();

  assert.deepEqual(manager.getSpecialAutopilotStatus(123), {
    enabled: false,
    remainingResponses: 0
  });

  manager.setSpecialAutopilot(123, 5);
  assert.deepEqual(manager.getSpecialAutopilotStatus(123), {
    enabled: true,
    remainingResponses: 5
  });
  assert.equal(manager.getStatus(123).specialAutopilotEnabled, true);
  assert.equal(manager.getStatus(123).specialAutopilotRemainingResponses, 5);

  manager.consumeSpecialAutopilotStep(123);
  assert.deepEqual(manager.getSpecialAutopilotStatus(123), {
    enabled: true,
    remainingResponses: 4
  });

  manager.clearSpecialAutopilot(123);
  assert.deepEqual(manager.getSpecialAutopilotStatus(123), {
    enabled: false,
    remainingResponses: 0
  });
});

test("pty manager can add, list, remove, and clear queued prompts", () => {
  const manager = createManager();

  const added = manager.enqueuePrompt(1, "primeira tarefa", process.cwd());
  assert.equal(added.ok, true);
  assert.equal(manager.listPromptQueue(1).length, 1);
  assert.match(manager.listPromptQueue(1)[0].text, /primeira tarefa/);

  const removed = manager.removeQueuedPrompt(1, "1");
  assert.equal(removed.ok, true);
  assert.equal(manager.listPromptQueue(1).length, 0);

  manager.enqueuePrompt(1, "a", process.cwd());
  manager.enqueuePrompt(1, "b", process.cwd());
  const cleared = manager.clearPromptQueue(1);
  assert.equal(cleared.count, 2);
  assert.equal(manager.listPromptQueue(1).length, 0);
});

test("pty manager strips memory packet wrappers before storing queued prompts", () => {
  const manager = createManager();
  const wrappedPrompt = [
    "Authoritative project memory packet:",
    "- current objective: front-end",
    "",
    "User request:",
    "continue de onde voce parou"
  ].join("\n");

  const added = manager.enqueuePrompt(1, wrappedPrompt, process.cwd());

  assert.equal(added.ok, true);
  assert.match(
    manager.listPromptQueue(1)[0].text,
    /continue de onde voce parou/i
  );
  assert.doesNotMatch(
    manager.listPromptQueue(1)[0].text,
    /Authoritative project memory packet/i
  );
});

test("pty manager strips reusable skill wrappers before storing queued prompts", () => {
  const manager = createManager();
  const wrappedPrompt = [
    "Project skills available for direct reuse:",
    "- dex-agent-windows-restart (.agents/skills/dex-agent-windows-restart/SKILL.md): hidden restart flow",
    "",
    "Use one of these only if it directly matches the request.",
    "",
    "Request:",
    "continue do ponto certo do backend"
  ].join("\n");

  const added = manager.enqueuePrompt(1, wrappedPrompt, process.cwd());

  assert.equal(added.ok, true);
  assert.match(
    manager.listPromptQueue(1)[0].text,
    /continue do ponto certo do backend/i
  );
  assert.doesNotMatch(
    manager.listPromptQueue(1)[0].text,
    /Project skills available for direct reuse/i
  );
});

test("pty manager auto-queues same-chat prompts while sdk is running and drains them", async () => {
  let releaseFirst: (() => void) | undefined;
  const firstCanFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const calls: FakeCall[] = [];
  const inputs: unknown[] = [];
  const sentMessages: SentMessageRecord[] = [];
  const manager = createManager({
    backend: "sdk",
    telegram: {
      sendMessage: async (chatId: string | number, text: string) => {
        sentMessages.push({ chatId, text });
        return { message_id: sentMessages.length };
      },
      editMessageText: async () => ({}),
      deleteMessage: async () => ({})
    },
    codexClientFactory: createFakeCodexClient(
      [
        {
          events: async function* () {
            yield {
              type: "item.completed",
              item: {
                id: "first",
                type: "agent_message",
                text: "first done"
              }
            };
            await firstCanFinish;
            yield {
              type: "turn.completed",
              usage: {
                input_tokens: 1,
                cached_input_tokens: 0,
                output_tokens: 1
              }
            };
          }
        },
        {
          events: async function* () {
            yield {
              type: "item.completed",
              item: {
                id: "second",
                type: "agent_message",
                text: "second done"
              }
            };
          }
        }
      ],
      calls,
      inputs
    )
  });

  const first = await manager.sendPrompt({ chat: { id: 5 } }, "first task");
  const second = await manager.sendPrompt({ chat: { id: 5 } }, "second task");

  assert.equal(first.started, true);
  assert.equal(second.started, false);
  assert.equal(second.reason, "queued");
  assert.equal(manager.listPromptQueue(5).length, 1);

  releaseFirst?.();
  await waitFor(() => !manager.getStatus(5).active);

  assert.equal(manager.listPromptQueue(5).length, 0);
  assert.deepEqual(inputs, ["first task", "second task"]);
  assert.equal(calls.length, 2);
  assert.ok(
    sentMessages.some((message) => /Executando item da fila/.test(message.text))
  );
});

test("pty manager uses queueLabel when summarizing a queued prompt", async () => {
  let releaseFirst: (() => void) | undefined;
  const firstCanFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const calls: FakeCall[] = [];
  const manager = createManager({
    backend: "sdk",
    codexClientFactory: createFakeCodexClient(
      [
        {
          initialId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          events: async function* () {
            await firstCanFinish;
            yield {
              type: "item.completed",
              item: {
                id: "first",
                type: "agent_message",
                text: "first done"
              }
            };
          }
        }
      ],
      calls
    )
  });

  const first = await manager.sendPrompt({ chat: { id: 55 } }, "first task");
  const second = await manager.sendPrompt({ chat: { id: 55 } }, "second task", {
    queueLabel: "Botao Executar proximo passo acionado"
  });

  assert.equal(first.started, true);
  assert.equal(second.started, false);
  assert.equal(second.reason, "queued");
  if (!second.started && second.reason === "queued") {
    assert.equal(second.item.text, "Botao Executar proximo passo acionado");
  }

  releaseFirst?.();
  await waitFor(() => !manager.getStatus(55).active);
});

test("pty manager replays queued prompts in the workdir where they were enqueued", async () => {
  let releaseFirst: (() => void) | undefined;
  const firstCanFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-queue-workdir-"));
  const projectA = path.join(root, "project-a");
  const projectB = path.join(root, "project-b");
  fs.mkdirSync(path.join(projectA, ".agents"), { recursive: true });
  fs.mkdirSync(path.join(projectB, ".agents"), { recursive: true });

  const calls: FakeCall[] = [];
  const finalizedWorkdirs: string[] = [];
  const manager = createManager({
    backend: "sdk",
    workspaceRoot: root,
    runnerCwd: projectA,
    onResponseFinalized: async ({ workdir }) => {
      finalizedWorkdirs.push(workdir);
    },
    codexClientFactory: createFakeCodexClient(
      [
        {
          events: async function* () {
            yield {
              type: "item.completed",
              item: {
                id: "first-workdir",
                type: "agent_message",
                text: "first done"
              }
            };
            await firstCanFinish;
            yield {
              type: "turn.completed",
              usage: {
                input_tokens: 1,
                cached_input_tokens: 0,
                output_tokens: 1
              }
            };
          }
        },
        {
          events: async function* () {
            yield {
              type: "item.completed",
              item: {
                id: "second-workdir",
                type: "agent_message",
                text: "second done"
              }
            };
            yield {
              type: "turn.completed",
              usage: {
                input_tokens: 1,
                cached_input_tokens: 0,
                output_tokens: 1
              }
            };
          }
        }
      ],
      calls
    )
  });

  await manager.sendPrompt({ chat: { id: 6 } }, "first task");
  const queued = manager.enqueuePrompt(6, "second task", projectB);

  assert.equal(queued.ok, true);
  assert.equal(manager.getStatus(6).relativeWorkdir, "project-a");

  releaseFirst?.();
  await waitFor(() => !manager.getStatus(6).active);

  assert.equal(calls.length, 2);
  assert.equal(calls[1].action, "start");
  assert.deepEqual(finalizedWorkdirs, [projectA, projectB]);
  assert.equal(manager.getStatus(6).relativeWorkdir, "project-b");
});

test("pty manager stores language preference per chat", () => {
  const manager = createManager();

  assert.equal(manager.getLanguage(123), "pt-BR");
  manager.setLanguage(123, "zh-HK");
  assert.equal(manager.getLanguage(123), "zh-HK");
  assert.equal(manager.getStatus(123).language, "zh-HK");
});

test("pty manager status exposes runner workdir and MCP server names", () => {
  const manager = createManager();
  const status = manager.getStatus(456);

  assert.equal(status.workdir, process.cwd());
  assert.equal(status.relativeWorkdir, ".");
  assert.equal(status.workspaceRoot, process.cwd());
  assert.deepEqual(status.mcpServers, ["context7", "sequential-thinking"]);
  assert.equal(status.active, false);
  assert.equal(status.workflowPhase, "none");
});

test("pty manager tracks the last detected superpowers workflow phase per project", async () => {
  const manager = createManager({
    backend: "sdk",
    codexClientFactory: createFakeCodexClient([
      {
        events: async function* () {
          yield {
            type: "item.completed",
            item: {
              id: "item-1",
              type: "agent_message",
              text: "I’m using `brainstorming` first, then `writing-plans`."
            }
          };
          yield {
            type: "turn.completed",
            usage: {
              input_tokens: 1,
              cached_input_tokens: 0,
              output_tokens: 1
            }
          };
        }
      }
    ])
  });

  await manager.sendPrompt({ chat: { id: 7 } }, "design the change");
  await waitFor(() => !manager.getStatus(7).active);

  assert.equal(manager.getStatus(7).workflowPhase, "brainstorming");
});

test("pty manager forwards structured image input to the SDK backend", async () => {
  const sdkInputs: unknown[] = [];
  const tempImagePath = path.join(
    os.tmpdir(),
    `claws-sdk-image-${Date.now()}.jpg`
  );
  fs.writeFileSync(tempImagePath, "fake image payload");

  const manager = createManager({
    backend: "sdk",
    codexClientFactory: createFakeCodexClient(
      [
        {
          events: async function* () {
            yield {
              type: "item.completed",
              item: {
                id: "item-1",
                type: "agent_message",
                text: "Image analyzed."
              }
            };
            yield {
              type: "turn.completed",
              usage: {
                input_tokens: 1,
                cached_input_tokens: 0,
                output_tokens: 1
              }
            };
          }
        }
      ],
      [],
      sdkInputs
    )
  });

  await manager.sendPrompt(
    { chat: { id: 71 } },
    [
      {
        type: "text",
        text: "Analise este print"
      },
      {
        type: "local_image",
        path: tempImagePath
      }
    ],
    {
      cleanupPaths: [tempImagePath]
    }
  );
  await waitFor(() => !manager.getStatus(71).active);
  await waitFor(() => !fs.existsSync(tempImagePath));

  assert.deepEqual(sdkInputs[0], [
    {
      type: "text",
      text: "Analise este print"
    },
    {
      type: "local_image",
      path: tempImagePath
    }
  ]);
  assert.equal(fs.existsSync(tempImagePath), false);
});

test("pty manager lists git projects under workspace root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-workspace-"));
  const projectA = path.join(root, "project-a");
  const projectB = path.join(root, "project-b");
  fs.mkdirSync(projectA, { recursive: true });
  fs.mkdirSync(projectB, { recursive: true });
  fs.mkdirSync(path.join(projectA, ".git"));
  fs.mkdirSync(path.join(projectB, ".git"));

  const manager = createManager({
    workspaceRoot: root,
    runnerCwd: projectA
  });

  const projects = manager.listProjects();

  assert.deepEqual(
    projects.map((project) => project.relativePath),
    ["project-a", "project-b"]
  );
});

test("pty manager also recognizes project directories through workspace markers", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-markers-"));
  const projectA = path.join(root, "project-a");
  const projectB = path.join(root, "project-b");
  fs.mkdirSync(path.join(projectA, ".agents"), { recursive: true });
  fs.mkdirSync(path.join(projectB, ".codex"), { recursive: true });

  const manager = createManager({
    workspaceRoot: root,
    runnerCwd: projectA
  });

  const projects = manager.listProjects();

  assert.deepEqual(
    projects.map((project) => project.relativePath),
    ["project-a", "project-b"]
  );
});

test("pty manager switches workdir within workspace root and resets session", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-switch-"));
  const projectA = path.join(root, "project-a");
  const projectB = path.join(root, "project-b");
  fs.mkdirSync(projectA, { recursive: true });
  fs.mkdirSync(projectB, { recursive: true });
  fs.mkdirSync(path.join(projectA, ".git"));
  fs.mkdirSync(path.join(projectB, ".git"));

  const manager = createManager({
    workspaceRoot: root,
    runnerCwd: projectA
  });

  const result = manager.switchWorkdir(99, "project-b");

  assert.equal(result.relativePath, "project-b");
  assert.equal(manager.getStatus(99).workdir, projectB);
  assert.equal(manager.getStatus(99).relativeWorkdir, "project-b");
});

test("pty manager blocks project switching in fixed instance mode", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-fixed-"));
  const projectA = path.join(root, "project-a");
  const projectB = path.join(root, "project-b");
  fs.mkdirSync(projectA, { recursive: true });
  fs.mkdirSync(projectB, { recursive: true });
  fs.mkdirSync(path.join(projectA, ".git"));
  fs.mkdirSync(path.join(projectB, ".git"));

  const manager = createManager({
    workspaceRoot: root,
    runnerCwd: projectA,
    instanceMode: "instance"
  });

  assert.throws(
    () => manager.switchWorkdir(99, "project-b"),
    /fixa em um projeto|fixed to one project/i
  );
  assert.throws(
    () => manager.switchToPreviousWorkdir(99),
    /fixa em um projeto|fixed to one project/i
  );
  assert.equal(manager.getStatus(99).workdir, projectA);
});

test("pty manager tracks recent projects and can switch back to the previous workdir", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-history-"));
  const projectA = path.join(root, "project-a");
  const projectB = path.join(root, "project-b");
  const projectC = path.join(root, "project-c");
  fs.mkdirSync(projectA, { recursive: true });
  fs.mkdirSync(projectB, { recursive: true });
  fs.mkdirSync(projectC, { recursive: true });
  fs.mkdirSync(path.join(projectA, ".git"));
  fs.mkdirSync(path.join(projectB, ".git"));
  fs.mkdirSync(path.join(projectC, ".git"));

  const manager = createManager({
    workspaceRoot: root,
    runnerCwd: projectA
  });

  manager.switchWorkdir(77, "project-b");
  manager.switchWorkdir(77, "project-c");

  assert.deepEqual(
    manager.getRecentProjects(77).map((project) => project.relativePath),
    ["project-c", "project-b", "project-a"]
  );

  const previous = manager.switchToPreviousWorkdir(77);

  assert.equal(previous.relativePath, "project-b");
  assert.equal(manager.getStatus(77).relativeWorkdir, "project-b");
});

test("pty manager keeps project conversation slots isolated per workdir", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "claws-project-sessions-")
  );
  const projectA = path.join(root, "project-a");
  const projectB = path.join(root, "project-b");
  fs.mkdirSync(projectA, { recursive: true });
  fs.mkdirSync(projectB, { recursive: true });
  fs.mkdirSync(path.join(projectA, ".git"));
  fs.mkdirSync(path.join(projectB, ".git"));

  const manager = createManager({
    workspaceRoot: root,
    runnerCwd: projectA
  });

  manager.getProjectState(55, projectA).lastSessionId =
    "11111111-1111-1111-1111-111111111111";
  manager.switchWorkdir(55, "project-b");
  manager.getProjectState(55, projectB).lastSessionId =
    "22222222-2222-2222-2222-222222222222";

  assert.equal(
    manager.getStatus(55).projectSessionId,
    "22222222-2222-2222-2222-222222222222"
  );

  manager.switchWorkdir(55, "project-a");
  assert.equal(
    manager.getStatus(55).projectSessionId,
    "11111111-1111-1111-1111-111111111111"
  );
});

test("pty manager exports and restores per-project conversation state", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-project-export-"));
  const projectA = path.join(root, "project-a");
  const projectB = path.join(root, "project-b");
  fs.mkdirSync(projectA, { recursive: true });
  fs.mkdirSync(projectB, { recursive: true });
  fs.mkdirSync(path.join(projectA, ".git"));
  fs.mkdirSync(path.join(projectB, ".git"));

  const manager = createManager({
    workspaceRoot: root,
    runnerCwd: projectA
  });
  manager.getProjectState(99, projectA).lastSessionId =
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  manager.switchWorkdir(99, "project-b");
  manager.getProjectState(99, projectB).lastSessionId =
    "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  const restored = createManager({
    workspaceRoot: root,
    runnerCwd: projectA
  });
  restored.restoreState(manager.exportState());

  assert.equal(restored.getStatus(99).relativeWorkdir, "project-b");
  assert.equal(
    restored.getStatus(99).projectSessionId,
    "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
  );
  restored.switchWorkdir(99, "project-a");
  assert.equal(
    restored.getStatus(99).projectSessionId,
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
  );
});

test("pty manager tracks and restores operational continuation snapshots", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-continuation-"));
  const projectA = path.join(root, "project-a");
  fs.mkdirSync(projectA, { recursive: true });
  fs.mkdirSync(path.join(projectA, ".git"));

  const manager = createManager({
    workspaceRoot: root,
    runnerCwd: projectA
  });

  manager.rememberPromptForProject(5, projectA, "continue a bateria de testes");
  const projectState = manager.getProjectState(5, projectA);
  projectState.lastFinalResponseText =
    "Backend em bateria viva e auditoria completa do runtime.";
  projectState.lastFinalizedAt = "2026-04-20T17:01:00.000Z";
  manager.enqueuePrompt(5, "rodar o proximo seed real", projectA);

  const snapshot = manager.getOperationalContinuationState(5, projectA);
  assert.match(snapshot.lastPromptText || "", /continue a bateria/i);
  assert.match(snapshot.lastFinalResponseText || "", /bateria viva/i);
  assert.equal(snapshot.queuedItems.length, 1);

  const restored = createManager({
    workspaceRoot: root,
    runnerCwd: projectA
  });
  restored.restoreState(manager.exportState());

  const restoredSnapshot = restored.getOperationalContinuationState(
    5,
    projectA
  );
  assert.match(restoredSnapshot.lastPromptText || "", /continue a bateria/i);
  assert.match(restoredSnapshot.lastFinalResponseText || "", /bateria viva/i);
  assert.equal(restoredSnapshot.queuedItems.length, 1);
});

test("pty manager exports and restores verbose preference", () => {
  const manager = createManager();
  manager.setVerbose(42, true);

  const restored = createManager();
  restored.restoreState(manager.exportState());

  assert.equal(restored.isVerbose(42), true);
});

test("pty manager exports and restores the special autopilot state", () => {
  const manager = createManager();
  manager.setSpecialAutopilot(42, 6);

  const restored = createManager();
  restored.restoreState(manager.exportState());

  assert.deepEqual(restored.getSpecialAutopilotStatus(42), {
    enabled: true,
    remainingResponses: 6
  });
});

test("pty manager exports and restores reasoning effort preference", () => {
  const manager = createManager();
  manager.setPreferredReasoningEffort(42, "high");

  const restored = createManager();
  restored.restoreState(manager.exportState());

  assert.equal(restored.getStatus(42).preferredReasoningEffort, "high");
});

test("pty manager exports and restores language preference", () => {
  const manager = createManager();
  manager.setLanguage(42, "zh");

  const restored = createManager();
  restored.restoreState(manager.exportState());

  assert.equal(restored.getLanguage(42), "zh");
});

test("pty manager interrupt force-closes a stuck session after a grace period", async () => {
  const manager = createManager();
  let interrupted = 0;

  manager.sessions.set("42", {
    ...createExecFallbackSession("42", process.cwd(), "sdk"),
    throttledFlush: { cancel() {} },
    close: () => {},
    interrupt: () => {
      interrupted += 1;
    }
  } as ReturnType<PtyManager["startExecSessionWithOptions"]>);

  const ok = manager.interrupt(42);

  assert.equal(ok, true);
  assert.equal(interrupted, 1);
  await waitFor(() => !manager.sessions.has("42"), 3000);
});

test("pty manager keeps direct pty prompts immediate instead of queueing them", async () => {
  const writes: string[] = [];
  const manager = createManager();

  manager.sessions.set("77", {
    ...createExecFallbackSession("77", process.cwd(), "pty"),
    cleanupPaths: [],
    write: (input: string) => {
      writes.push(input);
    }
  } as ReturnType<PtyManager["startExecSessionWithOptions"]>);

  const result = await manager.sendPrompt(
    { chat: { id: 77 } },
    "continue daqui"
  );

  assert.deepEqual(result, {
    started: true,
    mode: "pty"
  });
  assert.deepEqual(writes, ["continue daqui\r"]);
  assert.equal(manager.listPromptQueue(77).length, 0);
});

test("pty manager exports and restores prompt queue", () => {
  const manager = createManager();
  manager.enqueuePrompt(42, "continuar depois", process.cwd());

  const restored = createManager();
  restored.restoreState(manager.exportState());

  assert.equal(restored.listPromptQueue(42).length, 1);
  assert.match(restored.listPromptQueue(42)[0].text, /continuar depois/);
});

test("pty manager lists recoverable queued chats only when they are idle", () => {
  const manager = createManager();

  manager.enqueuePrompt(42, "continuar depois", process.cwd());
  manager.enqueuePrompt(43, "nao avisar", process.cwd());
  manager.sessions.set(
    "43",
    createExecFallbackSession("43", process.cwd(), "sdk")
  );

  const recoverable = manager.listRecoverableQueuedChats();

  assert.equal(recoverable.length, 1);
  assert.equal(recoverable[0].chatId, "42");
  assert.equal(recoverable[0].queueLength, 1);
  assert.match(recoverable[0].nextItem.text, /continuar depois/);
});

test("pty manager stores SDK thread ids per project and resumes them", async () => {
  const calls: FakeCall[] = [];
  const sentMessages: SentMessageRecord[] = [];
  const sequences = [
    {
      events: async function* () {
        yield {
          type: "thread.started",
          thread_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        };
        yield {
          type: "item.completed",
          item: {
            id: "item-1",
            type: "agent_message",
            text: "Project A ready."
          }
        };
        yield {
          type: "turn.completed",
          usage: {
            input_tokens: 1,
            cached_input_tokens: 0,
            output_tokens: 1
          }
        };
      }
    },
    {
      events: async function* () {
        yield {
          type: "item.completed",
          item: {
            id: "item-2",
            type: "agent_message",
            text: "Project A resumed."
          }
        };
        yield {
          type: "turn.completed",
          usage: {
            input_tokens: 1,
            cached_input_tokens: 0,
            output_tokens: 1
          }
        };
      }
    }
  ];
  const manager = createManager({
    backend: "sdk",
    telegram: {
      sendMessage: async (chatId: string | number, text: string) => {
        sentMessages.push({ chatId, text });
        return { message_id: sentMessages.length };
      },
      editMessageText: async (
        chatId: string | number,
        messageId: number,
        _inlineMessageId: string | undefined,
        text: string
      ) => {
        sentMessages.push({ chatId, messageId, text, edited: true });
        return {};
      },
      deleteMessage: async () => ({})
    },
    codexClientFactory: createFakeCodexClient(sequences, calls)
  });

  await manager.sendPrompt({ chat: { id: 9 } }, "remember project a");
  await waitFor(() => !manager.getStatus(9).active);

  assert.equal(
    manager.getStatus(9).projectSessionId,
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
  );
  assert.equal(calls[0].action, "start");
  assert.equal(calls[0].options.workingDirectory, process.cwd());
  const firstMessage = sentMessages.at(-1);
  if (!firstMessage) {
    throw new Error("Expected at least one Telegram message");
  }
  assert.match(firstMessage.text, /Project A ready/);

  await manager.sendPrompt({ chat: { id: 9 } }, "continue project a");
  await waitFor(() => !manager.getStatus(9).active);

  assert.equal(calls[1].action, "resume");
  assert.equal(calls[1].id, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  const resumedMessage = sentMessages.at(-1);
  if (!resumedMessage) {
    throw new Error("Expected a resumed Telegram message");
  }
  assert.match(resumedMessage.text, /Project A resumed/);
});

test("pty manager does not leak audio API env vars into the Codex runner by default", async () => {
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousOpenAiBaseUrl = process.env.OPENAI_BASE_URL;
  const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const previousOpenRouterTitle = process.env.OPENROUTER_APP_TITLE;

  process.env.OPENAI_API_KEY = "sk-audio-only";
  process.env.OPENAI_BASE_URL = "https://openrouter.ai/api/v1";
  process.env.OPENROUTER_API_KEY = "sk-or-audio-only";
  process.env.OPENROUTER_APP_TITLE = "TeleCodex";

  let capturedEnv: Record<string, string> | undefined;
  const manager = createManager({
    backend: "sdk",
    codexClientFactory: ((options) => {
      capturedEnv = (options as { env?: Record<string, string> }).env;
      return createFakeCodexClient([
        {
          events: async function* () {
            yield {
              type: "turn.completed",
              usage: {
                input_tokens: 1,
                cached_input_tokens: 0,
                output_tokens: 1
              }
            };
          }
        }
      ])(options);
    }) as CodexClientFactory
  });

  try {
    await manager.sendPrompt({ chat: { id: 81 } }, "ping");
    await waitFor(() => !manager.getStatus(81).active);
  } finally {
    if (previousOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAiKey;
    }

    if (previousOpenAiBaseUrl === undefined) {
      delete process.env.OPENAI_BASE_URL;
    } else {
      process.env.OPENAI_BASE_URL = previousOpenAiBaseUrl;
    }

    if (previousOpenRouterKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
    }

    if (previousOpenRouterTitle === undefined) {
      delete process.env.OPENROUTER_APP_TITLE;
    } else {
      process.env.OPENROUTER_APP_TITLE = previousOpenRouterTitle;
    }
  }

  const env = capturedEnv;
  assert.ok(env);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.OPENAI_BASE_URL, undefined);
  assert.equal(env.OPENROUTER_API_KEY, undefined);
  assert.equal(env.OPENROUTER_APP_TITLE, undefined);
});

test("pty manager does not persist SDK thread ids for one-off runs", async () => {
  const calls: FakeCall[] = [];
  const manager = createManager({
    backend: "sdk",
    codexClientFactory: createFakeCodexClient(
      [
        {
          events: async function* () {
            yield {
              type: "thread.started",
              thread_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
            };
            yield {
              type: "item.completed",
              item: {
                id: "item-1",
                type: "agent_message",
                text: "One-off result."
              }
            };
            yield {
              type: "turn.completed",
              usage: {
                input_tokens: 1,
                cached_input_tokens: 0,
                output_tokens: 1
              }
            };
          }
        }
      ],
      calls
    )
  });

  const result = await manager.sendPrompt({ chat: { id: 12 } }, "run once", {
    forceExec: true
  });
  await waitFor(() => !manager.getStatus(12).active);

  assert.equal(result.started, true);
  assert.equal(result.mode, "sdk");
  assert.equal(manager.getStatus(12).projectSessionId, null);
  assert.equal(calls[0].action, "start");
});

test("pty manager can emit a post-response hook after a finalized sdk reply", async () => {
  const finalized: string[] = [];
  const manager = createManager({
    backend: "sdk",
    onResponseFinalized: async ({ text }) => {
      finalized.push(text);
    },
    codexClientFactory: createFakeCodexClient([
      {
        events: async function* () {
          yield {
            type: "item.completed",
            item: {
              id: "item-audio",
              type: "agent_message",
              text: "Long response for the audio summary hook."
            }
          };
          yield {
            type: "turn.completed",
            usage: {
              input_tokens: 1,
              cached_input_tokens: 0,
              output_tokens: 1
            }
          };
        }
      }
    ])
  });

  await manager.sendPrompt({ chat: { id: 18 } }, "summarize this");
  await waitFor(() => !manager.getStatus(18).active);

  assert.equal(finalized.length, 1);
  assert.match(finalized[0], /Long response for the audio summary hook/);
});

test("pty manager finalizes the session before the post-response hook runs", async () => {
  let followUpStarted = false;
  const manager = createManager({
    backend: "sdk",
    onResponseFinalized: async ({ chatId }) => {
      if (followUpStarted) {
        return;
      }
      const result = await manager.sendPrompt(
        { chat: { id: chatId } },
        "follow up immediately"
      );
      followUpStarted = result.started;
    },
    codexClientFactory: createFakeCodexClient([
      {
        events: async function* () {
          yield {
            type: "item.completed",
            item: {
              id: "item-finalized-followup",
              type: "agent_message",
              text: "Initial finalized response."
            }
          };
          yield {
            type: "turn.completed",
            usage: {
              input_tokens: 1,
              cached_input_tokens: 0,
              output_tokens: 1
            }
          };
        }
      },
      {
        events: async function* () {
          yield {
            type: "item.completed",
            item: {
              id: "item-followup",
              type: "agent_message",
              text: "Follow-up response."
            }
          };
          yield {
            type: "turn.completed",
            usage: {
              input_tokens: 1,
              cached_input_tokens: 0,
              output_tokens: 1
            }
          };
        }
      }
    ])
  });

  await manager.sendPrompt({ chat: { id: 33 } }, "start chain");
  await waitFor(() => !manager.getStatus(33).active);
  await waitFor(() => followUpStarted);
  await waitFor(() => !manager.getStatus(33).active);

  assert.equal(followUpStarted, true);
  assert.match(
    manager.getProjectState(33, process.cwd()).lastFinalResponseText || "",
    /Follow-up response/i
  );
});

test("pty manager sends unescaped final text to post-response hooks", async () => {
  const finalized: string[] = [];
  const manager = createManager({
    backend: "sdk",
    onResponseFinalized: async ({ text }) => {
      finalized.push(text);
    },
    codexClientFactory: createFakeCodexClient([
      {
        events: async function* () {
          yield {
            type: "item.completed",
            item: {
              id: "item-image-path",
              type: "agent_message",
              text: "Print salvo em C:/tmp/frontend-agenda_v2.png"
            }
          };
        }
      }
    ])
  });

  await manager.sendPrompt({ chat: { id: 181 } }, "generate print");
  await waitFor(() => !manager.getStatus(181).active);

  assert.equal(finalized.length, 1);
  assert.equal(finalized[0], "Print salvo em C:/tmp/frontend-agenda_v2.png");
});

test("pty manager stores a compact finalized snapshot instead of the full narrated response", async () => {
  const manager = createManager({
    backend: "sdk",
    codexClientFactory: createFakeCodexClient([
      {
        events: async function* () {
          yield {
            type: "item.completed",
            item: {
              id: "item-finalized-snapshot",
              type: "agent_message",
              text: [
                "Fechei o recorte principal do backend.",
                "",
                "Validação:",
                "- npm run check passou",
                "- npm test passou",
                "",
                "O que sobra depois:",
                "- revisar residual final"
              ].join("\n")
            }
          };
          yield {
            type: "turn.completed",
            usage: {
              input_tokens: 1,
              cached_input_tokens: 0,
              output_tokens: 1
            }
          };
        }
      }
    ])
  });

  await manager.sendPrompt({ chat: { id: 182 } }, "continue do ponto certo");
  await waitFor(() => !manager.getStatus(182).active);

  const projectState = manager.getProjectState(182, process.cwd());
  assert.match(
    projectState.lastFinalResponseText || "",
    /Fechei o recorte principal do backend/i
  );
  assert.doesNotMatch(projectState.lastFinalResponseText || "", /Validação:/i);
  assert.doesNotMatch(
    projectState.lastFinalResponseText || "",
    /O que sobra depois:/i
  );
});

test("pty manager can suppress sdk streaming and send only the final response text", async () => {
  const sentMessages: SentMessageRecord[] = [];
  const finalized: string[] = [];
  const manager = createManager({
    backend: "sdk",
    telegram: {
      sendMessage: async (chatId: string | number, text: string) => {
        sentMessages.push({ chatId, text });
        return { message_id: sentMessages.length };
      },
      editMessageText: async () => ({}),
      deleteMessage: async () => ({})
    },
    onResponseFinalized: async ({ text }) => {
      finalized.push(text);
    },
    codexClientFactory: createFakeCodexClient([
      {
        events: async function* () {
          yield {
            type: "item.completed",
            item: {
              id: "item-thinking",
              type: "reasoning",
              text: "Thinking about the specialist table."
            }
          };
          yield {
            type: "error",
            message: "in-process app-server event stream lagged"
          };
          yield {
            type: "item.completed",
            item: {
              id: "item-final",
              type: "agent_message",
              text: "Tema da reuniao\n\nMesa convocada: memoria-viva e sprinter."
            }
          };
          yield {
            type: "turn.completed",
            usage: {
              input_tokens: 1,
              cached_input_tokens: 0,
              output_tokens: 1
            }
          };
        }
      }
    ])
  });

  await manager.sendPrompt({ chat: { id: 21 } }, "prepare a meeting", {
    silentOutput: true
  });
  await waitFor(() => !manager.getStatus(21).active);

  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /Tema da reuniao/);
  assert.doesNotMatch(sentMessages[0].text, /lagged/);
  assert.doesNotMatch(sentMessages[0].text, /Thinking about/);
  assert.deepEqual(finalized, [
    "Tema da reuniao\n\nMesa convocada: memoria-viva e sprinter."
  ]);
});

test("pty manager hides exec fallback notices when verbose output is off", async () => {
  const sentMessages: SentMessageRecord[] = [];
  const manager = createManager({
    telegram: {
      sendMessage: async (chatId: string | number, text: string) => {
        sentMessages.push({ chatId, text });
        return { message_id: sentMessages.length };
      },
      editMessageText: async () => ({}),
      deleteMessage: async () => ({})
    }
  });

  manager.ensureSession = () => null;
  manager.startExecSessionWithOptions = () => createExecFallbackSession("77");

  await manager.sendPrompt({ chat: { id: 77 } }, "who are u");

  assert.equal(sentMessages.length, 0);
});

test("pty manager blocks a prompt when another chat is active in the same workdir", async () => {
  const manager = createManager({
    backend: "sdk",
    codexClientFactory: createFakeCodexClient([
      {
        events: async function* () {
          yield {
            type: "item.completed",
            item: {
              id: "item-1",
              type: "agent_message",
              text: "should not run"
            }
          };
        }
      }
    ])
  });

  manager.sessions.set(
    "2",
    createExecFallbackSession("2", process.cwd(), "sdk")
  );

  const result = await manager.sendPrompt({ chat: { id: 1 } }, "edit files");

  assert.deepEqual(result, {
    started: false,
    reason: "workspace_busy",
    activeMode: "sdk",
    blockingChatId: "2",
    relativeWorkdir: "."
  });
});

test("pty manager replays a blocked prompt once through the continue path", async () => {
  const calls: FakeCall[] = [];
  const manager = createManager({
    backend: "sdk",
    codexClientFactory: createFakeCodexClient(
      [
        {
          initialId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          events: async function* () {
            yield {
              type: "item.completed",
              item: {
                id: "item-continue",
                type: "agent_message",
                text: "continued"
              }
            };
            yield {
              type: "turn.completed",
              usage: {
                input_tokens: 1,
                cached_input_tokens: 0,
                output_tokens: 1
              }
            };
          }
        }
      ],
      calls
    )
  });

  manager.sessions.set(
    "2",
    createExecFallbackSession("2", process.cwd(), "sdk")
  );

  const blocked = await manager.sendPrompt(
    { chat: { id: 1 } },
    "apply patch and run tests"
  );

  assert.equal(blocked.started, false);
  assert.equal(blocked.reason, "workspace_busy");

  manager.sessions.delete("2");

  const continued = await manager.continuePendingPrompt({
    chat: { id: 1 }
  });

  assert.equal(continued.started, true);
  assert.equal(continued.mode, "sdk");
  await waitFor(() => !manager.getStatus(1).active);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, "start");

  const nonePending = await manager.continuePendingPrompt({
    chat: { id: 1 }
  });

  assert.deepEqual(nonePending, {
    started: false,
    reason: "no_pending_prompt"
  });
});

test("pty manager shows exec fallback notices when verbose output is on", async () => {
  const sentMessages: SentMessageRecord[] = [];
  const manager = createManager({
    telegram: {
      sendMessage: async (chatId: string | number, text: string) => {
        sentMessages.push({ chatId, text });
        return { message_id: sentMessages.length };
      },
      editMessageText: async () => ({}),
      deleteMessage: async () => ({})
    }
  });

  manager.setVerbose(77, true);
  manager.ensureSession = () => null;
  manager.startExecSessionWithOptions = () => createExecFallbackSession("77");

  await manager.sendPrompt({ chat: { id: 77 } }, "who are u");

  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /Interactive terminal is unavailable/);
});
