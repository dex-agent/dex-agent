import test from "node:test";
import assert from "node:assert/strict";
import { AudioSummaryManager } from "../src/lib/audioSummaryManager.js";

test("audio summary manager sends telegram voice notes instead of audio files", async () => {
  const voiceCalls: Array<{
    chatId: string | number;
    voice: { source: string; filename?: string };
    options?: Record<string, unknown>;
  }> = [];

  const manager = new AudioSummaryManager({
    bot: {
      telegram: {
        sendMessage: async () => ({}),
        sendVoice: async (
          chatId: string | number,
          voice: { source: string; filename?: string },
          options?: Record<string, unknown>
        ) => {
          voiceCalls.push({ chatId, voice, options });
          return {};
        }
      }
    } as any,
    tts: {
      config: {
        cacheTtlMs: 1000
      },
      isEnabled: () => true,
      shouldOfferSummary: () => true,
      summarize: (text: string) => text,
      synthesize: async () => ({
        filePath: "/tmp/dex-agent-resumo.ogg",
        fileName: "dex-agent-resumo.ogg",
        cleanup: async () => {}
      })
    } as any
  });

  const sent = await manager.sendSummaryForChat(1, "Resumo do projeto");

  assert.equal(sent, true);
  assert.equal(voiceCalls.length, 1);
  assert.equal(voiceCalls[0].chatId, 1);
  assert.deepEqual(voiceCalls[0].voice, {
    source: "/tmp/dex-agent-resumo.ogg",
    filename: "dex-agent-resumo.ogg"
  });
  assert.equal(voiceCalls[0].options, undefined);
});

test("audio summary manager supports detailed mode callbacks", async () => {
  const summarizeCalls: Array<{ text: string; mode?: string }> = [];

  const manager = new AudioSummaryManager({
    bot: {
      telegram: {
        sendMessage: async () => ({}),
        sendVoice: async () => ({})
      }
    } as any,
    tts: {
      config: {
        cacheTtlMs: 1000
      },
      isEnabled: () => true,
      shouldOfferSummary: () => true,
      summarize: (text: string, mode?: string) => {
        summarizeCalls.push({ text, mode });
        return text;
      },
      synthesize: async () => ({
        filePath: "/tmp/dex-agent-resumo.ogg",
        fileName: "dex-agent-resumo.ogg",
        cleanup: async () => {}
      })
    } as any
  });

  const requestId = manager.createSummaryRequest(
    1,
    "Resumo detalhado do projeto"
  );
  assert.ok(requestId);

  const ok = await manager.handleCallback(
    {
      chat: { id: 1 },
      answerCbQuery: async () => ({})
    },
    `detailed:${requestId}`,
    "en"
  );

  assert.equal(ok, true);
  assert.equal(summarizeCalls.length, 1);
  assert.equal(summarizeCalls[0].mode, "detailed");
});

test("audio summary manager can publish final action buttons for a finalized result", async () => {
  const messageCalls: Array<{
    chatId: string | number;
    text: string;
    options?: Record<string, unknown>;
  }> = [];

  const manager = new AudioSummaryManager({
    bot: {
      telegram: {
        sendMessage: async (
          chatId: string | number,
          text: string,
          options?: Record<string, unknown>
        ) => {
          messageCalls.push({ chatId, text, options });
          return {};
        },
        sendVoice: async () => ({})
      }
    } as any,
    tts: {
      config: {
        cacheTtlMs: 1000
      },
      isEnabled: () => true,
      shouldOfferSummary: () => true,
      summarize: (text: string) => text,
      synthesize: async () => ({
        filePath: "/tmp/dex-agent-resumo.ogg",
        fileName: "dex-agent-resumo.ogg",
        cleanup: async () => {}
      })
    } as any
  });

  const sent = await manager.offerFinalActionsForChat(
    1,
    "Sprint concluido com sucesso.",
    "en",
    "C:/CodexProjetos/AgendadorConsultasOticas"
  );

  assert.equal(sent, true);
  assert.equal(messageCalls.length, 1);
  assert.match(messageCalls[0].text, /How should I proceed from here/i);
  const inlineKeyboard = (
    messageCalls[0].options?.reply_markup as {
      inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>>;
    }
  )?.inline_keyboard;
  assert.equal(inlineKeyboard?.[1]?.[0]?.text, "✅ Execute next step");
  assert.equal(inlineKeyboard?.[1]?.[1]?.text, "🧠 Start review");
  assert.equal(inlineKeyboard?.[1]?.[2]?.text, "📥 Open inbox now");
  assert.match(
    inlineKeyboard?.[0]?.[0]?.callback_data || "",
    /^audio:summary:concise:/
  );
  assert.match(
    inlineKeyboard?.[0]?.[1]?.callback_data || "",
    /^audio:summary:detailed:/
  );
  assert.match(
    inlineKeyboard?.[1]?.[0]?.callback_data || "",
    /^final_action:execute:/
  );
  assert.match(
    inlineKeyboard?.[1]?.[1]?.callback_data || "",
    /^final_action:review:/
  );
  assert.match(
    inlineKeyboard?.[1]?.[2]?.callback_data || "",
    /^final_action:organize:/
  );
});
