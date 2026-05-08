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
    ["**Proximo passo**", "Comecar pela fase 1 com o garimpeiro."].join("\n"),
    "en",
    "C:/CodexProjetos/ProjetoAlphaTeste"
  );

  assert.equal(sent, true);
  assert.equal(messageCalls.length, 1);
  assert.match(messageCalls[0].text, /Short suggestion:/i);
  assert.match(messageCalls[0].text, /Comecar pela fase 1/i);
  const inlineKeyboard = (
    messageCalls[0].options?.reply_markup as {
      inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>>;
    }
  )?.inline_keyboard;
  assert.equal(
    inlineKeyboard?.[1]?.[0]?.text,
    "-> Comecar pela fase 1 com o garimpeiro."
  );
  assert.equal(inlineKeyboard?.[1]?.[1]?.text, "Transform into planning");
  assert.equal(inlineKeyboard?.[2]?.[0]?.text, "Finish whole block");
  assert.equal(inlineKeyboard?.[2]?.[1]?.text, "Autopilot");
  assert.equal(inlineKeyboard?.[3]?.[0]?.text, "Autopilot x3");
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
    /^final_action:c1:/
  );
  assert.match(
    inlineKeyboard?.[1]?.[1]?.callback_data || "",
    /^final_action:pl:/
  );
  assert.match(
    inlineKeyboard?.[2]?.[0]?.callback_data || "",
    /^final_action:c3:/
  );
  assert.match(
    inlineKeyboard?.[2]?.[1]?.callback_data || "",
    /^final_action:ap:/
  );
  assert.match(
    inlineKeyboard?.[3]?.[0]?.callback_data || "",
    /^final_action:ax:/
  );
  for (const row of inlineKeyboard || []) {
    for (const button of row) {
      assert.ok(
        (button.callback_data || "").length <= 64,
        `callback_data too long: ${button.callback_data}`
      );
    }
  }
});

test("audio summary manager can recommend planning when the next step is no longer execution", async () => {
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
    [
      "O proximo passo seguro nao e execucao.",
      "",
      "**Proximo passo**",
      "Abrir explicitamente outro bloco."
    ].join("\n"),
    "en",
    "C:/CodexProjetos/dex-agent"
  );

  assert.equal(sent, true);
  const inlineKeyboard = (
    messageCalls[0]?.options?.reply_markup as {
      inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>>;
    }
  )?.inline_keyboard;
  assert.equal(
    inlineKeyboard?.[1]?.[0]?.text,
    "Abrir explicitamente outro bloco."
  );
  assert.equal(inlineKeyboard?.[1]?.[1]?.text, "-> Transform into planning");
  assert.match(messageCalls[0]?.text || "", /^How should I proceed/m);
  assert.match(messageCalls[0]?.text || "", /Short suggestion: \/plan/i);
});

test("audio summary manager shows handoff only for a single non-planning next specialist", async () => {
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
      isEnabled: () => false,
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
    [
      "**Proximo passo**",
      "Revisar os diffs do CTA final.",
      "",
      "**Proximo especialista indicado**",
      "Renata Review"
    ].join("\n"),
    "en",
    "C:/CodexProjetos/dex-agent"
  );

  assert.equal(sent, true);
  const inlineKeyboard = (
    messageCalls[0]?.options?.reply_markup as {
      inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>>;
    }
  )?.inline_keyboard;
  assert.equal(
    inlineKeyboard?.[0]?.[0]?.text,
    "Revisar os diffs do CTA final."
  );
  assert.equal(inlineKeyboard?.[0]?.[1]?.text, "-> Send to specialist");
  assert.match(inlineKeyboard?.[1]?.[0]?.text || "", /Start review/i);
  assert.match(
    inlineKeyboard?.[0]?.[1]?.callback_data || "",
    /^final_action:sp:/
  );

  messageCalls.length = 0;
  await manager.offerFinalActionsForChat(
    1,
    [
      "**Proximo passo**",
      "Abrir explicitamente outro bloco.",
      "",
      "**Proximo especialista indicado**",
      "$sprinter"
    ].join("\n"),
    "en",
    "C:/CodexProjetos/dex-agent"
  );

  const planningKeyboard = (
    messageCalls[0]?.options?.reply_markup as {
      inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>>;
    }
  )?.inline_keyboard;
  assert.equal(planningKeyboard?.[0]?.[1]?.text, "-> Transform into planning");
  assert.match(
    planningKeyboard?.[0]?.[1]?.callback_data || "",
    /^final_action:pl:/
  );
});

test("audio summary manager prefers explicit recommended next step over generic decision text", async () => {
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
      isEnabled: () => false,
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
    [
      "Proximo passo: decidir se vamos executar o replay vivo isolado.",
      "",
      "Proximo Passo Recomendado: Tereza Testa, execute o near_term_slot_duplo_lu_souza.",
      "",
      "Proximo especialista indicado: Tereza Testa."
    ].join("\n"),
    "pt-BR",
    "C:/CodexProjetos/ProjetoAlphaTeste"
  );

  assert.equal(sent, true);
  assert.match(messageCalls[0]?.text || "", /Recomendado: -> Tereza Testa/i);
  assert.match(messageCalls[0]?.text || "", /Sugestao curta: Tereza Testa/i);
  assert.doesNotMatch(messageCalls[0]?.text || "", /Prompt sugerido:/i);
  assert.doesNotMatch(messageCalls[0]?.text || "", /\/plan modo planejamento/i);

  const inlineKeyboard = (
    messageCalls[0]?.options?.reply_markup as {
      inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>>;
    }
  )?.inline_keyboard;

  assert.equal(
    inlineKeyboard?.[0]?.[0]?.text,
    "-> Tereza Testa, execute o near_term_slot_duplo_lu_souza."
  );
  assert.equal(inlineKeyboard?.[0]?.[1]?.text, "Encaminhar");
});

test("audio summary manager truncates suggested prompts without mojibake", async () => {
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
      isEnabled: () => false,
      shouldOfferSummary: () => true,
      summarize: (text: string) => text,
      synthesize: async () => ({
        filePath: "/tmp/dex-agent-resumo.ogg",
        fileName: "dex-agent-resumo.ogg",
        cleanup: async () => {}
      })
    } as any
  });

  const longStep = `Próximo passo: ${"validar o texto real do Telegram ".repeat(10)}`;
  const sent = await manager.offerFinalActionsForChat(
    1,
    longStep,
    "pt-BR",
    "C:/CodexProjetos/dex-agent"
  );

  assert.equal(sent, true);
  assert.doesNotMatch(messageCalls[0]?.text || "", /Ãƒ|Ã‚|Ä|Ã¢/);
  assert.match(messageCalls[0]?.text || "", /\.\.\./);
});

test("audio summary manager adds dynamic support buttons and recent-history prompt hints", async () => {
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
        cacheTtlMs: 60_000
      },
      isEnabled: () => false,
      shouldOfferSummary: () => true,
      summarize: (text: string) => text,
      synthesize: async () => ({
        filePath: "/tmp/dex-agent-resumo.ogg",
        fileName: "dex-agent-resumo.ogg",
        cleanup: async () => {}
      })
    } as any
  });

  await manager.offerFinalActionsForChat(
    1,
    ["**Proximo passo**", "Fechar o bloco anterior."].join("\n"),
    "pt-BR",
    "C:/CodexProjetos/dex-agent"
  );
  await manager.offerFinalActionsForChat(
    1,
    [
      "Ha divergencia e risco de regressao.",
      "",
      "**Proximo passo**",
      "Revisar o deploy com Renata Review."
    ].join("\n"),
    "pt-BR",
    "C:/CodexProjetos/dex-agent"
  );

  assert.match(messageCalls[1]?.text || "", /Sugestao curta:/i);
  assert.match(messageCalls[1]?.text || "", /Contexto recente:/i);
  const inlineKeyboard = (
    messageCalls[1]?.options?.reply_markup as {
      inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>>;
    }
  )?.inline_keyboard;
  assert.match(inlineKeyboard?.[1]?.[0]?.text || "", /Iniciar revisao/i);
  assert.equal(inlineKeyboard?.[1]?.[1]?.text, "Reuniao rapida");
  assert.match(
    inlineKeyboard?.[1]?.[1]?.callback_data || "",
    /^final_action:mt:/
  );
});
