import test from "node:test";
import assert from "node:assert/strict";
import {
  maybeRunSpecialAutopilotAfterFinalized,
  shouldStopSpecialAutopilotForFinalizedText
} from "../src/lib/specialAutopilot.js";

test("special autopilot follows automatically and consumes one configured response", async () => {
  const sentMessages: string[] = [];
  let consumed = 0;
  const prompts: string[] = [];

  const result = await maybeRunSpecialAutopilotAfterFinalized({
    bot: {
      telegram: {
        sendMessage: async (_chatId: string | number, text: string) => {
          sentMessages.push(text);
          return {};
        }
      }
    },
    ptyManager: {
      getSpecialAutopilotStatus: () => ({
        enabled: true,
        remainingResponses: 2
      }),
      clearSpecialAutopilot: () => ({
        enabled: false,
        remainingResponses: 0
      }),
      consumeSpecialAutopilotStep: () => {
        consumed += 1;
        return {
          enabled: true,
          remainingResponses: 1
        };
      },
      sendPrompt: async (_ctx, prompt) => {
        prompts.push(prompt);
        return {
          started: true
        };
      }
    },
    chatId: 1,
    locale: "pt-BR",
    text: "Bloco atual concluido e pronto para seguir."
  });

  assert.equal(result.triggered, true);
  assert.equal(result.blocked, false);
  assert.equal(result.remainingResponses, 1);
  assert.equal(consumed, 1);
  assert.match(prompts[0] || "", /\$ancora-fluxo/i);
  assert.match(sentMessages[0] || "", /Restantes: 1/i);
});

test("special autopilot keeps the mode armed when it cannot continue automatically", async () => {
  const sentMessages: string[] = [];
  let consumed = 0;

  const result = await maybeRunSpecialAutopilotAfterFinalized({
    bot: {
      telegram: {
        sendMessage: async (_chatId: string | number, text: string) => {
          sentMessages.push(text);
          return {};
        }
      }
    },
    ptyManager: {
      getSpecialAutopilotStatus: () => ({
        enabled: true,
        remainingResponses: 3
      }),
      clearSpecialAutopilot: () => ({
        enabled: false,
        remainingResponses: 0
      }),
      consumeSpecialAutopilotStep: () => {
        consumed += 1;
        return {
          enabled: true,
          remainingResponses: 2
        };
      },
      sendPrompt: async () => ({
        started: false,
        reason: "workspace_busy"
      })
    },
    chatId: 1,
    locale: "pt-BR",
    text: "Ainda ha sprint aberto."
  });

  assert.equal(result.triggered, false);
  assert.equal(result.blocked, true);
  assert.equal(result.remainingResponses, 3);
  assert.equal(consumed, 0);
  assert.match(sentMessages[0] || "", /nao conseguiu seguir automaticamente/i);
});

test("special autopilot stops when the finalized response closes the line", async () => {
  const sentMessages: string[] = [];
  let cleared = 0;
  let consumed = 0;
  let prompted = 0;

  const result = await maybeRunSpecialAutopilotAfterFinalized({
    bot: {
      telegram: {
        sendMessage: async (_chatId: string | number, text: string) => {
          sentMessages.push(text);
          return {};
        }
      }
    },
    ptyManager: {
      getSpecialAutopilotStatus: () => ({
        enabled: true,
        remainingResponses: 2
      }),
      clearSpecialAutopilot: () => {
        cleared += 1;
        return {
          enabled: false,
          remainingResponses: 0
        };
      },
      consumeSpecialAutopilotStep: () => {
        consumed += 1;
        return {
          enabled: true,
          remainingResponses: 1
        };
      },
      sendPrompt: async () => {
        prompted += 1;
        return {
          started: true
        };
      }
    },
    chatId: 1,
    locale: "pt-BR",
    text: [
      "Veredito: Vera Veredito | post-flight",
      "result: nao existe bloco aberto nem proximo corte aprovado",
      "gate: nao executar por inercia",
      "Proximo passo: manter parado em estado fechado."
    ].join("\n")
  });

  assert.equal(result.triggered, false);
  assert.equal(result.blocked, false);
  assert.equal(result.stopped, true);
  assert.equal(result.remainingResponses, 0);
  assert.equal(cleared, 1);
  assert.equal(consumed, 0);
  assert.equal(prompted, 0);
  assert.match(sentMessages[0] || "", /parou com seguranca/i);
  assert.match(sentMessages[0] || "", /Por que parou/i);
  assert.match(sentMessages[0] || "", /Ponto cego/i);
  assert.match(sentMessages[0] || "", /Dica de ouro/i);
  assert.match(sentMessages[0] || "", /Opcoes seguras/i);
});

test("terminal autopilot stop detector covers closed-block language", () => {
  assert.equal(
    shouldStopSpecialAutopilotForFinalizedText(
      "A linha ja esta em 100% e o proximo passo seguro e parar em estado fechado."
    ),
    true
  );
  assert.equal(
    shouldStopSpecialAutopilotForFinalizedText(
      "Bloco atual concluido e pronto para seguir para o proximo sprint."
    ),
    false
  );
});

test("terminal autopilot stop detector covers common accented closed-line language", () => {
  assert.equal(
    shouldStopSpecialAutopilotForFinalizedText(
      "Veredito: a linha está fechada. Próximo passo: manter fechado."
    ),
    true
  );
  assert.equal(
    shouldStopSpecialAutopilotForFinalizedText(
      "Veredito: linha já está em 100% e sem retorno para Construir."
    ),
    true
  );
  assert.equal(
    shouldStopSpecialAutopilotForFinalizedText(
      "Veredito: bloco em 100%. Próximo passo: manter fechado."
    ),
    true
  );
  assert.equal(
    shouldStopSpecialAutopilotForFinalizedText(
      "Veredito: linha fechada, mas há próximo sprint aberto."
    ),
    false
  );
});

test("terminal autopilot stop detector preserves explicit open continuation", () => {
  assert.equal(
    shouldStopSpecialAutopilotForFinalizedText(
      "Veredito: linha fechada, mas ha proximo bloco aberto para executar."
    ),
    false
  );
});
