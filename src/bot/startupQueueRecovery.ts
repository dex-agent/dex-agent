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
  ptyManager: PtyManager
): Promise<void> {
  const recoverableChats = ptyManager.listRecoverableQueuedChats();

  for (const item of recoverableChats) {
    const locale = ptyManager.getLanguage(item.chatId);
    await bot.telegram
      .sendMessage(
        item.chatId,
        t(locale, "queueStartupRecovery", {
          count: item.queueLength,
          relativeWorkdir: item.relativeWorkdir,
          text: item.nextItem.text
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
}

export async function notifyBootReadyOnStartup(
  bot: BotLike,
  ptyManager: StartupNotifierPtyLike,
  proactiveUserIds: Array<string | number>,
  mode: "startup" | "restart"
): Promise<void> {
  const chats = [
    ...new Set(proactiveUserIds.map((value) => String(value)).filter(Boolean))
  ];

  for (const chatId of chats) {
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
