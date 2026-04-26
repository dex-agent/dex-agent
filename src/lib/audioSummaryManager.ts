import { randomUUID } from "node:crypto";
import { Markup } from "telegraf";
import type { Locale } from "../bot/i18n.js";
import { t } from "../bot/i18n.js";
import { AudioTts, type AudioSummaryMode } from "./audioTts.js";
import {
  extractFinalResponseNextSpecialist,
  extractFinalResponseRecommendedStep,
  extractFinalResponseNextStep
} from "./finalActionContext.js";

interface SummaryRecord {
  chatId: string;
  text: string;
  workdir?: string;
  createdAt: number;
}

type FinalActionKindV2 =
  | "plan"
  | "handoff"
  | "continue_short"
  | "continue_medium"
  | "continue_full"
  | "autopilot"
  | "autopilot_arm"
  | "meeting"
  | "review"
  | "organize";

const FINAL_ACTION_CODES: Record<FinalActionKindV2, string> = {
  plan: "pl",
  handoff: "sp",
  continue_short: "c1",
  continue_medium: "c2",
  continue_full: "c3",
  autopilot: "ap",
  autopilot_arm: "ax",
  meeting: "mt",
  review: "rv",
  organize: "ib"
};

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

  getLatestFinalActionText(
    chatId: string | number,
    workdir?: string
  ): string | null {
    return this.findRecentRecord(chatId, workdir)?.text || null;
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

    const recentRecord = this.findRecentRecord(chatId, workdir);
    const requestId = this.storeRequest(chatId, normalized, workdir);
    if (!requestId) {
      return null;
    }

    const rows: ReturnType<typeof Markup.button.callback>[][] = [];
    const recommended = this.inferRecommendedFinalAction(normalized);
    const nextStep = this.extractActionStep(normalized);
    const finalActionRows = this.buildFinalActionRows(normalized);
    const suggestedPrompt = this.buildSuggestedReplyPrompt(
      normalized,
      recentRecord?.text
    );

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
      ...finalActionRows.map((row) =>
        row.map((kind) =>
          Markup.button.callback(
            this.buildFinalActionButtonLabel(
              locale,
              kind,
              recommended,
              nextStep
            ),
            `final_action:${FINAL_ACTION_CODES[kind]}:${requestId}`
          )
        )
      )
    );

    return {
      text: t(locale, "finalActionsOffer", {
        suggestedPrompt,
        recommendedAction: this.buildFinalActionButtonLabel(
          locale,
          recommended,
          recommended,
          nextStep
        )
      }),
      options: Markup.inlineKeyboard(rows) as unknown as Record<string, unknown>
    };
  }

  private findRecentRecord(
    chatId: string | number,
    workdir?: string
  ): SummaryRecord | null {
    this.pruneExpired();
    const records = Array.from(this.records.values())
      .filter(
        (record) =>
          record.chatId === String(chatId) &&
          (!workdir || !record.workdir || record.workdir === workdir)
      )
      .sort((left, right) => right.createdAt - left.createdAt);

    return records[0] || null;
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

  private buildFinalActionRows(text: string): FinalActionKindV2[][] {
    const contextualAction = this.resolveContextualFinalAction(text);
    const supportRow = this.buildDynamicSupportRow(text);

    return [
      ["continue_short", contextualAction],
      ...(supportRow.length ? [supportRow] : []),
      ["continue_full", "autopilot"],
      ["autopilot_arm"]
    ];
  }

  private buildDynamicSupportRow(text: string): FinalActionKindV2[] {
    const normalized = this.normalizeForActionHeuristics(text);
    const row: FinalActionKindV2[] = [];

    if (
      /\b(revisao|review|risco|risk|teste|test|validar|validacao|regressao|diff|bug)\b/i.test(
        normalized
      )
    ) {
      row.push("review");
    }

    if (
      /\b(travado|stuck|divergencia|tensao|reuniao|ideias|brainstorm|quebra gelo|bloqueio)\b/i.test(
        normalized
      )
    ) {
      row.push("meeting");
    }

    if (
      row.length < 2 &&
      /\b(inbox|memoria|memory|residuo|residuos|estacionamento|candidate|proposal)\b/i.test(
        normalized
      )
    ) {
      row.push("organize");
    }

    return row.slice(0, 2);
  }

  private buildSuggestedReplyPrompt(text: string, recentText?: string): string {
    const recommended = this.inferRecommendedFinalAction(text);
    const nextStep = this.extractActionStep(text);
    const nextSpecialist = extractFinalResponseNextSpecialist(text);
    const recentNextStep =
      recentText && recentText !== text
        ? this.extractActionStep(recentText)
        : null;
    const baseAction = nextStep || "seguir o menor proximo passo seguro";
    const historyHint =
      recentNextStep && recentNextStep !== nextStep
        ? ` Contexto recente: vinha de "${this.compactButtonText(recentNextStep, 90)}".`
        : "";

    switch (recommended) {
      case "plan":
        return this.compactSuggestedPrompt(
          `/plan usando $sprinter ${baseAction}.${historyHint}`
        );
      case "handoff":
        return this.compactSuggestedPrompt(
          `Encaminhar para ${nextSpecialist || "o especialista indicado"}: ${baseAction}.${historyHint}`
        );
      case "autopilot":
      case "autopilot_arm":
        return this.compactSuggestedPrompt(
          `Ativar piloto automatico: ${baseAction}.${historyHint}`
        );
      case "continue_full":
        return this.compactSuggestedPrompt(
          `Concluir bloco todo: ${baseAction}.${historyHint}`
        );
      default:
        return this.compactSuggestedPrompt(`${baseAction}.${historyHint}`);
    }
  }

  private buildFinalActionButtonLabel(
    locale: Locale,
    kind: FinalActionKindV2,
    recommended: FinalActionKindV2,
    nextStep: string | null
  ): string {
    if (kind === "continue_short" && nextStep) {
      return kind === recommended ? `-> ${nextStep}` : nextStep;
    }

    return kind === recommended
      ? t(locale, this.recommendedLabelKey(kind))
      : t(locale, this.defaultLabelKey(kind));
  }

  private inferRecommendedFinalAction(text: string): FinalActionKindV2 {
    const normalized = String(text || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
    const recommendedStep = extractFinalResponseRecommendedStep(text);
    const nextStep = this.extractActionStep(text);
    const normalizedNextStep = String(nextStep || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();

    if (
      /\b(nao e execucao|nao eh execucao|use \/plan|usar \/plan|planejamento|transformar em planejamento|abrir explicitamente outro bloco|abrir outro bloco)\b/i.test(
        normalized
      ) ||
      /\b(planejamento|plan|abrir outro bloco)\b/i.test(normalizedNextStep)
    ) {
      return "plan";
    }

    if (recommendedStep && normalizedNextStep) {
      return "continue_short";
    }

    if (this.resolveContextualFinalAction(text) === "handoff") {
      return "handoff";
    }

    if (/\b(autopilot|piloto automatico)\b/i.test(normalized)) {
      return "autopilot";
    }

    if (
      /\b(concluir bloco todo|fechar bloco inteiro|bloco inteiro|fechar este bloco|close the whole block)\b/i.test(
        normalized
      )
    ) {
      return "continue_full";
    }

    return "continue_short";
  }

  private resolveContextualFinalAction(text: string): "plan" | "handoff" {
    const nextSpecialist = this.extractSingleHandoffSpecialist(text);
    const nextStep = this.extractActionStep(text);
    const normalizedNextStep = this.normalizeForActionHeuristics(nextStep);

    if (!nextSpecialist) {
      return "plan";
    }

    if (
      /\b(sprinter|paula planeja|planejamento|planner)\b/i.test(
        this.normalizeForActionHeuristics(nextSpecialist)
      )
    ) {
      return "plan";
    }

    if (
      /\b(\/plan|planejamento|plan|abrir outro bloco|abrir explicitamente outro bloco)\b/i.test(
        normalizedNextStep
      )
    ) {
      return "plan";
    }

    return "handoff";
  }

  private extractSingleHandoffSpecialist(text: string): string | null {
    const specialist = extractFinalResponseNextSpecialist(text);
    if (!specialist) {
      return null;
    }

    const normalized = specialist.trim();
    if (/\s*(?:,|;|\+|\/|\be\b|\band\b)\s*/i.test(normalized)) {
      return null;
    }

    return normalized;
  }

  private normalizeForActionHeuristics(value: string | null): string {
    return String(value || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  }

  private extractActionStep(text: string): string | null {
    return (
      extractFinalResponseRecommendedStep(text) ||
      extractFinalResponseNextStep(text)
    );
  }

  private compactSuggestedPrompt(value: string, maxLength = 180): string {
    const normalized = String(value || "")
      .replace(/\s+/g, " ")
      .trim();

    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  private compactButtonText(value: string, maxLength: number): string {
    const normalized = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  private defaultLabelKey(kind: FinalActionKindV2): string {
    switch (kind) {
      case "plan":
        return "buttonQuickPlan";
      case "handoff":
        return "buttonQuickHandoff";
      case "continue_medium":
        return "buttonQuickContinueMedium";
      case "continue_full":
        return "buttonQuickContinueFull";
      case "autopilot":
        return "buttonQuickAutopilot";
      case "autopilot_arm":
        return "buttonQuickAutopilotArm";
      case "meeting":
        return "buttonQuickMeeting";
      case "review":
        return "buttonQuickReview";
      case "organize":
        return "buttonQuickOrganize";
      default:
        return "buttonQuickContinueShort";
    }
  }

  private recommendedLabelKey(kind: FinalActionKindV2): string {
    switch (kind) {
      case "plan":
        return "buttonQuickPlanRecommended";
      case "handoff":
        return "buttonQuickHandoffRecommended";
      case "continue_medium":
        return "buttonQuickContinueMediumRecommended";
      case "continue_full":
        return "buttonQuickContinueFullRecommended";
      case "autopilot":
        return "buttonQuickAutopilotRecommended";
      case "autopilot_arm":
        return "buttonQuickAutopilotArmRecommended";
      case "meeting":
        return "buttonQuickMeetingRecommended";
      case "review":
        return "buttonQuickReviewRecommended";
      case "organize":
        return "buttonQuickOrganizeRecommended";
      default:
        return "buttonQuickContinueShortRecommended";
    }
  }
}
