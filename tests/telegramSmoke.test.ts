import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import assert from "node:assert/strict";
import test from "node:test";

function runTelegramSmokeAsync(env: NodeJS.ProcessEnv): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/telegramSmoke.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...env
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

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
        TELEGRAM_SMOKE_CHAT_ID: "100000001",
        ALLOWED_USER_IDS: "100000001",
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

test("telegram smoke does not echo env-derived expected username on mismatch", async () => {
  const server = http.createServer((request, response) => {
    if (request.url === "/bot123:abc/getMe") {
      response.writeHead(200, {
        "content-type": "application/json"
      });
      response.end(
        JSON.stringify({
          ok: true,
          result: {
            id: 123,
            username: "actual_bot"
          }
        })
      );
      return;
    }

    response.writeHead(404, {
      "content-type": "application/json"
    });
    response.end(JSON.stringify({ ok: false, description: "not found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    assert.notEqual(address, null);
    const { port } = address as AddressInfo;
    const apiBase = `http://127.0.0.1:${port}`;
    const result = await runTelegramSmokeAsync({
      BOT_TOKEN: "123:abc",
      TELEGRAM_API_BASE: apiBase,
      TELEGRAM_EXPECTED_USERNAME: "secret_expected_bot",
      TELEGRAM_SMOKE_CHAT_ID: "",
      ALLOWED_USER_IDS: ""
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Bot username mismatch\./);
    assert.doesNotMatch(result.stderr, /secret_expected_bot/);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
