import test from "node:test";
import assert from "node:assert/strict";
import {
  notifyRecoverableQueuesOnStartup,
  notifyBootReadyOnStartup
} from "../src/bot/startupQueueRecovery.js";

test("startup queue recovery announces idle queued chats with action buttons", async () => {
  const sent: Array<{
    chatId: string | number;
    text: string;
    options?: Record<string, unknown>;
  }> = [];

  await notifyRecoverableQueuesOnStartup(
    {
      telegram: {
        sendMessage: async (
          chatId: string | number,
          text: string,
          options?: Record<string, unknown>
        ) => {
          sent.push({ chatId, text, options });
          return {};
        }
      }
    },
    {
      listRecoverableQueuedChats: () => [
        {
          chatId: "8736107242",
          queueLength: 2,
          workdir: "C:/CodexProjetos/AgendadorConsultasOticas",
          relativeWorkdir: "AgendadorConsultasOticas",
          nextItem: {
            id: "queue-1",
            index: 1,
            text: "continuar o proximo sprint",
            workdir: "C:/CodexProjetos/AgendadorConsultasOticas",
            relativeWorkdir: "AgendadorConsultasOticas",
            createdAt: new Date().toISOString()
          }
        }
      ],
      getLanguage: () => "en"
    } as any
  );

  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, "8736107242");
  assert.match(sent[0].text, /fila pendente/i);
  assert.match(sent[0].text, /AgendadorConsultasOticas/);
  const inlineKeyboard = (sent[0].options?.reply_markup as {
    inline_keyboard?: Array<Array<{ callback_data?: string }>>;
  })?.inline_keyboard;
  assert.deepEqual(
    inlineKeyboard?.[0]?.map((button) => button.callback_data),
    ["queue:run", "queue:list"]
  );
  assert.equal(inlineKeyboard?.[1]?.[0]?.callback_data, "queue:clear");
});

test("startup queue recovery stays quiet when there is nothing recoverable", async () => {
  let called = false;

  await notifyRecoverableQueuesOnStartup(
    {
      telegram: {
        sendMessage: async () => {
          called = true;
          return {};
        }
      }
    },
    {
      listRecoverableQueuedChats: () => [],
      getLanguage: () => "en"
    } as any
  );

  assert.equal(called, false);
});

test("boot-ready notification announces that the bot is back", async () => {
  const sent: Array<{
    chatId: string | number;
    text: string;
  }> = [];

  await notifyBootReadyOnStartup(
    {
      telegram: {
        sendMessage: async (chatId: string | number, text: string) => {
          sent.push({ chatId, text });
          return {};
        }
      }
    },
    {
      getLanguage: () => "en",
      getRelativeWorkdir: (chatId: string | number) =>
        chatId === "8736107242" ? "AgendadorConsultasOticas" : "dex-agent"
    } as any,
    ["8736107242", "123"],
    "restart"
  );

  assert.equal(sent.length, 2);
  const targetMessage = sent.find((item) => item.chatId === "8736107242");
  assert.ok(targetMessage);
  assert.match(targetMessage.text, /restart finished/i);
  assert.match(targetMessage.text, /AgendadorConsultasOticas/);
});
