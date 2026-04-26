import type { Locale } from "../bot/i18n.js";
import { t } from "../bot/i18n.js";
import { buildFinalResponseAutopilotPrompt } from "../bot/handlers.js";

interface SpecialAutopilotRunnerLike {
  getSpecialAutopilotStatus(chatId: string | number): {
    enabled: boolean;
    remainingResponses: number;
  };
  clearSpecialAutopilot(chatId: string | number): {
    enabled: boolean;
    remainingResponses: number;
  };
  consumeSpecialAutopilotStep(chatId: string | number): {
    enabled: boolean;
    remainingResponses: number;
  };
  sendPrompt(
    ctx: { chat: { id: string | number } },
    prompt: string,
    options?: {
      queueLabel?: string;
      queueOnBusy?: boolean;
    }
  ): Promise<{
    started: boolean;
    reason?: string;
  }>;
}

interface SpecialAutopilotBotLike {
  telegram: {
    sendMessage(
      chatId: string | number,
      text: string,
      options?: Record<string, unknown>
    ): Promise<unknown>;
  };
}

export interface SpecialAutopilotRunResult {
  triggered: boolean;
  blocked: boolean;
  stopped: boolean;
  remainingResponses: number;
}

function normalizeAutopilotText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function shouldStopSpecialAutopilotForFinalizedText(
  text: string
): boolean {
  const normalized = normalizeAutopilotText(text);
  if (!normalized) {
    return false;
  }

  const noOpenWork =
    /\bnao (?:ha|existe|tem) (?:nenhum )?(?:bloco|sprint|corte|trabalho|passo)(?: [a-z0-9_-]+){0,4} aberto\b/.test(
      normalized
    ) ||
    /\bsem (?:bloco|sprint|corte|trabalho|proximo passo) aberto\b/.test(
      normalized
    );
  if (noOpenWork) {
    return true;
  }

  const explicitOpenWork =
    /\b(?:ha|existe|tem) (?:um |uma |algum |alguma )?(?:bloco|sprint|corte|trabalho|passo)(?: [a-z0-9_-]+){0,4} aberto\b/.test(
      normalized
    ) ||
    /\bproximo (?:bloco|sprint|corte|trabalho|passo)(?: [a-z0-9_-]+){0,4} aberto\b/.test(
      normalized
    );
  if (explicitOpenWork) {
    return false;
  }

  const closedLine =
    /\b(?:linha|plano|bloco|sprint) (?:ja )?(?:(?:esta|ficou|segue) )?(?:em )?100(?:%| por cento)/.test(
      normalized
    ) ||
    /\b(?:estado|linha|bloco|sprint) (?:ja )?(?:(?:esta|ficou|segue) )?fechad[oa]s?\b/.test(
      normalized
    ) ||
    /\b(?:manter|parar|segurar) (?:parado )?(?:em )?(?:estado )?fechad[oa]s?\b/.test(
      normalized
    );
  const inertiaGate =
    /\bgate:\s*nao executar\b/.test(normalized) ||
    /\bnao (?:executar|agir|avancar) por inercia\b/.test(normalized);
  const explicitNewCutRequired =
    /\b(?:novo corte explicito|abrir explicitamente outro bloco|recorte de novo bloco|novo bloco explicito)\b/.test(
      normalized
    ) ||
    /\bse quiser continuar,? (?:peca|pede|chame|chamar) .*(?:novo bloco|novo corte|paula planeja)\b/.test(
      normalized
    );

  return closedLine || inertiaGate || explicitNewCutRequired;
}

export async function maybeRunSpecialAutopilotAfterFinalized({
  bot,
  ptyManager,
  chatId,
  locale,
  text
}: {
  bot: SpecialAutopilotBotLike;
  ptyManager: SpecialAutopilotRunnerLike;
  chatId: string | number;
  locale: Locale;
  text: string;
}): Promise<SpecialAutopilotRunResult> {
  const current = ptyManager.getSpecialAutopilotStatus(chatId);
  if (!current.enabled || current.remainingResponses <= 0) {
    return {
      triggered: false,
      blocked: false,
      stopped: false,
      remainingResponses: 0
    };
  }

  if (shouldStopSpecialAutopilotForFinalizedText(text)) {
    const next = ptyManager.clearSpecialAutopilot(chatId);
    await bot.telegram.sendMessage(
      chatId,
      t(locale, "autopilotLoopStoppedClosedLine")
    );
    return {
      triggered: false,
      blocked: false,
      stopped: true,
      remainingResponses: next.remainingResponses
    };
  }

  const result = await ptyManager.sendPrompt(
    { chat: { id: chatId } },
    buildFinalResponseAutopilotPrompt(text),
    {
      queueLabel: "Piloto automatico especial acionado",
      queueOnBusy: false
    }
  );

  if (!result.started) {
    await bot.telegram.sendMessage(chatId, t(locale, "autopilotLoopBlocked"));
    return {
      triggered: false,
      blocked: true,
      stopped: false,
      remainingResponses: current.remainingResponses
    };
  }

  const next = ptyManager.consumeSpecialAutopilotStep(chatId);
  await bot.telegram.sendMessage(
    chatId,
    t(locale, "autopilotLoopTriggered", {
      remaining: next.remainingResponses
    })
  );

  return {
    triggered: true,
    blocked: false,
    stopped: false,
    remainingResponses: next.remainingResponses
  };
}
