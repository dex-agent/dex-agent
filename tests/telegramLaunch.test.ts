import test from "node:test";
import assert from "node:assert/strict";
import {
  isTelegramPollingConflict,
  launchTelegramBotWithRetry
} from "../src/telegramLaunch.js";

test("isTelegramPollingConflict detects Telegram 409 polling conflicts", () => {
  assert.equal(
    isTelegramPollingConflict({
      response: {
        error_code: 409,
        description:
          "Conflict: terminated by other getUpdates request; make sure that only one bot instance is running"
      }
    }),
    true
  );

  assert.equal(
    isTelegramPollingConflict(new Error("something else failed")),
    false
  );
});

test("launchTelegramBotWithRetry retries Telegram polling conflicts and then succeeds", async () => {
  let attempts = 0;
  const logs: string[] = [];
  let releasePolling: (() => void) | null = null;
  const bot = {
    botInfo: null,
    telegram: {
      getMe: async () => ({ username: "dex_parent_example_bot" }),
      deleteWebhook: async () => {}
    },
    async startPolling(): Promise<void> {
      attempts += 1;
      if (attempts < 3) {
        throw {
          response: {
            error_code: 409,
            description:
              "Conflict: terminated by other getUpdates request; make sure that only one bot instance is running"
          }
        };
      }

      await new Promise<void>((resolve) => {
        releasePolling = resolve;
      });
    }
  };

  const { pollingTask } = await launchTelegramBotWithRetry(
    bot,
    { dropPendingUpdates: true },
    {
      maxAttempts: 4,
      baseDelayMs: 1,
      readyDelayMs: 1,
      logger: (message) => logs.push(message)
    }
  );

  assert.equal(attempts, 3);
  assert.equal(logs.length, 2);
  assert.notEqual(releasePolling, null);
  releasePolling!();
  await pollingTask;
});

test("launchTelegramBotWithRetry stops on non-conflict errors", async () => {
  const bot = {
    botInfo: null,
    telegram: {
      getMe: async () => ({ username: "dex_parent_example_bot" }),
      deleteWebhook: async () => {}
    },
    async startPolling(): Promise<void> {
      throw new Error("boom");
    }
  };

  await assert.rejects(
    launchTelegramBotWithRetry(
      bot,
      { dropPendingUpdates: false },
      {
        maxAttempts: 4,
        baseDelayMs: 1,
        readyDelayMs: 1,
        logger: () => {}
      }
    ),
    /boom/
  );
});

test("launchTelegramBotWithRetry returns once polling is stable without waiting for shutdown", async () => {
  let releasePolling: (() => void) | null = null;
  const bot = {
    botInfo: null,
    telegram: {
      getMe: async () => ({ username: "dex_parent_example_bot" }),
      deleteWebhook: async () => {}
    },
    async startPolling(): Promise<void> {
      await new Promise<void>((resolve) => {
        releasePolling = resolve;
      });
    }
  };

  const startedAt = Date.now();
  const { pollingTask } = await launchTelegramBotWithRetry(
    bot,
    { dropPendingUpdates: false },
    {
      readyDelayMs: 5,
      logger: () => {}
    }
  );
  const elapsedMs = Date.now() - startedAt;

  assert.ok(elapsedMs < 250);
  assert.notEqual(releasePolling, null);
  releasePolling!();
  await pollingTask;
});
