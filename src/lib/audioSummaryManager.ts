import { randomUUID } from "node:crypto";
import { Markup } from "telegraf";
import type { Locale } from "../bot/i18n.js";
import { t } from "../bot/i18n.js";
import { AudioTts, type AudioSummaryMode } from "./audioTts.js";

interface SummaryRecord {
  chatId: string;
  text: string;
  workdir?: string;
  createdAt: number;
}

type FinalActionKind = "execute" | "review" | "organize";

interface TelegramAudioLike {
  sendMessage(
    chatId: string | number,
    text: string,
    options?: Record<string, unknown>
  ): Promise<unknown>;
  sendVoice(
    chatId: string | number,
    voice: { source: string; filename?: string },
    options?: Record<string, unknown>
  ): Promise<unknown>;
}

interface BotLike {
  telegram: TelegramAudioLike;
}

export class AudioSummaryManager {
  readonly bot: BotLike;
  readonly tts: AudioTts;
  readonly records = new Map<string, SummaryRecord>();

  constructor({ bot, tts }: { bot: BotLike; tts: AudioTts }) {
    this.bot = bot;
    this.tts = tts;
  }

  isEnabled(): boolean {
    return this.tts.isEnabled();
  }

  async offerForChat(
    chatId: string | number,
    text: string,
    locale: Locale
  ): Promise<boolean> {
    const offer = this.createOffer(chatId, text, locale);
    if (!offer) {
      return false;
    }

    await this.bot.telegram.sendMessage(chatId, offer.text, offer.options);
    return true;
  }

  async offerFinalActionsForChat(
    chatId: string | number,
    text: string,
    locale: Locale,
    workdir?: string
  ): Promise<boolean> {
    const offer = this.createFinalActionsOffer(chatId, text, locale, workdir);
    if (!offer) {
      return false;
    }

    await this.bot.telegram.sendMessage(chatId, offer.text, offer.options);
    return true;
  }

  async offerForContext(
    ctx: {
      chat: { id: string | number };
      reply(text: string, options?: Record<string, unknown>): Promise<unknown>;
    },
    text: string,
    locale: Locale
  ): Promise<boolean> {
    const offer = this.createOffer(ctx.chat.id, text, locale);
    if (!offer) {
      return false;
    }

    await ctx.reply(offer.text, offer.options);
    return true;
  }

  async sendSummaryForChat(
    chatId: string | number,
    text: string,
    mode: AudioSummaryMode = "concise"
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    const normalized = String(text || "").trim();
    if (!normalized) {
      return false;
    }

    const artifact = await this.tts.synthesize(
      this.tts.summarize(normalized, mode)
    );
    try {
      await this.bot.telegram.sendVoice(chatId, {
        source: artifact.filePath,
        filename: artifact.fileName
      });
    } finally {
      await artifact.cleanup();
    }

    return true;
  }

  createSummaryRequest(
    chatId: string | number,
    text: string,
    workdir?: string
  ): string | null {
    if (!this.isEnabled()) {
      return null;
    }

    const normalized = String(text || "").trim();
    if (!normalized) {
      return null;
    }

    return this.storeRequest(chatId, normalized, workdir);
  }

  resolveRequest(
    chatId: string | number,
    requestId: string
  ): SummaryRecord | null {
    this.pruneExpired();
    const record = this.records.get(requestId);
    if (!record || record.chatId !== String(chatId)) {
      return null;
    }

    return record;
  }

  async handleCallback(
    ctx: {
      chat: { id: string | number };
      answerCbQuery(text?: string): Promise<unknown>;
    },
    requestId: string,
    locale: Locale
  ): Promise<boolean> {
    this.pruneExpired();
    let mode: AudioSummaryMode = "concise";
    let normalizedRequestId = requestId;

    if (requestId.startsWith("detailed:")) {
      mode = "detailed";
      normalizedRequestId = requestId.replace(/^detailed:/, "");
    } else if (requestId.startsWith("concise:")) {
      normalizedRequestId = requestId.replace(/^concise:/, "");
    }

    const record = this.resolveRequest(ctx.chat.id, normalizedRequestId);
    if (!record) {
      await ctx.answerCbQuery(t(locale, "audioSummaryExpired"));
      return false;
    }

    await ctx.answerCbQuery(t(locale, "audioSummaryGenerating"));

    return this.sendSummaryForChat(ctx.chat.id, record.text, mode);
  }

  private createOffer(
    chatId: string | number,
    text: string,
    locale: Locale
  ): { text: string; options: Record<string, unknown> } | null {
    this.pruneExpired();
    if (!this.tts.shouldOfferSummary(text)) {
      return null;
    }

    const requestId = this.createSummaryRequest(chatId, text);
    if (!requestId) {
      return null;
    }

    return {
      text: t(locale, "audioSummaryOffer"),
      options: Markup.inlineKeyboard([
        Markup.button.callback(
          t(locale, "buttonAudioSummary"),
          `audio:summary:${requestId}`
        )
      ]) as unknown as Record<string, unknown>
    };
  }

  private createFinalActionsOffer(
    chatId: string | number,
    text: string,
    locale: Locale,
    workdir?: string
  ): { text: string; options: Record<string, unknown> } | null {
    const normalized = String(text || "").trim();
    if (!normalized) {
      return null;
    }

    const requestId = this.storeRequest(chatId, normalized, workdir);
    if (!requestId) {
      return null;
    }

    const rows: ReturnType<typeof Markup.button.callback>[][] = [];
    const finalActionChoices = this.buildFinalActionChoices(locale, normalized);

    if (this.tts.isEnabled()) {
      rows.push([
        Markup.button.callback(
          t(locale, "buttonAudioSummaryConcise"),
          `audio:summary:concise:${requestId}`
        ),
        Markup.button.callback(
          t(locale, "buttonAudioSummaryDetailed"),
          `audio:summary:detailed:${requestId}`
        )
      ]);
    }

    rows.push(
      finalActionChoices.map((choice) =>
        Markup.button.callback(
          choice.label,
          `final_action:${choice.kind}:${requestId}`
        )
      )
    );

    return {
      text: t(locale, "finalActionsOffer"),
      options: Markup.inlineKeyboard(rows) as unknown as Record<string, unknown>
    };
  }

  private storeRequest(
    chatId: string | number,
    text: string,
    workdir?: string
  ): string | null {
    this.pruneExpired();
    const requestId = randomUUID();
    this.records.set(requestId, {
      chatId: String(chatId),
      text,
      workdir,
      createdAt: Date.now()
    });
    return requestId;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, value] of this.records.entries()) {
      if (now - value.createdAt > this.tts.config.cacheTtlMs) {
        this.records.delete(key);
      }
    }
  }

  private buildFinalActionChoices(
    locale: Locale,
    text: string
  ): Array<{ kind: FinalActionKind; label: string }> {
    const recommended = this.inferRecommendedFinalAction(text);
    const order: FinalActionKind[] = [
      recommended,
      ...(["execute", "review", "organize"] as FinalActionKind[]).filter(
        (kind) => kind !== recommended
      )
    ];

    return order.map((kind) => ({
      kind,
      label:
        kind === recommended
          ? t(locale, this.recommendedLabelKey(kind))
          : t(locale, this.defaultLabelKey(kind))
    }));
  }

  private inferRecommendedFinalAction(text: string): FinalActionKind {
    const normalized = String(text || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();

    if (
      /\b(candidate|candidato|proposal|proposta|inbox|destino sugerido|skill candidate|skill candidata|promov(?:er|ida|ido|ida|idas|idos)?)\b/i.test(
        normalized
      )
    ) {
      return "organize";
    }

    if (
      /\b(revis|review|especialist|especialista|governanc|governanca|auditoria|tensao|risco|arquitet|ecossistema|familia|localiz)/i.test(
        normalized
      )
    ) {
      return "review";
    }

    return "execute";
  }

  private defaultLabelKey(kind: FinalActionKind): string {
    switch (kind) {
      case "review":
        return "buttonQuickReview";
      case "organize":
        return "buttonQuickOrganize";
      default:
        return "buttonQuickExecute";
    }
  }

  private recommendedLabelKey(kind: FinalActionKind): string {
    switch (kind) {
      case "review":
        return "buttonQuickReviewRecommended";
      case "organize":
        return "buttonQuickOrganizeRecommended";
      default:
        return "buttonQuickExecuteRecommended";
    }
  }
}
