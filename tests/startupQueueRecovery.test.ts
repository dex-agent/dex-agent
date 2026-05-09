import test from "node:test";
import assert from "node:assert/strict";
import {
  notifyRecoverableQueuesOnStartup,
  notifyBootReadyOnStartup
} from "../src/bot/startupQueueRecovery.js";

test("startup queue recovery keeps manual buttons as fallback when auto-run cannot start", async () => {
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
          chatId: "100000001",
          queueLength: 2,
          workdir: "C:/Users/TestUser/Projetos/ProjetoAlphaTeste",
          relativeWorkdir: "ProjetoAlphaTeste",
          nextItem: {
            id: "queue-1",
            index: 1,
            text: "continuar o proximo sprint",
            workdir: "C:/Users/TestUser/Projetos/ProjetoAlphaTeste",
            relativeWorkdir: "ProjetoAlphaTeste",
            createdAt: new Date().toISOString()
          }
        }
      ],
      runNextQueuedPrompt: async () => ({
        started: false,
        reason: "busy",
        activeMode: "sdk"
      }),
      getLanguage: () => "en"
    } as any,
    "startup"
  );

  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, "100000001");
  assert.match(sent[0].text, /fila pendente/i);
  assert.match(sent[0].text, /inicializacao do bot/i);
  assert.match(sent[0].text, /ProjetoAlphaTeste/);
  const inlineKeyboard = (
    sent[0].options?.reply_markup as {
      inline_keyboard?: Array<Array<{ callback_data?: string }>>;
    }
  )?.inline_keyboard;
  assert.deepEqual(
    inlineKeyboard?.[0]?.map((button) => button.callback_data),
    ["queue:run", "queue:list"]
  );
  assert.equal(inlineKeyboard?.[1]?.[0]?.callback_data, "queue:clear");
});

test("startup queue recovery auto-runs the next queued item when possible", async () => {
  const sent: Array<{
    chatId: string | number;
    text: string;
    options?: Record<string, unknown>;
  }> = [];
  let runCalls = 0;

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
          chatId: "100000001",
          queueLength: 3,
          workdir: "C:/Users/TestUser/Projetos/ProjetoAlphaTeste",
          relativeWorkdir: "ProjetoAlphaTeste",
          nextItem: {
            id: "queue-1",
            index: 1,
            text: "continuar o proximo sprint",
            workdir: "C:/Users/TestUser/Projetos/ProjetoAlphaTeste",
            relativeWorkdir: "ProjetoAlphaTeste",
            createdAt: new Date().toISOString()
          }
        }
      ],
      runNextQueuedPrompt: async () => {
        runCalls += 1;
        return {
          started: true,
          mode: "sdk"
        };
      },
      getLanguage: () => "pt-BR"
    } as any,
    "restart"
  );

  assert.equal(runCalls, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /apos o restart do bot/i);
  assert.match(sent[0].text, /item iniciado automaticamente/i);
  assert.match(sent[0].text, /itens restantes na fila: 2/i);
  const inlineKeyboard = (
    sent[0].options?.reply_markup as {
      inline_keyboard?: Array<Array<{ callback_data?: string }>>;
    }
  )?.inline_keyboard;
  assert.deepEqual(
    inlineKeyboard?.map((row) => row.map((button) => button.callback_data)),
    [["queue:list"], ["queue:clear"]]
  );
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
    } as any,
    "startup"
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
        chatId === "100000001" ? "ProjetoAlphaTeste" : "dex-agent"
    } as any,
    ["100000001", "123"],
    "restart"
  );

  assert.equal(sent.length, 2);
  const targetMessage = sent.find((item) => item.chatId === "100000001");
  assert.ok(targetMessage);
  assert.match(targetMessage.text, /restart finished/i);
  assert.match(targetMessage.text, /ProjetoAlphaTeste/);
});

test("boot-ready notification skips chats already covered by queue recovery", async () => {
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
      getLanguage: () => "pt-BR",
      getRelativeWorkdir: (chatId: string | number) =>
        chatId === "123" ? "dex-agent" : "ProjetoAlphaTeste"
    } as any,
    ["100000001", "123"],
    "startup",
    new Set(["100000001"])
  );

  assert.deepEqual(
    sent.map((item) => item.chatId),
    ["123"]
  );
  assert.match(sent[0].text, /iniciou e esta pronto/i);
});
