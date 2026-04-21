import { toErrorMessage } from "./lib/errors.js";

interface LaunchOptions {
  dropPendingUpdates: boolean;
  allowedUpdates?: readonly string[];
}

interface TelegramApiLike {
  getMe(): Promise<unknown>;
  deleteWebhook(options: { drop_pending_updates?: boolean }): Promise<unknown>;
}

interface LaunchableBot {
  botInfo?: unknown;
  telegram: TelegramApiLike;
  startPolling(allowedUpdates?: readonly string[]): Promise<void>;
}

export function isTelegramPollingConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    response?: { error_code?: unknown; description?: unknown };
    message?: unknown;
  };

  const errorCode = Number(candidate.response?.error_code);
  const description = String(candidate.response?.description || candidate.message || "");

  return (
    errorCode === 409 ||
    /terminated by other getUpdates request/i.test(description)
  );
}

export async function launchTelegramBotWithRetry(
  bot: LaunchableBot,
  options: LaunchOptions,
  {
    maxAttempts = 8,
    baseDelayMs = 2000,
    readyDelayMs = 1000,
    logger = console.warn
  }: {
    maxAttempts?: number;
    baseDelayMs?: number;
    readyDelayMs?: number;
    logger?: (message: string) => void;
  } = {}
): Promise<{ pollingTask: Promise<void> }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      bot.botInfo ??= await bot.telegram.getMe();
      await bot.telegram.deleteWebhook({
        drop_pending_updates: options.dropPendingUpdates
      });

      const pollingPromise = Promise.resolve(
        bot.startPolling(options.allowedUpdates)
      );

      await Promise.race([
        pollingPromise,
        new Promise((resolve) => setTimeout(resolve, readyDelayMs))
      ]);

      return { pollingTask: pollingPromise };
    } catch (error) {
      lastError = error;

      if (!isTelegramPollingConflict(error) || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = baseDelayMs * attempt;
      logger(
        `[telegram] launch conflict (${attempt}/${maxAttempts}): ${toErrorMessage(error)}; retrying in ${delayMs}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
