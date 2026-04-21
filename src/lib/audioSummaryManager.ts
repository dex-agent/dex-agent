import { randomUUID } from "node:crypto";
import { Markup } from "telegraf";
import type { Locale } from "../bot/i18n.js";
import { t } from "../bot/i18n.js";
import { AudioTts } from "./audioTts.js";

interface SummaryRecord {
  chatId: string;
  text: string;
  workdir?: string;
  createdAt: number;
}

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

  constructor({
    bot,
    tts
  }: {
    bot: BotLike;
    tts: AudioTts;
  }) {
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
      reply(
        text: string,
        options?: Record<string, unknown>
      ): Promise<unknown>;
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
    text: string
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    const normalized = String(text || "").trim();
    if (!normalized) {
      return false;
    }

    const artifact = await this.tts.synthesize(this.tts.summarize(normalized));
    try {
      await this.bot.telegram.sendVoice(
        chatId,
        {
          source: artifact.filePath,
          filename: artifact.fileName
        }
      );
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
    const record = this.resolveRequest(ctx.chat.id, requestId);
    if (!record) {
      await ctx.answerCbQuery(t(locale, "audioSummaryExpired"));
      return false;
    }

    await ctx.answerCbQuery(t(locale, "audioSummaryGenerating"));

    return this.sendSummaryForChat(ctx.chat.id, record.text);
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

    const firstRow = this.tts.isEnabled()
      ? [
          Markup.button.callback(
            t(locale, "buttonAudioSummary"),
            `audio:summary:${requestId}`
          ),
          Markup.button.callback(
            t(locale, "buttonQuickPlan"),
            `final_action:plan:${requestId}`
          )
        ]
      : [
          Markup.button.callback(
            t(locale, "buttonQuickPlan"),
            `final_action:plan:${requestId}`
          )
        ];

    return {
      text: t(locale, "finalActionsOffer"),
      options: Markup.inlineKeyboard([
        firstRow,
        [
          Markup.button.callback(
            t(locale, "buttonQuickContinue"),
            `final_action:continue:${requestId}`
          ),
          Markup.button.callback(
            t(locale, "buttonQuickMeeting"),
            `final_action:meeting:${requestId}`
          )
        ]
      ]) as unknown as Record<string, unknown>
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
}
