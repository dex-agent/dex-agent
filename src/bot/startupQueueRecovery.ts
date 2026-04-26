import { t } from "./i18n.js";
import type { PtyManager } from "../runner/ptyManager.js";

interface TelegramApiLike {
  sendMessage(
    chatId: string | number,
    text: string,
    options?: Record<string, unknown>
  ): Promise<unknown>;
}

interface BotLike {
  telegram: TelegramApiLike;
}

interface StartupNotifierPtyLike {
  exportState(): { chats?: Record<string, unknown> };
  getLanguage(chatId: string | number): string;
  getRelativeWorkdir(chatId: string | number): string;
}

export async function notifyRecoverableQueuesOnStartup(
  bot: BotLike,
  ptyManager: PtyManager,
  bootMode: "startup" | "restart"
): Promise<Set<string>> {
  const recoverableChats = ptyManager.listRecoverableQueuedChats();
  const handledChatIds = new Set<string>();

  for (const item of recoverableChats) {
    const locale = ptyManager.getLanguage(item.chatId);
    handledChatIds.add(String(item.chatId));
    const runResult = await ptyManager
      .runNextQueuedPrompt({ chat: { id: item.chatId } } as any)
      .catch(() => null);

    if (runResult?.started) {
      const remainingCount = Math.max(0, item.queueLength - 1);
      const inlineKeyboard =
        remainingCount > 0
          ? [
              [
                {
                  text: t(locale, "buttonQueueView"),
                  callback_data: "queue:list"
                }
              ],
              [
                {
                  text: t(locale, "buttonQueueClear"),
                  callback_data: "queue:clear"
                }
              ]
            ]
          : undefined;

      await bot.telegram
        .sendMessage(
          item.chatId,
          t(locale, "queueStartupAutoRun", {
            count: item.queueLength,
            relativeWorkdir: item.relativeWorkdir,
            text: item.nextItem.text,
            remainingCount,
            mode: runResult.mode,
            bootMode
          }),
          inlineKeyboard
            ? {
                reply_markup: {
                  inline_keyboard: inlineKeyboard
                }
              }
            : undefined
        )
        .catch(() => {});
      continue;
    }

    await bot.telegram
      .sendMessage(
        item.chatId,
        t(locale, "queueStartupRecovery", {
          count: item.queueLength,
          relativeWorkdir: item.relativeWorkdir,
          text: item.nextItem.text,
          bootMode
        }),
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: t(locale, "buttonQueueRunNow"),
                  callback_data: "queue:run"
                },
                {
                  text: t(locale, "buttonQueueView"),
                  callback_data: "queue:list"
                }
              ],
              [
                {
                  text: t(locale, "buttonQueueClear"),
                  callback_data: "queue:clear"
                }
              ]
            ]
          }
        }
      )
      .catch(() => {});
  }

  return handledChatIds;
}

export async function notifyBootReadyOnStartup(
  bot: BotLike,
  ptyManager: StartupNotifierPtyLike,
  proactiveUserIds: Array<string | number>,
  mode: "startup" | "restart",
  skipChatIds: Iterable<string | number> = []
): Promise<void> {
  const skipSet = new Set(
    Array.from(skipChatIds, (value) => String(value)).filter(Boolean)
  );
  const chats = [
    ...new Set(proactiveUserIds.map((value) => String(value)).filter(Boolean))
  ];

  for (const chatId of chats) {
    if (skipSet.has(String(chatId))) {
      continue;
    }

    const locale = ptyManager.getLanguage(chatId);
    const relativeWorkdir = ptyManager.getRelativeWorkdir(chatId);

    await bot.telegram
      .sendMessage(
        chatId,
        t(locale, mode === "restart" ? "restartReady" : "startupReady", {
          relativeWorkdir
        })
      )
      .catch(() => {});
  }
}
