import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import type { AppConfig } from "../src/config.js";
import { resolveCommandPath, runHealthcheck } from "../src/ops/healthcheck.js";

function createConfig(root: string): AppConfig {
  return {
    app: {
      name: "dex-agent",
      stateFile: path.join(root, ".codex-telegram-claws-state.json")
    },
    audio: {
      transcription: {
        apiKey: "",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini-transcribe",
        language: "pt",
        prompt: "",
        maxFileBytes: 20 * 1024 * 1024,
        enabled: false
      },
      tts: {
        enabled: false,
        provider: "edge",
        voice: "pt-BR-FranciscaNeural",
        rate: "+0%",
        pitch: "+0Hz",
        pythonCommand: "python",
        ffmpegCommand: "ffmpeg",
        offerMinChars: 900,
        summaryMaxChars: 650,
        cacheTtlMs: 1800000
      }
    },
    workspace: {
      root
    },
    instance: {
      contextMode: "workspace",
      id: "dex-agent",
      projectLabel: path.basename(root)
    },
    telegram: {
      botToken: "dummy-token",
      apiBase: "https://api.telegram.org",
      proxyUrl: undefined,
      allowedUserIds: ["1"],
      proactiveUserIds: []
    },
    runner: {
      backend: "sdk",
      command: "node",
      args: [],
      cwd: root,
      apiKey: "",
      baseUrl: "",
      sdkConfig: {},
      throttleMs: 10,
      maxBufferChars: 1000,
      telegramChunkSize: 3900,
      sdkThreadOptions: {
        skipGitRepoCheck: true,
        additionalDirectories: []
      }
    },
    reasoning: {
      mode: "spoiler"
    },
    shell: {
      enabled: false,
      readOnly: true,
      allowedCommands: [],
      dangerousCommands: [],
      timeoutMs: 5000,
      maxOutputChars: 4000
    },
    cron: {
      dailySummary: "0 9 * * *",
      timezone: "UTC"
    },
    mcp: {
      servers: []
    },
    github: {
      token: "",
      defaultWorkdir: root,
      defaultBranch: "main",
      e2eCommand: "npm test"
    }
  };
}

test("resolveCommandPath finds a binary from PATH", () => {
  const resolved = resolveCommandPath("node", process.env);

  assert.ok(resolved);
  assert.match(resolved, /node(?:\.exe)?$/i);
});

test("runHealthcheck passes for a valid local config", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-health-"));
  const config = createConfig(root);

  const result = await runHealthcheck(config, {
    env: process.env,
    canonicalRoot: root
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.checks.every((check) => typeof check.detail === "string"),
    true
  );
  assert.equal(
    result.checks.every((check) =>
      ["pass", "warn", "fail"].includes(check.status)
    ),
    true
  );
  assert.equal(
    result.checks.some((check) => check.status === "fail"),
    false
  );
});

test("runHealthcheck warns when the configured command is missing in non-strict mode", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-health-"));
  const config = createConfig(root);
  config.runner.command = "definitely-not-a-real-command";

  const result = await runHealthcheck(config, {
    env: process.env,
    canonicalRoot: root
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.checks.some((check) => check.status === "warn"),
    true
  );
});

test("runHealthcheck accepts fixed instance workdirs without canonical drift warnings", async () => {
  const engineRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claws-engine-"));
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claws-instance-"));
  const config = createConfig(projectRoot);
  config.instance = {
    contextMode: "instance",
    id: "agendador-consultas-oticas",
    projectLabel: "AgendadorConsultasOticas"
  };
  config.app.stateFile = path.join(
    projectRoot,
    "skills",
    "dex-agent",
    ".runtime",
    "dex-agent-state.json"
  );
  fs.mkdirSync(path.dirname(config.app.stateFile), { recursive: true });

  const result = await runHealthcheck(config, {
    env: process.env,
    canonicalRoot: engineRoot
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.checks.some((check) => check.name.includes("canonical drift")),
    false
  );
  assert.equal(
    result.checks.some(
      (check) => check.name === "instance mode" && check.status === "pass"
    ),
    true
  );
});

test("runHealthcheck warns on legacy path drift in non-strict mode", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-health-"));
  const config = createConfig(root);
  config.runner.cwd = "C:/CodexProjetos/ConfiguracoesWindows/DexAgent";
  config.github.defaultWorkdir =
    "C:/CodexProjetos/ConfiguracoesWindows/DexAgent";
  config.app.stateFile =
    "C:/CodexProjetos/ConfiguracoesWindows/DexAgent/.codex-telegram-claws-state.json";

  const result = await runHealthcheck(config, {
    env: process.env,
    canonicalRoot: root
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.checks.some(
      (check) =>
        check.name === "runner workdir legacy drift" && check.status === "warn"
    ),
    true
  );
  assert.equal(
    result.checks.some(
      (check) =>
        check.name === "state file legacy drift" && check.status === "warn"
    ),
    true
  );
  assert.equal(
    result.checks.some(
      (check) =>
        check.name === "runner workdir canonical drift" &&
        check.status === "warn"
    ),
    true
  );
});

test("runHealthcheck fails when the configured command is missing in strict mode", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-health-"));
  const config = createConfig(root);
  config.runner.command = "definitely-not-a-real-command";

  const result = await runHealthcheck(config, {
    env: process.env,
    strict: true,
    canonicalRoot: root
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.checks.some((check) => check.status === "fail"),
    true
  );
});

test("runHealthcheck fails on legacy path drift in strict mode", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-health-"));
  const config = createConfig(root);
  config.runner.cwd = "C:/CodexProjetos/ConfiguracoesWindows/DexAgent";

  const result = await runHealthcheck(config, {
    env: process.env,
    strict: true,
    canonicalRoot: root
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.checks.some(
      (check) =>
        check.name === "runner workdir legacy drift" && check.status === "fail"
    ),
    true
  );
  assert.equal(
    result.checks.some(
      (check) =>
        check.name === "runner workdir canonical drift" &&
        check.status === "fail"
    ),
    true
  );
});

test("runHealthcheck skips node-pty helper failures in strict mode when backend is sdk", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-health-"));
  const config = createConfig(root);

  const result = await runHealthcheck(config, {
    env: process.env,
    strict: true,
    canonicalRoot: root,
    ptyHelperCheck: () => ({
      path: "",
      changed: false,
      executable: false,
      error: "simulated missing spawn-helper"
    })
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.checks.some(
      (check) => check.name === "node-pty helper" && check.status === "pass"
    ),
    true
  );
});

test("runHealthcheck reports a passing live Codex probe when the backend responds", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-health-"));
  const config = createConfig(root);

  const result = await runHealthcheck(config, {
    env: process.env,
    canonicalRoot: root,
    codexLiveCheck: true,
    codexLiveRunner: async () => ({
      backend: "sdk",
      threadId: "thread-123",
      output: "HEALTHCHECK_OK"
    })
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.checks.some(
      (check) =>
        check.name === "codex live" &&
        check.status === "pass" &&
        check.detail.includes("HEALTHCHECK_OK")
    ),
    true
  );
});

test("runHealthcheck reports a failing live Codex probe when the backend check fails", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-health-"));
  const config = createConfig(root);

  const result = await runHealthcheck(config, {
    env: process.env,
    canonicalRoot: root,
    codexLiveCheck: true,
    codexLiveRunner: async () => {
      throw new Error("simulated codex failure");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.checks.some(
      (check) =>
        check.name === "codex live" &&
        check.status === "fail" &&
        check.detail.includes("simulated codex failure")
    ),
    true
  );
});
