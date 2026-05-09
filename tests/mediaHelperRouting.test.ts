import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function makeFixtureImage(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dex-print-"));
  const filePath = path.join(dir, "fixture.png");
  fs.writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return filePath;
}

test("dex-print dry-run prefers request chat over proactive and allowed fallbacks", () => {
  const fixture = makeFixtureImage();
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        repoRoot,
        "skills",
        "dex-print",
        "scripts",
        "send-dex-print.mjs"
      ),
      "--path",
      fixture,
      "--dry-run",
      "--json"
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DEX_REQUEST_CHAT_ID: "222",
        PROACTIVE_USER_IDS: "111",
        ALLOWED_USER_IDS: "111,222"
      }
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.chat_id, "222");
  assert.equal(payload.chat_id_source, "DEX_REQUEST_CHAT_ID");
});

test("dex-print dry-run prefers explicit chat id over environment", () => {
  const fixture = makeFixtureImage();
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        repoRoot,
        "skills",
        "dex-print",
        "scripts",
        "send-dex-print.mjs"
      ),
      "--path",
      fixture,
      "--chat-id",
      "333",
      "--dry-run",
      "--json"
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DEX_REQUEST_CHAT_ID: "222",
        PROACTIVE_USER_IDS: "111",
        ALLOWED_USER_IDS: "111,222"
      }
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.chat_id, "333");
  assert.equal(payload.chat_id_source, "--chat-id");
});

test("dex-audio dry-run prefers request chat over allowed fallback", () => {
  const result = spawnSync(
    process.platform === "win32" ? "powershell" : "pwsh",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(
        repoRoot,
        "skills",
        "dex-agent-audio-summary",
        "scripts",
        "send-dex-agent-audio-summary.ps1"
      ),
      "-Text",
      "teste de audio",
      "-DryRun"
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        BOT_TOKEN: "dummy-token",
        ALLOWED_USER_IDS: "111,222",
        PROACTIVE_USER_IDS: "111",
        DEX_REQUEST_CHAT_ID: "222"
      }
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.chatId, "222");
  assert.equal(payload.chatIdSource, "DEX_REQUEST_CHAT_ID");
});
