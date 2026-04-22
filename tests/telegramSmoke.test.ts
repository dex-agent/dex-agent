import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

test("telegram smoke exits with a helpful error when BOT_TOKEN is missing", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/telegramSmoke.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BOT_TOKEN: ""
      },
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing BOT_TOKEN/);
});

test("telegram smoke refuses to send to the primary operator chat by default", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/telegramSmoke.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BOT_TOKEN: "123:abc",
        TELEGRAM_SMOKE_CHAT_ID: "8736107242",
        ALLOWED_USER_IDS: "8736107242",
        TELEGRAM_SMOKE_ALLOW_PRIMARY_CHAT: "",
        TELEGRAM_EXPECTED_USERNAME: ""
      },
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Refusing to send telegram smoke to the primary operator chat/i
  );
});
