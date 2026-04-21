import fs from "node:fs/promises";
import path from "node:path";
import { Markup } from "telegraf";
import {
  buildPlanPrompt,
  extractCommandPayload,
  suggestClosestWord
} from "./commandUtils.js";
import {
  buildHelpText,
  buildMenuButtons,
  buildMenuText
} from "./commandCatalog.js";
import {
  normalizeLanguage,
  SUPPORTED_LANGUAGES,
  t,
  type Locale
} from "./i18n.js";
import { escapeMarkdownV2, splitTelegramMessage } from "./formatter.js";
import type { Scheduler } from "../cron/scheduler.js";
import { toErrorMessage } from "../lib/errors.js";
import type { AudioTranscriber } from "../lib/audioTranscription.js";
import type { AudioSummaryManager } from "../lib/audioSummaryManager.js";
import {
  downloadTelegramMediaToTemp,
  type TelegramMediaSource
} from "../lib/telegramMedia.js";
import type {
  OperationalContinuationState,
  PtyManager
} from "../runner/ptyManager.js";
import type {
  ShellExecutionResult,
  ShellManager
} from "../runner/shellManager.js";
import type { DevServerManager } from "../runner/devServerManager.js";
import type { SkillRegistry } from "../orchestrator/skillRegistry.js";
import type { ProjectUnderstandingContract } from "../orchestrator/projectIntelligence.js";
import {
  ProjectMemoryService,
  type MemoryCandidate,
  type MemoryPacket,
  type MemoryIntent,
  type MemoryWriteProposal
} from "../orchestrator/memoryService.js";
import { ProjectReuseEngine } from "../orchestrator/reuseEngine.js";
import {
  PromptLibraryService
} from "../orchestrator/promptLibraryService.js";
import { buildProjectPromptPresets } from "../orchestrator/skills/projectStatusSkill.js";

interface SkillResultPayload {
  text?: string;
  testJobId?: string;
  switchToRepo?: string;
  parseMode?: "plain" | "markdown";
  buttons?: Array<Array<{ text: string; callbackData: string }>>;
}

interface RegisterHandlersOptions {
  bot: any;
  ptyManager: PtyManager;
  shellManager: ShellManager;
  devServerManager: DevServerManager;
  skills: Record<string, any>;
  skillRegistry: SkillRegistry;
  scheduler: Scheduler;
  memoryService: ProjectMemoryService;
  reuseEngine?: ProjectReuseEngine;
  promptLibraryService: PromptLibraryService;
  audioTranscriber?: AudioTranscriber | null;
  audioSummaryManager?: AudioSummaryManager | null;
  telegramMediaDownloader?: (source: TelegramMediaSource) => Promise<{
    filePath: string;
    fileName: string;
    mimeType?: string;
  }>;
  telegramConfig: {
    apiBase: string;
    botToken: string;
    proxyUrl?: string;
  };
  adminActions?: {
    restart?: () => Promise<void>;
  };
}

interface MemoryReplyPayload {
  text: string;
  buttons?: Array<Array<{ text: string; callbackData: string }>>;
}

type LocalizedButtonSpec = {
  labelKey: string;
  callbackData: string;
};

type IndexedLocalizedButtonSpec = {
  labelKey: string;
  callbackPrefix: string;
};

const INBOX_CANDIDATE_BUTTON_VARIANTS: IndexedLocalizedButtonSpec[] = [
  { labelKey: "buttonMemoryPromote", callbackPrefix: "inbox:promote:" },
  { labelKey: "buttonMemoryWhy", callbackPrefix: "inbox:why:" },
  { labelKey: "buttonMemoryDismiss", callbackPrefix: "inbox:discard:" }
];

const INBOX_PROPOSAL_BUTTON_VARIANTS: LocalizedButtonSpec[] = [
  { labelKey: "buttonMemoryConfirmWrite", callbackData: "" },
  { labelKey: "buttonMemoryCancel", callbackData: "" }
];

const INBOX_OVERVIEW_BUTTON_ROWS: LocalizedButtonSpec[][] = [
  [
    { labelKey: "buttonMemoryCandidates", callbackData: "inbox:candidates" },
    { labelKey: "buttonMemoryProposals", callbackData: "inbox:proposals" }
  ],
  [
    { labelKey: "buttonMemoryActive", callbackData: "memory:view:active" },
    { labelKey: "buttonMemoryHandoff", callbackData: "memory:view:handoff" }
  ]
];

const PROJECT_MEMORY_BUTTON_ROW: LocalizedButtonSpec[] = [
  { labelKey: "buttonMemoryInbox", callbackData: "inbox:show" },
  { labelKey: "buttonMemoryActive", callbackData: "memory:view:active" },
  { labelKey: "buttonMemoryHandoff", callbackData: "memory:view:handoff" }
];

function buildLocalizedButtonRow(
  locale: Locale,
  specs: LocalizedButtonSpec[]
): Array<{ text: string; callbackData: string }> {
  return specs.map((spec) => ({
    text: t(locale, spec.labelKey),
    callbackData: spec.callbackData
  }));
}

function buildIndexedLocalizedButtons(
  locale: Locale,
  count: number,
  specs: IndexedLocalizedButtonSpec[]
): Array<Array<{ text: string; callbackData: string }>> {
  const rows: Array<Array<{ text: string; callbackData: string }>> = [];

  for (let index = 0; index < Math.min(count, 3); index += 1) {
    rows.push(
      specs.map((spec) => ({
        text: t(locale, spec.labelKey, { index: index + 1 }),
        callbackData: `${spec.callbackPrefix}${index}`
      }))
    );
  }

  return rows;
}

function isTelegramMarkdownParseError(error: unknown): boolean {
  const message = toErrorMessage(error);
  return /can't parse entities/i.test(message);
}

function normalizeAscii(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function toPlainTelegramFallback(text: string): string {
  return String(text || "")
    .replace(/\\([\\_*[\]()~`>#+\-=|{}.!])/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~([^~]+)~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+\n/g, "\n")
    .trim();
}

async function sendChunkedMarkdown(
  ctx: any,
  text: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const sourceText = String(text || "");
  const markdown = escapeMarkdownV2(sourceText);
  const markdownChunks = splitTelegramMessage(markdown, 3900);
  const plainChunks = splitTelegramMessage(sourceText, 3900);

  for (let i = 0; i < markdownChunks.length; i += 1) {
    try {
      await ctx.reply(markdownChunks[i], {
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
        ...extra
      });
    } catch (error) {
      if (!isTelegramMarkdownParseError(error)) {
        throw error;
      }

      const fallbackOptions = {
        ...extra
      } as Record<string, unknown>;
      delete fallbackOptions.parse_mode;
      await ctx.reply(plainChunks[i] || sourceText, {
        disable_web_page_preview: true,
        ...fallbackOptions
      });
    }
  }
}

async function sendSkillResult(
  ctx: any,
  result: string | SkillResultPayload,
  locale: Locale = "en",
  audioSummaryManager?: AudioSummaryManager | null
): Promise<void> {
  const payload = typeof result === "string" ? { text: result } : result;
  const text = payload?.text || t(locale, "emptyResponse");
  const sourceText = String(text || "");
  const markdown =
    payload.parseMode === "markdown" ? sourceText : escapeMarkdownV2(sourceText);
  const markdownChunks = splitTelegramMessage(markdown, 3900);
  const plainFallbackText =
    payload.parseMode === "markdown"
      ? toPlainTelegramFallback(sourceText)
      : sourceText;
  const plainChunks = splitTelegramMessage(plainFallbackText, 3900);
  const directAudioRequestId = audioSummaryManager?.createSummaryRequest(
    ctx.chat.id,
    sourceText
  );

  for (let i = 0; i < markdownChunks.length; i += 1) {
    const keyboardRows =
      i === markdownChunks.length - 1
        ? [
            ...(payload.buttons || []).map((row) =>
              row.map((button) =>
                Markup.button.callback(
                  button.text,
                  directAudioRequestId &&
                    button.callbackData.startsWith("project_status:audio:")
                    ? `audio:summary:${directAudioRequestId}`
                    : button.callbackData
                )
              )
            ),
            ...(payload.testJobId
              ? [
                  [
                    Markup.button.callback(
                      t(locale, "buttonRefreshTestStatus"),
                      `gh:test_status:${payload.testJobId}`
                    )
                  ]
                ]
              : [])
          ]
        : [];
    const maybeMarkup = keyboardRows.length
      ? Markup.inlineKeyboard(keyboardRows)
      : undefined;

    try {
      await ctx.reply(markdownChunks[i], {
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
        ...(maybeMarkup ? maybeMarkup : {})
      });
    } catch (error) {
      if (!isTelegramMarkdownParseError(error)) {
        throw error;
      }

      await ctx.reply(plainChunks[i] || plainFallbackText, {
        disable_web_page_preview: true,
        ...(maybeMarkup ? maybeMarkup : {})
      });
    }
  }

  if (audioSummaryManager) {
    await audioSummaryManager.offerForContext(ctx, sourceText, locale);
  }
}

async function applySkillResult(
  ctx: any,
  result: string | SkillResultPayload,
  locale: Locale,
  ptyManager: PtyManager,
  audioSummaryManager?: AudioSummaryManager | null
): Promise<void> {
  const payload = typeof result === "string" ? { text: result } : { ...result };

  if (payload.switchToRepo) {
    try {
      ptyManager.switchWorkdir(ctx.chat.id, payload.switchToRepo);
    } catch (error) {
      const suffix = t(locale, "repoSwitchFailed", {
        error: toErrorMessage(error)
      });
      payload.text = payload.text ? `${payload.text}\n\n${suffix}` : suffix;
    }
  }

  await sendSkillResult(ctx, payload, locale, audioSummaryManager);
}

function formatProjectLines(
  projects: Array<{ path: string; relativePath: string; name?: string }>,
  currentWorkdir: string
): string[] {
  return projects.map((project) => {
    const marker = project.path === currentWorkdir ? " <current>" : "";
    return `- ${project.relativePath}${marker}`;
  });
}

function formatSkillLines(
  skillStates: Array<{ name: string; enabled: boolean }>
): string[] {
  return skillStates.map(
    (skill) => `- ${skill.name}: ${skill.enabled ? "on" : "off"}`
  );
}

function suggestProjectName(
  input: string,
  projects: Array<{ relativePath: string; name?: string }>
): string | null {
  const candidates = [
    ...new Set(
      projects
        .flatMap((project) => [project.relativePath, project.name])
        .filter(Boolean) as string[]
    )
  ];

  const threshold = Math.min(
    6,
    Math.max(2, Math.ceil(String(input || "").trim().length * 0.35))
  );

  return suggestClosestWord(input, candidates, threshold);
}

function isInsideWorkspaceRoot(root: string, candidate: string): boolean {
  const target = path.resolve(candidate);
  const relative = path.relative(root, target);

  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function extractCloneTarget(
  result: Pick<
    ShellExecutionResult,
    "status" | "command" | "output" | "workdir"
  >
): string | null {
  if (
    result.status !== "passed" ||
    !result.command ||
    !result.output ||
    !result.workdir ||
    !/^git\s+clone(?:\s|$)/i.test(result.command)
  ) {
    return null;
  }

  const match = result.output.match(/Cloning into '([^']+)'\.\.\./i);
  if (!match?.[1]) {
    return null;
  }

  return path.resolve(result.workdir, match[1]);
}

function buildShellSuccessFollowUp(
  locale: Locale,
  result: Pick<
    ShellExecutionResult,
    "status" | "command" | "output" | "workdir"
  >,
  workspaceRoot: string
): string | null {
  const cloneTarget = extractCloneTarget(result);
  if (!cloneTarget) {
    return null;
  }

  const relativePath = path.relative(workspaceRoot, cloneTarget) || ".";
  const repoCommand = isInsideWorkspaceRoot(workspaceRoot, cloneTarget)
    ? `/repo ${relativePath}`
    : "";

  return t(locale, "shellCloneSucceeded", {
    relativePath,
    workdir: cloneTarget,
    repoCommand
  });
}

function shortenButtonLabel(value: string, limit = 24): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function buildRepoButtons(
  projects: Array<{ path: string; relativePath: string; name?: string }>,
  currentWorkdir: string,
  {
    includePrevious = false
  }: {
    includePrevious?: boolean;
  } = {}
): Array<Array<{ text: string; callbackData: string }>> {
  const rows: Array<Array<{ text: string; callbackData: string }>> = [];
  const buttons = projects.map((project) => ({
    text:
      project.path === currentWorkdir
        ? `✅ ${shortenButtonLabel(project.relativePath)}`
        : shortenButtonLabel(project.relativePath),
    callbackData: `repo:switch:${encodeURIComponent(project.relativePath)}`
  }));

  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2));
  }

  if (includePrevious) {
    rows.push([
      {
        text: "↩️ Projeto anterior",
        callbackData: "repo:switch:-"
      }
    ]);
  }

  return rows;
}

function formatQueueLines(
  items: Array<{
    id: string;
    index: number;
    text: string;
    relativeWorkdir: string;
    createdAt: string;
  }>
): string[] {
  return items.map(
    (item) =>
      `${item.index}. ${item.text}\n   id: ${item.id}\n   projeto: ${item.relativeWorkdir}`
  );
}

function buildQueueButtons(
  items: Array<{
    id: string;
    index: number;
  }>
): Array<Array<{ text: string; callbackData: string }>> {
  const rows: Array<Array<{ text: string; callbackData: string }>> = [
    [
      {
        text: "▶️ Rodar proximo",
        callbackData: "queue:run"
      },
      {
        text: "🔄 Atualizar",
        callbackData: "queue:list"
      }
    ]
  ];

  if (items.length) {
    rows.push([
      {
        text: "🗑️ Limpar fila",
        callbackData: "queue:clear"
      }
    ]);
  }

  const removeButtons = items.slice(0, 6).map((item) => ({
    text: `🗑️ Remover ${item.index}`,
    callbackData: `queue:remove:${item.id}`
  }));

  for (let index = 0; index < removeButtons.length; index += 2) {
    rows.push(removeButtons.slice(index, index + 2));
  }

  return rows;
}

function isOperationalStatusQuestion(text: string): boolean {
  const normalized = normalizeAscii(text)
    .replace(/[?!.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [
    "o que esta fazendo",
    "oq esta fazendo",
    "o que ta fazendo",
    "oque esta fazendo",
    "what are you doing",
    "what are you doing now",
    "status operacional",
    "status da execucao"
  ].includes(normalized);
}

function stripProjectStatusFormatting(input: string): string {
  return String(input || "")
    .replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function buildProjectStatusMeetingPrompt(
  variant: string,
  currentText: string
): string {
  const labelMap: Record<string, string> = {
    default: "status atual do projeto",
    executive: "panorama executivo",
    next: "proximo bloco",
    sources: "fontes canonicas",
    steps: "primeiros passos",
    commands: "comandos sugeridos",
    queue: "fila de proximos blocos"
  };
  const label = labelMap[variant] || "status atual do projeto";
  const cleanedText = stripProjectStatusFormatting(currentText);

  return [
    `Faca uma reuniao com especialistas sobre este recorte do projeto: ${label}.`,
    "Baseie-se no contexto abaixo, vindo da memoria viva do projeto.",
    "",
    cleanedText,
    "",
    "Entregue:",
    "- Objetivo",
    "- Mesa convocada",
    "- Sugestoes",
    "- Divergencias e tensoes",
    "- Decisoes tomadas",
    "- Encaminhamento"
  ].join("\n");
}

function buildFinalResponsePlanPrompt(currentText: string): string {
  return buildPlanPrompt([
    "Use a conclusao abaixo como base canonica para planejar o proximo sprint.",
    "Entregue um plano curto, operacional e verificavel.",
    "Se nao houver base suficiente para planejar com seguranca, diga isso claramente.",
    "",
    "Conclusao atual:",
    stripProjectStatusFormatting(currentText)
  ].join("\n"));
}

function applyLocalExecutionPreference(prompt: string): string {
  return [
    "Preferencia operacional deste bot/projeto:",
    "- nao use context-mode por padrao neste repo",
    "- para leitura, extracao local, cortes de arquivo e verificacoes compactas, prefira $motor-local",
    "- so use context-mode se eu pedir explicitamente ou se ficar realmente bloqueado sem ele",
    "",
    prompt.trim()
  ].join("\n");
}

function buildFinalResponseContinuePrompt(currentText: string): string {
  return applyLocalExecutionPreference([
    "Considere a conclusao abaixo como aprovada.",
    "Continue imediatamente o proximo passo natural da implementacao ou do sprint atual no projeto aberto.",
    "Se nao houver proximo passo claro e seguro, pare e diga objetivamente que o correto agora e usar /plan.",
    "",
    "Conclusao aprovada:",
    stripProjectStatusFormatting(currentText)
  ].join("\n"));
}

function buildFinalResponseMeetingPrompt(currentText: string): string {
  return applyLocalExecutionPreference([
    "Faca uma reuniao com especialistas sobre a conclusao abaixo.",
    "Trate isso como fechamento de bloco ou de uma implementacao.",
    "",
    stripProjectStatusFormatting(currentText),
    "",
    "Entregue:",
    "- Objetivo",
    "- Mesa convocada",
    "- Sugestoes",
    "- Divergencias e tensoes",
    "- Decisoes tomadas",
    "- Encaminhamento"
  ].join("\n"));
}

function hasPlannedSprint(contract: ProjectUnderstandingContract): boolean {
  return Boolean(
    contract.currentStatus.nextEligibleBlock ||
      contract.nextStepSummary.length ||
      contract.nextQueue.length ||
      contract.suggestedCommands.length
  );
}

function buildProjectContinuePrompt(
  contract: ProjectUnderstandingContract
): string {
  const lines = [
    "Continue o proximo sprint ja programado deste projeto usando apenas o contrato canonico atual.",
    `Projeto: ${contract.currentStatus.projectName}.`
  ];

  if (contract.currentStatus.nextEligibleBlock) {
    lines.push(`Proximo bloco elegivel: ${contract.currentStatus.nextEligibleBlock}.`);
  }

  if (contract.currentStatus.executionFormal) {
    lines.push(`Estado formal atual: ${contract.currentStatus.executionFormal}.`);
  }

  if (contract.nextQueue.length) {
    lines.push("", "Fila canonica:");
    lines.push(...contract.nextQueue.map((line) => `- ${line.replace(/^- /, "").trim()}`));
  }

  if (contract.nextStepSummary.length) {
    lines.push("", "Passos imediatos registrados:");
    lines.push(
      ...contract.nextStepSummary.map((line) => `- ${line.replace(/^- /, "").trim()}`)
    );
  }

  if (contract.suggestedCommands.length) {
    lines.push("", "Comandos sugeridos do contrato:");
    lines.push(
      ...contract.suggestedCommands.map((line) => `- ${line.replace(/^- /, "").trim()}`)
    );
  }

  lines.push(
    "",
    "Se houver material suficiente, continue o que ja foi programado sem replanejar do zero.",
    "Se nao houver base suficiente para executar com seguranca, pare e diga claramente que o correto agora e usar /plan para estruturar o proximo sprint."
  );

  return applyLocalExecutionPreference(lines.join("\n"));
}

function buildProjectCommandPrompt(command: string): string {
  const cleanedCommand = command.replace(/^- /, "").trim();
  return applyLocalExecutionPreference([
    "Use o comando sugerido abaixo como atalho operacional do projeto atual.",
    `Comando/protocolo selecionado: ${cleanedCommand}`,
    "",
    "Se isso for um comando de leitura, execute a leitura e resuma o resultado.",
    "Se isso for um comando operacional, use-o como guia para continuar o trabalho agora.",
    "Se ele nao estiver disponivel ou nao fizer sentido neste contexto, explique objetivamente sem inventar."
  ].join("\n"));
}

function inferMemoryIntent(prompt: string, fallback: MemoryIntent = "auto"): MemoryIntent {
  if (fallback !== "auto") {
    return fallback;
  }

  const normalized = normalizeAscii(prompt);
  if (
    /^(ls|dir|pwd|whoami|which|list files|show files|help|menu|status)$/i.test(
      normalized
    )
  ) {
    return "trivial";
  }

  if (/\b(plan|sprint|next step|roadmap|refactor|implement|debug|fix|review)\b/i.test(normalized)) {
    if (/\b(plan|roadmap|sprint)\b/i.test(normalized)) return "planning";
    if (/\b(debug|fix)\b/i.test(normalized)) return "debug";
    return "implementation";
  }

  if (/\b(continue|resume|next block|handoff)\b/i.test(normalized)) {
    return "continue";
  }

  if (/\b(status|current state|what changed|progress)\b/i.test(normalized)) {
    return "status";
  }

  return "auto";
}

function compactContinuationText(
  value: string | null | undefined,
  limit = 420
): string | null {
  const compact = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!compact) {
    return null;
  }

  return compact.length <= limit
    ? compact
    : `${compact.slice(0, limit - 3).trimEnd()}...`;
}

function hasOperationalContinuationSignal(
  state: OperationalContinuationState
): boolean {
  return Boolean(
    state.active ||
      state.pendingPromptText ||
      state.queuedItems.length ||
      state.lastPromptText ||
      state.lastFinalResponseText
  );
}

function buildContinuePromptFromState(
  originalPrompt: string,
  state: OperationalContinuationState,
  packet: MemoryPacket | null
): string {
  const lines = [
    "Operational continuation state for this chat:",
    `- project: ${state.relativeWorkdir}`,
    `- active session: ${state.active ? "yes" : "no"}`,
    `- active mode: ${state.activeMode || "idle"}`,
    `- workflow phase: ${state.workflowPhase}`
  ];

  const lastPrompt = compactContinuationText(state.lastPromptText);
  const lastFinal = compactContinuationText(state.lastFinalResponseText, 720);
  const pending = compactContinuationText(state.pendingPromptText);

  if (lastPrompt) {
    lines.push(`- last live request: ${lastPrompt}`);
  }
  if (lastFinal) {
    lines.push(`- last live result: ${lastFinal}`);
  }
  if (pending) {
    lines.push(`- pending prompt: ${pending}`);
  }
  if (state.queuedItems.length) {
    lines.push(
      `- next queued item: ${compactContinuationText(state.queuedItems[0]?.text, 220)}`
    );
  }

  lines.push(
    "",
    "Use this operational state as the primary source of truth for requests to continue or resume work in this chat.",
    "If it conflicts with durable project memory, prefer the operational continuation state and treat durable memory as fallback that may be stale."
  );

  if (packet) {
    lines.push("", "Canonical memoria-viva fallback:");
    if (packet.currentObjective) {
      lines.push(`- current objective: ${packet.currentObjective}`);
    }
    if (packet.latestClosedBlock) {
      lines.push(`- latest closed block: ${packet.latestClosedBlock}`);
    }
    if (packet.nextEligibleBlock) {
      lines.push(`- next eligible block: ${packet.nextEligibleBlock}`);
    }
    for (const note of packet.tacticalNotes.slice(0, 3)) {
      lines.push(`- tactical note: ${note.replace(/^- /, "").trim()}`);
    }
  }

  lines.push("", "User request:", originalPrompt.trim());
  return lines.join("\n");
}

function formatMemorySourcesForReply(workdir: string, sources: string[]): string {
  return sources
    .slice(0, 3)
    .map((source) => path.relative(workdir, source).replace(/\\/g, "/") || path.basename(source))
    .join(", ");
}

function buildInboxCandidateButtons(
  locale: Locale,
  count: number
): Array<Array<{ text: string; callbackData: string }>> {
  return buildIndexedLocalizedButtons(
    locale,
    count,
    INBOX_CANDIDATE_BUTTON_VARIANTS
  );
}

function buildInboxProposalButtons(
  locale: Locale,
  selector: string
): Array<Array<{ text: string; callbackData: string }>> {
  return [
    buildLocalizedButtonRow(locale, [
      {
        ...INBOX_PROPOSAL_BUTTON_VARIANTS[0],
        callbackData: `inbox:confirm:${selector}`
      },
      {
        ...INBOX_PROPOSAL_BUTTON_VARIANTS[1],
        callbackData: `inbox:cancel:${selector}`
      }
    ])
  ];
}

function buildInboxOverviewButtons(
  locale: Locale,
  hasCandidates: boolean,
  hasProposals: boolean
): MemoryReplyPayload {
  return {
    text: "",
    buttons: [
      ...INBOX_OVERVIEW_BUTTON_ROWS.map((row) =>
        buildLocalizedButtonRow(locale, row)
      ),
      ...(hasCandidates || hasProposals
        ? [
            buildLocalizedButtonRow(locale, [
              {
                labelKey: "buttonMemoryRefresh",
                callbackData: "inbox:show"
              }
            ])
          ]
        : [])
    ]
  };
}

function renderInboxOverview(
  locale: Locale,
  candidates: MemoryCandidate[],
  proposals: MemoryWriteProposal[]
): MemoryReplyPayload {
  const text = [
    `*${t(locale, "memoryInboxTitle")}*`,
    "",
    `${t(locale, "memoryCandidatesCountLabel")}: ${candidates.length}`,
    `${t(locale, "memoryProposalsCountLabel")}: ${proposals.length}`,
    "",
    ...(candidates.length
      ? [
          `*${t(locale, "memoryRecentCandidatesTitle")}*`,
          ...candidates.slice(0, 5).map(
            (candidate, index) =>
              `${index + 1}. *[${candidate.kind}]* ${escapeMarkdownV2(candidate.title)}${candidate.kind === "skill_candidate" ? ` \\(${escapeMarkdownV2(candidate.destination || "review")}\\)` : ""}`
          ),
          ""
        ]
      : []),
    ...(proposals.length
      ? [
          `*${t(locale, "memoryRecentProposalsTitle")}*`,
          ...proposals.slice(0, 5).map(
            (proposal, index) =>
              `${index + 1}. *[${proposal.entry.kind}]* ${escapeMarkdownV2(proposal.entry.title)}${proposal.destination !== "memory" ? ` \\(${escapeMarkdownV2(proposal.destination)}\\)` : ""}`
          )
        ]
      : [t(locale, "memoryInboxEmpty")])
  ].join("\n");

  return {
    text,
    buttons: buildInboxOverviewButtons(
      locale,
      Boolean(candidates.length),
      Boolean(proposals.length)
    ).buttons
  };
}

function renderInboxCandidates(
  locale: Locale,
  candidates: MemoryCandidate[]
): MemoryReplyPayload {
  if (!candidates.length) {
    return {
      text: [
        `*${t(locale, "memoryInboxCandidatesTitle")}*`,
        "",
        t(locale, "memoryNoPendingCandidates")
      ].join("\n")
    };
  }

  return {
    text: [
      `*${t(locale, "memoryInboxCandidatesTitle")}*`,
      "",
      ...candidates.slice(0, 6).map((candidate, index) =>
        `${index + 1}. *[${candidate.kind}]* ${escapeMarkdownV2(candidate.title)}${candidate.kind === "skill_candidate" ? ` \\(${escapeMarkdownV2(candidate.destination || "review")}\\)` : ""}\n   ${t(locale, "memoryEvidenceLabel")}: ${escapeMarkdownV2(candidate.evidence.value)}`
      )
    ].join("\n"),
    buttons: buildInboxCandidateButtons(locale, candidates.length)
  };
}

function renderMemoryCandidates(
  locale: Locale,
  candidates: MemoryCandidate[]
): MemoryReplyPayload {
  if (!candidates.length) {
    return {
      text: [
        `*${t(locale, "memoryCandidatesTitle")}*`,
        "",
        t(locale, "memoryNoPendingCandidates")
      ].join("\n")
    };
  }

  return {
    text: [
      `*${t(locale, "memoryCandidatesTitle")}*`,
      "",
      ...candidates.slice(0, 6).map((candidate, index) =>
        `${index + 1}. *[${candidate.kind}]* ${escapeMarkdownV2(candidate.title)}${candidate.kind === "skill_candidate" ? ` \\(${escapeMarkdownV2(candidate.destination || "review")}\\)` : ""}\n   ${t(locale, "memoryEvidenceLabel")}: ${escapeMarkdownV2(candidate.evidence.value)}`
      )
    ].join("\n"),
    buttons: buildInboxCandidateButtons(locale, candidates.length)
  };
}

function renderInboxProposals(
  locale: Locale,
  proposals: MemoryWriteProposal[]
): MemoryReplyPayload {
  if (!proposals.length) {
    return {
      text: [
        `*${t(locale, "memoryInboxProposalsTitle")}*`,
        "",
        t(locale, "memoryNoPendingProposals")
      ].join("\n")
    };
  }

  return {
    text: [
      `*${t(locale, "memoryInboxProposalsTitle")}*`,
      "",
      ...proposals.slice(0, 6).map((proposal, index) =>
        `${index + 1}. *[${proposal.entry.kind}]* ${escapeMarkdownV2(proposal.entry.title)}${proposal.destination !== "memory" ? ` \\(${escapeMarkdownV2(proposal.destination)}\\)` : ""}\n   ${t(locale, "memorySummaryLabel")}: ${escapeMarkdownV2(proposal.entry.summary)}`
      )
    ].join("\n"),
    buttons: proposals.slice(0, 3).map((_, index) => [
      {
        text: t(locale, "buttonMemoryConfirm", { index: index + 1 }),
        callbackData: `inbox:confirm:${index}`
      },
      {
        text: t(locale, "buttonMemoryCancelIndexed", { index: index + 1 }),
        callbackData: `inbox:cancel:${index}`
      }
    ])
  };
}

function renderMemoryProposal(
  locale: Locale,
  proposal: MemoryWriteProposal
): MemoryReplyPayload {
  return {
    text: [
      `*${t(locale, "memoryPromotionProposalTitle")}*`,
      "",
      `${t(locale, "memoryKindLabel")}: \`${proposal.entry.kind}\``,
      `${t(locale, "memoryDestinationLabel")}: \`${proposal.destination}\``,
      `${t(locale, "memoryTitleLabel")}: ${escapeMarkdownV2(proposal.entry.title)}`,
      `${t(locale, "memorySummaryLabel")}: ${escapeMarkdownV2(proposal.entry.summary)}`,
      `${t(locale, "memoryEvidenceLabel")}: ${escapeMarkdownV2(proposal.entry.evidence.value)}`,
      `${t(locale, "memorySourceLabel")}: ${escapeMarkdownV2(proposal.entry.source.detail)}`,
      "",
      `${t(locale, "memoryWhyLabel")}: ${escapeMarkdownV2(proposal.reason || t(locale, "memoryReasonDefault"))}`
    ].join("\n"),
    buttons: buildInboxProposalButtons(locale, proposal.id)
  };
}

function renderInboxProposal(
  locale: Locale,
  proposal: MemoryWriteProposal
): MemoryReplyPayload {
  return {
    text: [
      `*${t(locale, "memoryInboxProposalTitle")}*`,
      "",
      `${t(locale, "memoryKindLabel")}: \`${proposal.entry.kind}\``,
      `${t(locale, "memoryDestinationLabel")}: \`${proposal.destination}\``,
      `${t(locale, "memoryTitleLabel")}: ${escapeMarkdownV2(proposal.entry.title)}`,
      `${t(locale, "memorySummaryLabel")}: ${escapeMarkdownV2(proposal.entry.summary)}`,
      `${t(locale, "memoryEvidenceLabel")}: ${escapeMarkdownV2(proposal.entry.evidence.value)}`,
      `${t(locale, "memorySourceLabel")}: ${escapeMarkdownV2(proposal.entry.source.detail)}`,
      "",
      `${t(locale, "memoryWhyLabel")}: ${escapeMarkdownV2(proposal.reason || t(locale, "memoryReasonDefault"))}`
    ].join("\n"),
    buttons: buildInboxProposalButtons(locale, proposal.id)
  };
}

function buildMemoryHelpText(memoryReadmePath: string): string {
  return [
    "Sistema de memoria do Dex Agent:",
    "- `/memory` ou `/memory show`: mostra o estado atual da memoria do projeto",
    "- `/memory candidates`: lista candidatos ainda nao promovidos, incluindo skill candidates",
    "- `/memory promote <id|index>`: cria uma proposta de promocao antes de gravar",
    "- `/memory discard <id|index>`: descarta um candidato pendente",
    "- `/memory why <id|index>`: explica por que aquele candidato apareceu",
    "- `/memory remember <texto>`: cria um candidato manual com base em contexto concreto",
    "",
    "Contrato atual:",
    "- memoria operacional vem de `.agents/ACTIVE.md`, `.agents/HANDOFF.md` e `.codex/napkin.md`",
    "- memoria duravel fica em `.agents/MEMORY.ndjson`",
    "- skill candidate e o estagio entre memoria reutilizavel e skill pronta",
    "- escrita duravel segue `proposal-first writes`",
    "- recall mistura estado operacional com ledger duravel quando houver evidencia",
    "",
    `README completo: ${memoryReadmePath}`
  ].join("\n");
}

function buildInboxHelpText(memoryReadmePath: string): string {
  return [
    "Inbox duravel da memoria do Dex Agent:",
    "- `/inbox` ou `/inbox show`: mostra a inbox do projeto atual",
    "- `/inbox candidates`: lista candidatos persistidos em `.agents/INBOX/candidates.ndjson`, incluindo skill candidates",
    "- `/inbox proposals`: lista propostas persistidas em `.agents/INBOX/proposals.ndjson`",
    "- `/inbox promote <id|index>`: cria proposta a partir de candidate",
    "- `/inbox discard <id|index>`: remove candidate da inbox",
    "- `/inbox why <id|index>`: explica por que o candidate foi capturado",
    "- `/inbox confirm <id|index>`: grava no ledger `.agents/MEMORY.ndjson`",
    "- `/inbox cancel <id|index>`: remove proposal sem gravar",
    "",
    "Contrato atual:",
    "- candidates e proposals sobrevivem a restart",
    "- `.agents/INBOX/` e revisavel, nao e memoria duravel final",
    "- quando o candidato for `skill_candidate`, o destino sugerido tambem aparece",
    "- `.agents/MEMORY.ndjson` continua append-only",
    "",
    `README completo: ${memoryReadmePath}`
  ].join("\n");
}

function buildPromptLibraryHelpText(): string {
  return [
    "Biblioteca de prompts do projeto:",
    "- `/prompts` ou `/prompts show`: lista prompts prontos do projeto atual",
    "- `/prompts add <label> :: <prompt>`: adiciona um prompt custom com intent `implementation`",
    "- `/prompts add <intent> :: <label> :: <prompt>`: adiciona um prompt custom com intent explicito",
    "- `/prompts run <selector>`: executa um prompt da biblioteca",
    "- `/prompts remove <selector>`: remove um prompt custom",
    "",
    "Intents aceitos:",
    "- `status`",
    "- `continue`",
    "- `planning`",
    "- `implementation`",
    "",
    "Exemplos:",
    "- `/prompts add Sprint implementacao :: /plan concordo com voce quero crie os sprint de planejamento de implementacao usando $sprinter`",
    "- `/prompts add planning :: Sprint implementacao :: /plan concordo com voce quero crie os sprint de planejamento de implementacao usando $sprinter`"
  ].join("\n");
}

function buildPromptLibraryButtons(
  presets: ReturnType<typeof buildProjectPromptPresets>
): Array<Array<{ text: string; callbackData: string }>> {
  const rows: Array<Array<{ text: string; callbackData: string }>> = [];
  for (const preset of presets.slice(0, 8)) {
    const row = [
      {
        text: `Usar ${preset.label}`,
        callbackData: `prompts:run:${preset.selector.replace(/:/g, "~")}`
      }
    ];

    if (preset.removable) {
      row.push({
        text: `Remover ${preset.label}`,
        callbackData: `prompts:remove:${preset.selector.replace(/:/g, "~")}`
      });
    }

    rows.push(row);
  }

  rows.push([{ text: "Atualizar", callbackData: "prompts:show" }]);
  return rows;
}

function renderPromptLibrary(
  presets: ReturnType<typeof buildProjectPromptPresets>
): MemoryReplyPayload {
  if (!presets.length) {
    return {
      text: ["*Biblioteca de Prompts*", "", "Nenhum prompt disponivel neste projeto."].join(
        "\n"
      )
    };
  }

  return {
    text: [
      "*Biblioteca de Prompts*",
      "",
      ...presets.map(
        (preset, index) =>
          `${index + 1}. *${escapeMarkdownV2(preset.label)}*` +
          `\nintent: \`${preset.intent}\`` +
          `\nsource: ${escapeMarkdownV2(preset.source)}` +
          `\nselector: \`${escapeMarkdownV2(preset.selector)}\``
      ),
      "",
      "Use os botoes para executar rapido ou `/prompts add ...` para adicionar novos prompts."
    ].join("\n"),
    buttons: buildPromptLibraryButtons(presets)
  };
}

function normalizePromptSelector(value: string): string {
  return String(value || "").replace(/~/g, ":").trim();
}

function resolveProjectPromptPreset(
  selector: string,
  presets: ReturnType<typeof buildProjectPromptPresets>
) {
  const normalized = normalizePromptSelector(selector);
  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);
  if (Number.isInteger(numeric) && numeric >= 0) {
    return presets[numeric] || null;
  }

  return presets.find((preset) => preset.selector === normalized) || null;
}

function renderRelevantMemory(
  locale: Locale,
  workdir: string,
  packet: Awaited<ReturnType<ProjectMemoryService["buildMemoryPacket"]>>
): MemoryReplyPayload {
  if (!packet) {
    return {
      text: [
        `*${t(locale, "memoryProjectTitle")}*`,
        "",
        t(locale, "memoryNoRelevantProjectMemory")
      ].join("\n"),
      buttons: [buildLocalizedButtonRow(locale, PROJECT_MEMORY_BUTTON_ROW)]
    };
  }

  return {
    text: [
      `*${t(locale, "memoryProjectTitle")}*`,
      "",
      `${t(locale, "memoryObjectiveLabel")}: ${escapeMarkdownV2(packet.currentObjective || t(locale, "memoryNotRecorded"))}`,
      `${t(locale, "memoryLatestClosedBlockLabel")}: ${escapeMarkdownV2(packet.latestClosedBlock || t(locale, "memoryNotRecorded"))}`,
      `${t(locale, "memoryNextEligibleBlockLabel")}: ${escapeMarkdownV2(packet.nextEligibleBlock || t(locale, "memoryNotRecorded"))}`,
      `${t(locale, "memoryConfidenceLabel")}: ${escapeMarkdownV2(packet.confidence)}`,
      "",
      ...(packet.tacticalNotes.length
        ? [
            `*${t(locale, "memoryTacticalNotesTitle")}*`,
            ...packet.tacticalNotes
              .slice(0, 3)
              .map((line) => `- ${escapeMarkdownV2(line.replace(/^- /, ""))}`),
            ""
          ]
        : []),
      ...(packet.relevantMemory.length
        ? [
            `*${t(locale, "memoryDurableMemoryTitle")}*`,
            ...packet.relevantMemory
              .slice(0, 5)
              .map(
                (entry) =>
                  `- [${escapeMarkdownV2(entry.kind)}] ${escapeMarkdownV2(entry.title)}`
              ),
            ""
          ]
        : []),
      `${t(locale, "memorySourcesLabel")}: ${escapeMarkdownV2(
        formatMemorySourcesForReply(workdir, packet.sources) || t(locale, "memoryNone")
      )}`
    ].join("\n"),
    buttons: [buildLocalizedButtonRow(locale, PROJECT_MEMORY_BUTTON_ROW)]
  };
}

export function registerHandlers({
  bot,
  ptyManager,
  shellManager,
  devServerManager,
  skills,
  skillRegistry,
  scheduler,
  memoryService,
  reuseEngine,
  promptLibraryService,
  audioTranscriber,
  audioSummaryManager,
  telegramMediaDownloader = (source) => downloadTelegramMediaToTemp({ source }),
  telegramConfig,
  adminActions
}: RegisterHandlersOptions): void {
  const effectiveReuseEngine = reuseEngine || new ProjectReuseEngine(memoryService);
  const localeOf = (chatId: string | number): Locale =>
    ptyManager.getLanguage(chatId);
  const buildPromptWithMemory = async (
    chatId: string | number,
    workdir: string,
    prompt: string,
    intent: MemoryIntent
  ): Promise<{
      prompt: string;
      disclosure: string | null;
  }> => {
    const prepared = await effectiveReuseEngine.preparePrompt({
      workdir,
      prompt,
      intent
    });

    if (intent === "continue") {
      const operationalState = ptyManager.getOperationalContinuationState(
        chatId,
        workdir
      );

      if (hasOperationalContinuationSignal(operationalState)) {
        return {
          prompt: buildContinuePromptFromState(
            prepared.promptWithSkills,
            operationalState,
            prepared.packet
          ),
          disclosure: prepared.disclosure
        };
      }
    }

    return {
      prompt: prepared.prompt,
      disclosure: prepared.disclosure
    };
  };
  const handlePromptResult = async (
    ctx: any,
    locale: Locale,
    result:
      | Awaited<ReturnType<PtyManager["sendPrompt"]>>
      | Awaited<ReturnType<PtyManager["continuePendingPrompt"]>>,
    {
      startedMessageKey = null
    }: {
      startedMessageKey?: "continueStarted" | "queueRunStarted" | null;
    } = {}
  ): Promise<void> => {
    if (result.started) {
      if (startedMessageKey) {
        await sendChunkedMarkdown(
          ctx,
          t(locale, startedMessageKey, { mode: result.mode })
        );
      }
      return;
    }

    if (result.reason === "workspace_busy") {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "workspaceContention", {
          relativeWorkdir: result.relativeWorkdir,
          mode: result.activeMode || "unknown",
          blockingChatId: result.blockingChatId,
          continueCommand: "/continue"
        })
      );
      return;
    }

    if (result.reason === "queued") {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "queueQueued", {
          index: result.item.index,
          id: result.item.id,
          queueLength: result.queueLength,
          text: result.item.text
        })
      );
      return;
    }

    if (result.reason === "no_pending_prompt") {
      await sendChunkedMarkdown(ctx, t(locale, "continueNothingPending"));
      return;
    }

    await sendChunkedMarkdown(
      ctx,
      t(locale, "taskBusy", { mode: result.activeMode || "unknown" })
    );
  };

  const renderOperationalStatus = async (
    ctx: any,
    locale: Locale,
    reason: "interrupt" | "status" = "status"
  ): Promise<void> => {
    const status = ptyManager.getStatus(ctx.chat.id);
    const items = ptyManager.listPromptQueue(ctx.chat.id);
    const nextItem = items[0];

    const lines = [
      t(
        locale,
        reason === "interrupt"
          ? "interruptWithQueueStatus"
          : "operationalStatusHeader"
      ),
      `active: ${status.active ? "yes" : "no"}`,
      `mode: ${status.activeMode || "idle"}`,
      `project: ${status.relativeWorkdir}`,
      `queued items: ${items.length}`
    ];

    if (nextItem) {
      lines.push(`next item: ${nextItem.text}`);
    }

    await sendSkillResult(
      ctx,
      {
        text: lines.join("\n"),
        buttons: buildQueueButtons(items)
      },
      locale,
      audioSummaryManager
    );
  };

  const executeProjectStatus = async (
    ctx: any,
    locale: Locale,
    variant: "default" | "executive" | "next" | "sources" | "steps" | "commands" | "prompts" | "queue" = "default"
  ): Promise<void> => {
    try {
      const result = await skills.project_status.execute({
        text: "",
        chatId: ctx.chat.id,
        workdir: ptyManager.getStatus(ctx.chat.id).workdir,
        locale,
        variant
      });
      await applySkillResult(
        ctx,
        result,
        locale,
        ptyManager,
        audioSummaryManager
      );
    } catch (error) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "processingFailed", { error: toErrorMessage(error) })
      );
    }
  };

  const executeActionPrompt = async (
    ctx: any,
    locale: Locale,
    prompt: string,
    intent: MemoryIntent = "auto",
    options: Record<string, unknown> = {}
  ): Promise<void> => {
    const workdir = ptyManager.getStatus(ctx.chat.id).workdir;
    const promptWithMemory = await buildPromptWithMemory(
      ctx.chat.id,
      workdir,
      prompt,
      intent
    );
    if (promptWithMemory.disclosure) {
      await sendChunkedMarkdown(ctx, promptWithMemory.disclosure);
    }
    const result = await ptyManager.sendPrompt(
      ctx,
      promptWithMemory.prompt,
      options as any
    );
    if (result.started) {
      await sendChunkedMarkdown(
        ctx,
        "Pedido enviado ao Codex. Vou te mostrando o andamento aqui."
      );
      return;
    }
    if (!result.started) {
      await handlePromptResult(ctx, locale, result);
    }
  };

  const handleStatusCommand = async (ctx: any): Promise<void> => {
    const locale = localeOf(ctx.chat.id);
    const status = ptyManager.getStatus(ctx.chat.id);
    const skillStates = skillRegistry.list(ctx.chat.id);
    const mcpServers = skills.mcp.mcpClient.listServers();
    const shellSummary = shellManager.isEnabled()
      ? `enabled, ${shellManager.isReadOnly() ? "read-only" : "writable"} (${shellManager.getAllowedCommands().length} prefixes)`
      : "disabled";
    const skillsSummary =
      skillStates
        .map(
          (skill: { name: string; enabled: boolean }) =>
            `${skill.name}:${skill.enabled ? "on" : "off"}`
        )
        .join(", ") || "none";
    const mcpSummary = mcpServers.length
      ? mcpServers
          .map(
            (server: { name: string; enabled: boolean; connected: boolean }) =>
              `${server.name}:${server.enabled ? "on" : "off"}/${server.connected ? "up" : "down"}`
          )
          .join(", ")
      : "none";
    await sendChunkedMarkdown(
      ctx,
      t(locale, "statusLines", {
        status,
        recentProjects:
          ptyManager
            .getRecentProjects(ctx.chat.id)
            .map((item) => item.relativePath)
            .join(", ") || ".",
        shellSummary,
        skillsSummary,
        mcpSummary
      }).join("\n")
    );
  };

  const handlePwdCommand = async (ctx: any): Promise<void> => {
    const status = ptyManager.getStatus(ctx.chat.id);
    await sendChunkedMarkdown(
      ctx,
      t(localeOf(ctx.chat.id), "pwdLines", {
        status,
        recent:
          ptyManager
            .getRecentProjects(ctx.chat.id)
            .map((item) => item.relativePath)
            .join(", ") || "."
      }).join("\n")
    );
  };

  const handleRepoCommand = async (ctx: any): Promise<void> => {
    const locale = localeOf(ctx.chat.id);
    const payload = extractCommandPayload(ctx.message.text, "repo");
    const status = ptyManager.getStatus(ctx.chat.id);
    const previousWorkdir = status.workdir;

    if (!payload) {
      const projects = ptyManager.listProjects();
      const recent = ptyManager.getRecentProjects(ctx.chat.id);
      const lines = formatProjectLines(projects, status.workdir);
      const recentLines = recent.map((project) => `- ${project.relativePath}`);
      const keyboard = Markup.inlineKeyboard(
        buildRepoButtons(projects, status.workdir, {
          includePrevious: recent.length > 1
        }).map((row) =>
          row.map((button) =>
            Markup.button.callback(button.text, button.callbackData)
          )
        )
      );

      await sendChunkedMarkdown(
        ctx,
        t(locale, "repoList", {
          workspaceRoot: status.workspaceRoot,
          projectLines: lines,
          recentLines
        }),
        {
          ...keyboard
        }
      );
      return;
    }

    if (/^recent$/i.test(payload)) {
      const recentProjects = ptyManager.getRecentProjects(ctx.chat.id);
      const recent = recentProjects.map((project) => `- ${project.relativePath}`);
      const keyboard = Markup.inlineKeyboard(
        buildRepoButtons(recentProjects, status.workdir, {
          includePrevious: recentProjects.length > 1
        }).map((row) =>
          row.map((button) =>
            Markup.button.callback(button.text, button.callbackData)
          )
        )
      );
      await sendChunkedMarkdown(
        ctx,
        t(locale, "repoRecent", {
          recentLines: recent
        }),
        {
          ...keyboard
        }
      );
      return;
    }

    try {
      let target = payload;
      if (payload !== "-") {
        const projects = ptyManager.listProjects();
        const exact = projects.find(
          (project) =>
            project.relativePath === payload || project.name === payload
        );

        if (!exact) {
          const lowerPayload = payload.toLowerCase();
          const matches = projects.filter((project) =>
            project.relativePath.toLowerCase().includes(lowerPayload)
          );

          if (!matches.length) {
            const suggestion = suggestProjectName(payload, projects);
            if (suggestion) {
              throw new Error(
                t(locale, "repoSuggestion", { value: payload, suggestion })
              );
            }

            throw new Error(t(locale, "repoNoMatch", { value: payload }));
          }

          if (matches.length > 1) {
            await sendChunkedMarkdown(
              ctx,
              t(locale, "repoMultipleMatches", {
                value: payload,
                projectLines: formatProjectLines(matches, status.workdir)
              })
            );
            return;
          }

          target = matches[0].relativePath;
        }
      }

      const result =
        target === "-"
          ? ptyManager.switchToPreviousWorkdir(ctx.chat.id)
          : ptyManager.switchWorkdir(ctx.chat.id, target);
      await sendChunkedMarkdown(
        ctx,
        result.workdir === previousWorkdir
          ? t(locale, "repoAlreadyCurrent", {
              relativePath: result.relativePath,
              workdir: result.workdir
            })
          : t(locale, "repoSwitched", {
              relativePath: result.relativePath,
              workdir: result.workdir
            })
      );
    } catch (error) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "repoSwitchFailed", { error: toErrorMessage(error) })
      );
    }
  };

  const handleMenuCommand = async (ctx: any): Promise<void> => {
    const keyboard = Markup.inlineKeyboard(
      buildMenuButtons().map((row) =>
        row.map((button) =>
          Markup.button.callback(button.text, button.callbackData)
        )
      )
    );
    await sendChunkedMarkdown(ctx, buildMenuText(), {
      ...keyboard
    });
  };

  const handleIncomingText = async (
    ctx: any,
    text: string,
    locale: Locale
  ): Promise<void> => {
    if (!text) return;
    if (/^(é‡å¯\s*bot|é‡å¯æœºå™¨äºº|restart bot)$/i.test(text)) {
      await sendChunkedMarkdown(ctx, t(locale, "useRestartCommand"));
      return;
    }
    if (/^\/\s+\S+/.test(text)) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "slashSpaceError", {
          fixed: text.replace(/^\/\s+/, "/")
        })
      );
      return;
    }

    if (text.startsWith("/")) return;

    try {
      if (isOperationalStatusQuestion(text)) {
        await renderOperationalStatus(ctx, locale, "status");
        return;
      }

      await executeActionPrompt(ctx, locale, text, inferMemoryIntent(text));
    } catch (error) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "processingFailed", { error: toErrorMessage(error) })
      );
    }
  };

  const handleAudioMessage = async (ctx: any): Promise<void> => {
    const locale = localeOf(ctx.chat.id);
    const voice = ctx.message?.voice;
    const audio = ctx.message?.audio;
    const fileId = voice?.file_id || audio?.file_id;
    if (!fileId) return;

    if (!audioTranscriber?.isEnabled()) {
      await sendChunkedMarkdown(ctx, t(locale, "audioTranscriptionUnavailable"));
      return;
    }

    const mimeType = voice?.mime_type || audio?.mime_type || "audio/ogg";
    const fileName =
      audio?.file_name || (voice ? "voice-note.ogg" : "audio-message.ogg");

    try {
      await sendChunkedMarkdown(ctx, t(locale, "audioTranscriptionStarted"));
      const result = await audioTranscriber.transcribeTelegramAudio({
        apiBase: telegramConfig.apiBase,
        token: telegramConfig.botToken,
        proxyUrl: telegramConfig.proxyUrl,
        fileId,
        fileName,
        mimeType
      });
      await sendChunkedMarkdown(
        ctx,
        t(locale, "audioTranscriptPreview", { text: result.text })
      );
      await handleIncomingText(ctx, result.text, locale);
    } catch (error) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "audioTranscriptionFailed", {
          error: toErrorMessage(error)
        })
      );
    }
  };

  const handleImageMessage = async (ctx: any): Promise<void> => {
    const locale = localeOf(ctx.chat.id);
    const photo = Array.isArray(ctx.message?.photo)
      ? ctx.message.photo[ctx.message.photo.length - 1]
      : null;
    const document = ctx.message?.document;
    const isImageDocument = /^image\//i.test(String(document?.mime_type || ""));
    const fileId = photo?.file_id || (isImageDocument ? document?.file_id : "");
    if (!fileId) {
      return;
    }

    const fileName =
      document?.file_name || (photo ? "telegram-photo.jpg" : "telegram-image");
    const mimeType = document?.mime_type || "image/jpeg";
    const caption = String(ctx.message?.caption || "").trim();
    let tempFilePath = "";

    try {
      await sendChunkedMarkdown(
        ctx,
        "Imagem recebida. Enviando para o Codex analisar."
      );
      const media = await telegramMediaDownloader({
        apiBase: telegramConfig.apiBase,
        token: telegramConfig.botToken,
        proxyUrl: telegramConfig.proxyUrl,
        fileId,
        fileName,
        mimeType,
        maxFileBytes: 20 * 1024 * 1024
      });
      tempFilePath = media.filePath;

      const prompt =
        caption ||
        "Analise esta imagem enviada no Telegram e me diga claramente o que ela mostra. Se houver erro, interface, texto, alerta ou contexto visual importante, use isso na resposta.";
      const result = await ptyManager.sendPrompt(
        ctx,
        [
          {
            type: "text",
            text: prompt
          },
          {
            type: "local_image",
            path: media.filePath
          }
        ],
        {
          cleanupPaths: [media.filePath]
        }
      );
      await handlePromptResult(ctx, locale, result);

      if (!result.started && result.reason !== "workspace_busy") {
        tempFilePath = "";
      }
    } catch (error) {
      if (tempFilePath) {
        await fs.rm(tempFilePath, { force: true }).catch(() => {});
      }
      await sendChunkedMarkdown(
        ctx,
        t(locale, "processingFailed", { error: toErrorMessage(error) })
      );
    }
  };

  bot.start(async (ctx: any) => {
    await sendChunkedMarkdown(
      ctx,
      [
        "Dex Agent pronto.",
        "Texto, audio e imagem vao direto para o Codex.",
        "Acoes estruturadas ficam no menu, nos comandos e nos botoes.",
        "",
        "Use /menu para abrir o painel deterministico."
      ].join("\n")
    );
  });

  bot.command("help", async (ctx: any) => {
    await sendChunkedMarkdown(ctx, buildHelpText());
  });

  bot.command("menu", handleMenuCommand);

  bot.command("status", handleStatusCommand);

  bot.command("pwd", handlePwdCommand);

  bot.command("repo", handleRepoCommand);

  bot.command("project", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const rawVariant = normalizeAscii(
      extractCommandPayload(ctx.message.text, "project")
    );
    const variantMap: Record<string, "default" | "executive" | "next" | "sources" | "steps" | "commands" | "queue" | "prompts"> = {
      "": "default",
      default: "default",
      executive: "executive",
      panorama: "executive",
      next: "next",
      proximo: "next",
      sources: "sources",
      fontes: "sources",
      steps: "steps",
      passos: "steps",
      commands: "commands",
      comandos: "commands",
      prompts: "prompts",
      prompt: "prompts",
      queue: "queue",
      fila: "queue"
    };
    const variant = variantMap[rawVariant];
    if (!variant) {
      await sendChunkedMarkdown(
        ctx,
        "Uso: /project [default|executive|next|sources|steps|commands|prompts|queue]"
      );
      return;
    }

    await executeProjectStatus(ctx, locale, variant);
  });

  bot.command("prompts", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const payload = extractCommandPayload(ctx.message.text, "prompts");
    const workdir = ptyManager.getStatus(ctx.chat.id).workdir;
    const contract = await skills.project_status.inspect({
      text: "",
      chatId: ctx.chat.id,
      workdir,
      locale,
      variant: "prompts"
    });
    const customPrompts = await promptLibraryService.listPrompts(workdir);
    const presets = buildProjectPromptPresets(contract, customPrompts);

    if (!payload || /^(show|list)$/i.test(payload)) {
      const rendered = renderPromptLibrary(presets);
      await applySkillResult(
        ctx,
        {
          text: rendered.text,
          parseMode: "markdown",
          buttons: rendered.buttons
        },
        locale,
        ptyManager,
        audioSummaryManager
      );
      return;
    }

    if (/^help$/i.test(payload)) {
      await sendChunkedMarkdown(ctx, buildPromptLibraryHelpText());
      return;
    }

    const addWithIntent = payload.match(
      /^add\s+(status|continue|planning|implementation)\s+::\s+(.+?)\s+::\s+([\s\S]+)$/i
    );
    if (addWithIntent?.[1] && addWithIntent[2] && addWithIntent[3]) {
      const created = await promptLibraryService.addPrompt(workdir, {
        intent: normalizeAscii(addWithIntent[1]) as any,
        label: addWithIntent[2].trim(),
        prompt: addWithIntent[3].trim()
      });
      await sendChunkedMarkdown(
        ctx,
        `Prompt salvo.\nid: ${created.id}\nintent: ${created.intent}\nlabel: ${created.label}`
      );
      return;
    }

    const addSimple = payload.match(/^add\s+(.+?)\s+::\s+([\s\S]+)$/i);
    if (addSimple?.[1] && addSimple[2]) {
      const created = await promptLibraryService.addPrompt(workdir, {
        label: addSimple[1].trim(),
        prompt: addSimple[2].trim()
      });
      await sendChunkedMarkdown(
        ctx,
        `Prompt salvo.\nid: ${created.id}\nintent: ${created.intent}\nlabel: ${created.label}`
      );
      return;
    }

    const runMatch = payload.match(/^run\s+(.+)$/i);
    if (runMatch?.[1]) {
      const selected = resolveProjectPromptPreset(runMatch[1], presets);
      if (!selected) {
        await sendChunkedMarkdown(
          ctx,
          "Nao encontrei esse prompt. Use /prompts para ver os seletores atuais."
        );
        return;
      }
      await executeActionPrompt(ctx, locale, selected.prompt, selected.intent);
      return;
    }

    const removeMatch = payload.match(/^remove\s+(.+)$/i);
    if (removeMatch?.[1]) {
      const selector = normalizePromptSelector(removeMatch[1]);
      if (!selector.startsWith("custom:")) {
        await sendChunkedMarkdown(
          ctx,
          "So prompts custom podem ser removidos. Use /prompts para ver os seletores."
        );
        return;
      }
      const removed = await promptLibraryService.removePrompt(
        workdir,
        selector.replace(/^custom:/, "")
      );
      await sendChunkedMarkdown(
        ctx,
        removed
          ? `Prompt removido: ${removed.label}`
          : "Nao encontrei esse prompt custom."
      );
      return;
    }

    await sendChunkedMarkdown(ctx, buildPromptLibraryHelpText());
  });

  bot.command("inbox", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const payload = extractCommandPayload(ctx.message.text, "inbox");
    const workdir = ptyManager.getStatus(ctx.chat.id).workdir;
    const memoryReadmePath = path.join(
      process.cwd(),
      "docs",
      "memory-system",
      "README.md"
    );

    if (/^help$/i.test(payload)) {
      await sendChunkedMarkdown(ctx, buildInboxHelpText(memoryReadmePath));
      return;
    }

    if (!payload || /^(show|status)$/i.test(payload)) {
      const rendered = renderInboxOverview(
        locale,
        await memoryService.listCandidates(workdir),
        await memoryService.listProposals(workdir)
      );
      await applySkillResult(
        ctx,
        {
          text: rendered.text,
          parseMode: "markdown",
          buttons: rendered.buttons
        },
        locale,
        ptyManager,
        audioSummaryManager
      );
      return;
    }

    if (/^candidates$/i.test(payload)) {
      const rendered = renderMemoryCandidates(
        locale,
        await memoryService.listCandidates(workdir)
      );
      await applySkillResult(
        ctx,
        {
          text: rendered.text,
          parseMode: "markdown",
          buttons: rendered.buttons
        },
        locale,
        ptyManager,
        audioSummaryManager
      );
      return;
    }

    if (/^proposals$/i.test(payload)) {
      const rendered = renderInboxProposals(
        locale,
        await memoryService.listProposals(workdir)
      );
      await applySkillResult(
        ctx,
        {
          text: rendered.text,
          parseMode: "markdown",
          buttons: rendered.buttons
        },
        locale,
        ptyManager,
        audioSummaryManager
      );
      return;
    }

    const promoteMatch = payload.match(/^promote\s+(.+)$/i);
    if (promoteMatch?.[1]) {
      const proposal = await memoryService.proposePromotion(
        workdir,
        promoteMatch[1].trim()
      );
      if (!proposal) {
        await sendChunkedMarkdown(ctx, "No inbox candidate matched that selector.");
        return;
      }
      const rendered = renderInboxProposal(locale, proposal);
      await applySkillResult(
        ctx,
        {
          text: rendered.text,
          parseMode: "markdown",
          buttons: rendered.buttons
        },
        locale,
        ptyManager,
        audioSummaryManager
      );
      return;
    }

    const discardMatch = payload.match(/^discard\s+(.+)$/i);
    if (discardMatch?.[1]) {
      const discarded = await memoryService.discardCandidate(
        workdir,
        discardMatch[1].trim()
      );
      await sendChunkedMarkdown(
        ctx,
        discarded
          ? `Discarded inbox candidate: ${discarded.title}`
          : "No inbox candidate matched that selector."
      );
      return;
    }

    const whyMatch = payload.match(/^why\s+(.+)$/i);
    if (whyMatch?.[1]) {
      const explanation = await memoryService.explainCandidate(
        workdir,
        whyMatch[1].trim()
      );
      await sendChunkedMarkdown(
        ctx,
        explanation || "No inbox candidate matched that selector."
      );
      return;
    }

    const confirmMatch = payload.match(/^confirm\s+(.+)$/i);
    if (confirmMatch?.[1]) {
      const result = await memoryService.applyPromotion(
        workdir,
        confirmMatch[1].trim()
      );
      if (!result.ok) {
        await sendChunkedMarkdown(
          ctx,
          result.reason === "duplicate"
            ? "A matching durable memory entry already exists. Nothing was written."
            : "Inbox promotion could not be completed."
        );
        return;
      }
      await sendChunkedMarkdown(
        ctx,
        result.skillPromotion
          ? [
              result.destination === "global_skill"
                ? "Memory promoted and skill created globally with repo mirror."
                : "Memory promoted and project skill created.",
              `kind: ${result.entry?.kind}`,
              `title: ${result.entry?.title}`,
              `skill: ${result.skillPromotion.draft.name}`
            ].join("\n")
          : `Memory promoted.\nkind: ${result.entry?.kind}\ntitle: ${result.entry?.title}`
      );
      return;
    }

    const cancelMatch = payload.match(/^cancel\s+(.+)$/i);
    if (cancelMatch?.[1]) {
      const cancelled = await memoryService.cancelProposal(
        workdir,
        cancelMatch[1].trim()
      );
      await sendChunkedMarkdown(
        ctx,
        cancelled
          ? "Inbox proposal cancelled."
          : "No inbox proposal matched that selector."
      );
      return;
    }

    await sendChunkedMarkdown(
      ctx,
      "Usage: /inbox [show|help|candidates|proposals|promote <id|index>|discard <id|index>|why <id|index>|confirm <id|index>|cancel <id|index>]"
    );
  });

  bot.command("memory", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const payload = extractCommandPayload(ctx.message.text, "memory");
    const workdir = ptyManager.getStatus(ctx.chat.id).workdir;
    const memoryReadmePath = path.join(
      process.cwd(),
      "docs",
      "memory-system",
      "README.md"
    );

    if (/^help$/i.test(payload)) {
      await sendChunkedMarkdown(ctx, buildMemoryHelpText(memoryReadmePath));
      return;
    }

    if (!payload || /^(show|status)$/i.test(payload)) {
      const packet = await memoryService.buildMemoryPacket({
          workdir,
          prompt: "project memory status",
          intent: "status"
        });
        const rendered = renderRelevantMemory(locale, workdir, packet);
        await applySkillResult(
          ctx,
          {
            text: rendered.text,
            parseMode: "markdown",
            buttons: rendered.buttons
          },
          locale,
          ptyManager,
          audioSummaryManager
        );
        return;
      }

    if (/^candidates$/i.test(payload)) {
      const rendered = renderMemoryCandidates(
        locale,
        await memoryService.listCandidates(workdir)
      );
      await applySkillResult(
        ctx,
        {
          text: rendered.text,
          parseMode: "markdown",
          buttons: rendered.buttons
        },
        locale,
        ptyManager,
        audioSummaryManager
      );
      return;
    }

    const promoteMatch = payload.match(/^promote\s+(.+)$/i);
    if (promoteMatch?.[1]) {
      const proposal = await memoryService.proposePromotion(
        workdir,
        promoteMatch[1].trim()
      );
      if (!proposal) {
        await sendChunkedMarkdown(ctx, "No memory candidate matched that selector.");
        return;
      }
      const rendered = renderMemoryProposal(locale, proposal);
      await applySkillResult(
        ctx,
        {
          text: rendered.text,
          parseMode: "markdown",
          buttons: rendered.buttons
        },
        locale,
        ptyManager,
        audioSummaryManager
      );
      return;
    }

    const discardMatch = payload.match(/^discard\s+(.+)$/i);
    if (discardMatch?.[1]) {
      const discarded = await memoryService.discardCandidate(
        workdir,
        discardMatch[1].trim()
      );
      await sendChunkedMarkdown(
        ctx,
        discarded
          ? `Discarded memory candidate: ${discarded.title}`
          : "No memory candidate matched that selector."
      );
      return;
    }

    const whyMatch = payload.match(/^why\s+(.+)$/i);
    if (whyMatch?.[1]) {
      const explanation = await memoryService.explainCandidate(
        workdir,
        whyMatch[1].trim()
      );
      await sendChunkedMarkdown(
        ctx,
        explanation || "No memory candidate matched that selector."
      );
      return;
    }

    const rememberMatch = payload.match(/^remember\s+(.+)$/i);
    if (rememberMatch?.[1]) {
      const rawRemember = rememberMatch[1].trim();
      const typedMatch = rawRemember.match(
        /^(decision|rule|procedure|exception|fact|task_state)\s*[:-]\s*(.+)$/i
      );
      const candidate = await memoryService.captureCandidate({
        workdir,
        text: typedMatch?.[2] || rawRemember,
        kind: typedMatch?.[1]
          ? (typedMatch[1].toLowerCase() as any)
          : undefined,
        source: {
          type: "operator",
          detail: "/memory remember"
        },
        evidence: {
          type: "operator",
          value: rawRemember
        }
      });

      if (!candidate) {
        await sendChunkedMarkdown(
          ctx,
          "That note was too weak to become a memory candidate. Add more concrete project context."
        );
        return;
      }

      await sendChunkedMarkdown(
        ctx,
        `Created memory candidate ${candidate.id}\nkind: ${candidate.kind}\ntitle: ${candidate.title}`
      );
      return;
    }

    await sendChunkedMarkdown(
      ctx,
      "Usage: /memory [show|help|candidates|promote <id|index>|discard <id|index>|why <id|index>|remember <text>] or /inbox [...]"
    );
  });

  bot.command("skill", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const payload = extractCommandPayload(ctx.message.text, "skill");
    if (!payload || /^(list|status)$/i.test(payload)) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "skillList", {
          skillLines: formatSkillLines(skillRegistry.list(ctx.chat.id))
        })
      );
      return;
    }

    const [action, rawName] = payload.split(/\s+/, 2);
    if (!/^(on|off)$/i.test(action) || !rawName) {
      await sendChunkedMarkdown(ctx, t(locale, "skillUsage"));
      return;
    }

    try {
      const actionResult = /^on$/i.test(action)
        ? skillRegistry.enable(ctx.chat.id, rawName)
        : skillRegistry.disable(ctx.chat.id, rawName);
      if (/^on$/i.test(action)) {
        await sendChunkedMarkdown(
          ctx,
          t(locale, "skillStateChanged", {
            name: rawName,
            enabled: true,
            changed: actionResult.changed,
            skillLines: formatSkillLines(actionResult.skills)
          })
        );
        return;
      }

      await sendChunkedMarkdown(
        ctx,
        t(locale, "skillStateChanged", {
          name: rawName,
          enabled: false,
          changed: actionResult.changed,
          skillLines: formatSkillLines(actionResult.skills)
        })
      );
    } catch (error) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "skillManagementFailed", { error: toErrorMessage(error) })
      );
    }
  });

  bot.command("new", async (ctx: any) => {
    const result = ptyManager.resetCurrentProjectConversation(ctx.chat.id);
    await sendChunkedMarkdown(
      ctx,
      t(localeOf(ctx.chat.id), "conversationReset", { closed: result.closed })
    );
  });

  bot.command("restart", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    if (!adminActions?.restart) {
      await sendChunkedMarkdown(ctx, t(locale, "restartUnavailable"));
      return;
    }

    await sendChunkedMarkdown(ctx, t(locale, "restarting"));
    await adminActions.restart();
  });

  bot.command("exec", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const task = extractCommandPayload(ctx.message.text, "exec");
    if (!task) {
      await sendChunkedMarkdown(ctx, t(locale, "usageExec"));
      return;
    }

    await executeActionPrompt(ctx, locale, task, "implementation", {
      forceExec: true,
      notice: t(locale, "execNotice")
    });
  });

  bot.command("sh", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const command = extractCommandPayload(ctx.message.text, "sh");
    if (!command) {
      await sendChunkedMarkdown(ctx, t(locale, "usageSh"));
      return;
    }

    const status = ptyManager.getStatus(ctx.chat.id);
    if (status.active) {
      await sendChunkedMarkdown(ctx, t(locale, "codexBusyForShell"));
      return;
    }

    let validation;
    try {
      validation = shellManager.inspectCommand(command, { locale });
    } catch (error) {
      await sendChunkedMarkdown(ctx, toErrorMessage(error));
      return;
    }

    if (validation.requiresConfirmation) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "shellRequiresConfirmation", {
          command: validation.commandText,
          confirmationCommand: validation.confirmationCommand
        })
      );
      return;
    }

    await sendChunkedMarkdown(
      ctx,
      t(locale, "runningSafeShell", {
        workdir: status.workdir,
        command: validation.argv.join(" ")
      })
    );

    const result = await shellManager.execute({
      chatId: ctx.chat.id,
      rawCommand: command,
      workdir: status.workdir,
      locale
    });

    if (!result.started) {
      await sendChunkedMarkdown(ctx, t(locale, "shellBusy"));
      return;
    }

    await sendChunkedMarkdown(ctx, t(locale, "shellResult", { result }));

    const followUp = buildShellSuccessFollowUp(
      locale,
      result,
      status.workspaceRoot
    );
    if (followUp) {
      await sendChunkedMarkdown(ctx, followUp);
    }
  });

  bot.command("dev", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const payload = extractCommandPayload(ctx.message.text, "dev");
    const subcommand = (payload || "status").trim().toLowerCase();
    const runtimeStatus = ptyManager.getStatus(ctx.chat.id);
    const workdir = runtimeStatus.workdir;
    const relativeWorkdir = runtimeStatus.relativeWorkdir;

    if (!subcommand || subcommand === "status") {
      const devStatus = devServerManager.getStatus(workdir);
      await sendChunkedMarkdown(
        ctx,
        t(locale, "devStatus", {
          devStatus,
          relativeWorkdir
        })
      );
      return;
    }

    if (subcommand === "start") {
      const result = await devServerManager.start({
        workdir,
        chatId: ctx.chat.id
      });

      if (result.started) {
        await sendChunkedMarkdown(
          ctx,
          t(locale, "devStarted", {
            command: result.command,
            scriptName: result.scriptName,
            relativeWorkdir
          })
        );
        return;
      }

      if (result.reason === "already_running") {
        await sendChunkedMarkdown(
          ctx,
          t(locale, "devAlreadyRunning", {
            relativeWorkdir,
            startedByChatId: result.status.startedByChatId || "unknown",
            command: result.status.command || "unknown"
          })
        );
        return;
      }

      if (result.reason === "no_package_json") {
        await sendChunkedMarkdown(
          ctx,
          t(locale, "devNoPackageJson", { relativeWorkdir })
        );
        return;
      }

      if (result.reason === "no_script") {
        await sendChunkedMarkdown(
          ctx,
          t(locale, "devNoScript", {
            relativeWorkdir,
            availableScripts: result.availableScripts.join(", ") || "(none)"
          })
        );
        return;
      }

      await sendChunkedMarkdown(
        ctx,
        t(locale, "devSpawnFailed", { error: result.error })
      );
      return;
    }

    if (subcommand === "stop") {
      const stopped = devServerManager.stop(workdir);
      await sendChunkedMarkdown(
        ctx,
        t(locale, stopped ? "devStopped" : "devNotRunning", {
          relativeWorkdir
        })
      );
      return;
    }

    if (subcommand === "logs") {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "devLogs", {
          relativeWorkdir,
          logs: devServerManager.getLogs(workdir)
        })
      );
      return;
    }

    if (subcommand === "url") {
      const url = devServerManager.getUrl(workdir);
      await sendChunkedMarkdown(
        ctx,
        t(locale, url ? "devUrl" : "devNoUrl", {
          relativeWorkdir,
          url: url || ""
        })
      );
      return;
    }

    await sendChunkedMarkdown(ctx, t(locale, "usageDev"));
  });

  bot.command("auto", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const task = extractCommandPayload(ctx.message.text, "auto");
    if (!task) {
      await sendChunkedMarkdown(ctx, t(locale, "usageAuto"));
      return;
    }

    await executeActionPrompt(
      ctx,
      locale,
      applyLocalExecutionPreference(task),
      "implementation",
      {
      forceExec: true,
      fullAuto: true,
      notice: t(locale, "autoNotice")
      }
    );
  });

  bot.command("plan", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const task = extractCommandPayload(ctx.message.text, "plan");
    if (!task) {
      await sendChunkedMarkdown(ctx, t(locale, "usagePlan"));
      return;
    }

    await executeActionPrompt(
      ctx,
      locale,
      applyLocalExecutionPreference(buildPlanPrompt(task)),
      "planning",
      {
        forceExec: true,
        notice: t(locale, "planNotice")
      }
    );
  });

  bot.command("continue", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const result = await ptyManager.continuePendingPrompt(ctx);
    await handlePromptResult(ctx, locale, result, {
      startedMessageKey: "continueStarted"
    });
  });

  const renderQueueList = async (ctx: any, locale: Locale): Promise<void> => {
    const items = ptyManager.listPromptQueue(ctx.chat.id);
    await sendSkillResult(
      ctx,
      items.length
        ? {
            text: t(locale, "queueList", {
              queueLines: formatQueueLines(items)
            }),
            buttons: buildQueueButtons(items)
          }
        : {
            text: t(locale, "queueEmpty"),
            buttons: buildQueueButtons([])
          },
      locale,
      audioSummaryManager
    );
  };

  const handleQueueCommand = async (
    ctx: any,
    commandName: "queue" | "fila"
  ): Promise<void> => {
    const locale = localeOf(ctx.chat.id);
    const payload = extractCommandPayload(ctx.message.text, commandName);
    const trimmedPayload = String(payload || "").trim();
    const [action = "list", ...rest] = trimmedPayload
      .split(/\s+/)
      .filter(Boolean);
    const normalizedAction = normalizeAscii(action);

    if (!trimmedPayload || /^(list|ls|listar|ver|status)$/.test(normalizedAction)) {
      await renderQueueList(ctx, locale);
      return;
    }

    if (/^(add|adicionar|addicionar|colocar)$/.test(normalizedAction)) {
      const task = trimmedPayload.replace(/^\S+\s*/, "").trim();
      if (!task) {
        await sendChunkedMarkdown(ctx, t(locale, "usageQueue"));
        return;
      }

      const projectScopedMatch = task.match(/^(.+?)\s*::\s*(.+)$/);
      const targetProject = projectScopedMatch
        ? ptyManager.resolveProjectWorkdir(projectScopedMatch[1])
        : null;
      if (projectScopedMatch && !targetProject) {
        await sendChunkedMarkdown(
          ctx,
          t(locale, "queueAddFailed", {
            reason: `project_not_found:${projectScopedMatch[1].trim()}`
          })
        );
        return;
      }

      const finalTask = projectScopedMatch ? projectScopedMatch[2].trim() : task;
      if (!finalTask) {
        await sendChunkedMarkdown(ctx, t(locale, "usageQueue"));
        return;
      }

      const queued = ptyManager.enqueuePrompt(
        ctx.chat.id,
        finalTask,
        targetProject?.workdir || ptyManager.getStatus(ctx.chat.id).workdir
      );
      await sendChunkedMarkdown(
        ctx,
        queued.ok && queued.item
          ? [
              t(locale, "queueAdded", {
                index: queued.item.index,
                id: queued.item.id,
                text: queued.item.text
              }),
              `projeto: ${targetProject?.relativePath || queued.item.relativeWorkdir}`
            ].join("\n")
          : t(locale, "queueAddFailed", { reason: queued.reason || "unknown" })
      );
      return;
    }

    if (/^(remove|rm|delete|del|remover|apagar)$/.test(normalizedAction)) {
      const selector = rest.join(" ").trim();
      if (!selector) {
        await sendChunkedMarkdown(ctx, t(locale, "usageQueue"));
        return;
      }

      const removed = ptyManager.removeQueuedPrompt(ctx.chat.id, selector);
      await sendChunkedMarkdown(
        ctx,
        removed.ok && removed.removed
          ? t(locale, "queueRemoved", {
              id: removed.removed.id,
              text: removed.removed.text,
              count: removed.count || 0
            })
          : t(locale, "queueRemoveFailed", {
              selector,
              reason: removed.reason || "not_found"
            })
      );
      return;
    }

    if (/^(clear|limpar|zerar)$/.test(normalizedAction)) {
      const cleared = ptyManager.clearPromptQueue(ctx.chat.id);
      await sendChunkedMarkdown(
        ctx,
        t(locale, "queueCleared", { count: cleared.count || 0 })
      );
      return;
    }

    if (/^(run|next|executar|rodar|proximo)$/.test(normalizedAction)) {
      const result = await ptyManager.runNextQueuedPrompt(ctx);
      await handlePromptResult(ctx, locale, result, {
        startedMessageKey: "queueRunStarted"
      });
      return;
    }

    await sendChunkedMarkdown(ctx, t(locale, "usageQueue"));
  };

  bot.command("queue", async (ctx: any) => handleQueueCommand(ctx, "queue"));
  bot.command("fila", async (ctx: any) => handleQueueCommand(ctx, "fila"));

  bot.command("model", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const value = extractCommandPayload(ctx.message.text, "model");
    if (!value) {
      const status = ptyManager.getStatus(ctx.chat.id);
      await sendChunkedMarkdown(
        ctx,
        t(locale, "modelCurrent", { model: status.preferredModel })
      );
      return;
    }

    if (/^(reset|default|inherit)$/i.test(value)) {
      ptyManager.clearPreferredModel(ctx.chat.id);
      const closed = ptyManager.closeSession(ctx.chat.id);
      await sendChunkedMarkdown(ctx, t(locale, "modelReset", { closed }));
      return;
    }

    ptyManager.setPreferredModel(ctx.chat.id, value);
    const closed = ptyManager.closeSession(ctx.chat.id);
    await sendChunkedMarkdown(ctx, t(locale, "modelSet", { value, closed }));
  });

  bot.command("verbose", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const value = extractCommandPayload(ctx.message.text, "verbose");
    if (!value) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "verboseCurrent", {
          enabled: ptyManager.isVerbose(ctx.chat.id)
        })
      );
      return;
    }

    if (/^(on|true|1)$/i.test(value)) {
      ptyManager.setVerbose(ctx.chat.id, true);
      await sendChunkedMarkdown(
        ctx,
        t(locale, "verboseSet", { enabled: true })
      );
      return;
    }

    if (/^(off|false|0)$/i.test(value)) {
      ptyManager.setVerbose(ctx.chat.id, false);
      await sendChunkedMarkdown(
        ctx,
        t(locale, "verboseSet", { enabled: false })
      );
      return;
    }

    await sendChunkedMarkdown(ctx, t(locale, "usageVerbose"));
  });

  bot.command("language", async (ctx: any) => {
    const currentLocale = localeOf(ctx.chat.id);
    const value = extractCommandPayload(ctx.message.text, "language");
    if (!value) {
      await sendChunkedMarkdown(
        ctx,
        t(currentLocale, "languageCurrent", {
          language: currentLocale
        })
      );
      return;
    }

    const normalized = normalizeLanguage(value);
    if (!normalized || !SUPPORTED_LANGUAGES.includes(normalized)) {
      await sendChunkedMarkdown(ctx, t(currentLocale, "languageInvalid"));
      return;
    }

    ptyManager.setLanguage(ctx.chat.id, normalized);
    await sendChunkedMarkdown(
      ctx,
      t(normalized, "languageSet", {
        language: normalized
      })
    );
  });

  bot.command("interrupt", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const ok = ptyManager.interrupt(ctx.chat.id);
    await sendChunkedMarkdown(
      ctx,
      t(locale, "interruptResult", { ok })
    );

    if (ok && ptyManager.listPromptQueue(ctx.chat.id).length) {
      await renderOperationalStatus(ctx, locale, "interrupt");
    }
  });

  bot.command("stop", async (ctx: any) => {
    const ok = ptyManager.closeSession(ctx.chat.id);
    await sendChunkedMarkdown(
      ctx,
      t(localeOf(ctx.chat.id), "stopResult", { ok })
    );
  });

  bot.command("cron_now", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    try {
      await scheduler.triggerDailySummaryNow(ctx.from.id);
      await sendChunkedMarkdown(ctx, t(locale, "cronTriggered"));
    } catch (error) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "triggerFailed", { error: toErrorMessage(error) })
      );
    }
  });

  bot.command("gh", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    if (!skillRegistry.isEnabled(ctx.chat.id, "github")) {
      await sendChunkedMarkdown(ctx, t(locale, "githubDisabled"));
      return;
    }

    try {
      const text = extractCommandPayload(ctx.message.text, "gh") || "help";
      const result = await skills.github.execute({
        text: `/gh ${text}`,
        chatId: ctx.chat.id,
        workdir: ptyManager.getStatus(ctx.chat.id).workdir,
        locale
      });
      await applySkillResult(
        ctx,
        result,
        locale,
        ptyManager,
        audioSummaryManager
      );
    } catch (error) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "githubFailed", { error: toErrorMessage(error) })
      );
    }
  });

  bot.command("mcp", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    if (!skillRegistry.isEnabled(ctx.chat.id, "mcp")) {
      await sendChunkedMarkdown(ctx, t(locale, "mcpDisabled"));
      return;
    }

    try {
      const text = ctx.message.text.trim();
      const result = await skills.mcp.execute({ text, ctx, locale });
      await applySkillResult(
        ctx,
        result,
        locale,
        ptyManager,
        audioSummaryManager
      );
    } catch (error) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "mcpFailed", { error: toErrorMessage(error) })
      );
    }
  });

  bot.on("callback_query", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const data = ctx.callbackQuery?.data || "";
    if (data.startsWith("menu:")) {
      await ctx.answerCbQuery(t(locale, "callbackRefreshed"));
      const action = data.replace("menu:", "");

      if (action === "project") {
        await executeProjectStatus(ctx, locale, "default");
        return;
      }
      if (action === "inbox") {
        ctx.message = { text: "/inbox" };
        const inboxHandler = bot.commands.get("inbox");
        if (inboxHandler) {
          await inboxHandler(ctx);
        }
        return;
      }
      if (action === "repo") {
        ctx.message = { text: "/repo" };
        await handleRepoCommand(ctx);
        return;
      }
      if (action === "queue") {
        ctx.message = { text: "/queue" };
        await handleQueueCommand(ctx, "queue");
        return;
      }
      if (action === "status") {
        await handleStatusCommand(ctx);
        return;
      }
      if (action === "pwd") {
        await handlePwdCommand(ctx);
        return;
      }
      if (action === "dev") {
        ctx.message = { text: "/dev status" };
        const devHandler = bot.commands.get("dev");
        if (devHandler) {
          await devHandler(ctx);
        }
        return;
      }
      if (action === "continue") {
        const result = await ptyManager.continuePendingPrompt(ctx);
        await handlePromptResult(ctx, locale, result, {
          startedMessageKey: "continueStarted"
        });
        return;
      }
      if (action === "new") {
        const result = ptyManager.resetCurrentProjectConversation(ctx.chat.id);
        await sendChunkedMarkdown(
          ctx,
          t(locale, "conversationReset", { closed: result.closed })
        );
        return;
      }
      if (action === "interrupt") {
        const ok = ptyManager.interrupt(ctx.chat.id);
        await sendChunkedMarkdown(ctx, t(locale, "interruptResult", { ok }));
        return;
      }
      if (action === "stop") {
        const ok = ptyManager.closeSession(ctx.chat.id);
        await sendChunkedMarkdown(ctx, t(locale, "stopResult", { ok }));
        return;
      }
      if (action === "help") {
        await sendChunkedMarkdown(ctx, buildHelpText());
      }
      return;
    }

    if (data.startsWith("repo:switch:")) {
      await ctx.answerCbQuery(t(locale, "callbackRefreshed"));
      const status = ptyManager.getStatus(ctx.chat.id);
      const previousWorkdir = status.workdir;
      const rawTarget = data.replace("repo:switch:", "");
      const target = rawTarget === "-" ? "-" : decodeURIComponent(rawTarget);

      try {
        const result =
          target === "-"
            ? ptyManager.switchToPreviousWorkdir(ctx.chat.id)
            : ptyManager.switchWorkdir(ctx.chat.id, target);
        await sendChunkedMarkdown(
          ctx,
          result.workdir === previousWorkdir
            ? t(locale, "repoAlreadyCurrent", {
                relativePath: result.relativePath,
                workdir: result.workdir
              })
            : t(locale, "repoSwitched", {
                relativePath: result.relativePath,
                workdir: result.workdir
              })
        );
      } catch (error) {
        await sendChunkedMarkdown(
          ctx,
          t(locale, "repoSwitchFailed", { error: toErrorMessage(error) })
        );
      }
      return;
    }

    if (data.startsWith("queue:")) {
      await ctx.answerCbQuery(t(locale, "callbackRefreshed"));
      const [, action, argument] = data.split(":", 3);

      if (action === "list") {
        await renderQueueList(ctx, locale);
        return;
      }

      if (action === "run") {
        const result = await ptyManager.runNextQueuedPrompt(ctx);
        await handlePromptResult(ctx, locale, result, {
          startedMessageKey: "queueRunStarted"
        });
        return;
      }

      if (action === "clear") {
        const cleared = ptyManager.clearPromptQueue(ctx.chat.id);
        await sendChunkedMarkdown(
          ctx,
          t(locale, "queueCleared", { count: cleared.count || 0 })
        );
        return;
      }

      if (action === "remove") {
        const selector = String(argument || "").trim();
        const removed = ptyManager.removeQueuedPrompt(ctx.chat.id, selector);
        await sendChunkedMarkdown(
          ctx,
          removed.ok && removed.removed
            ? t(locale, "queueRemoved", {
                id: removed.removed.id,
                text: removed.removed.text,
                count: removed.count || 0
              })
            : t(locale, "queueRemoveFailed", {
                selector,
                reason: removed.reason || "not_found"
              })
        );
        await renderQueueList(ctx, locale);
        return;
      }
    }

    if (data.startsWith("memory:")) {
      const payload = data.replace("memory:", "");
      const [action, argument] = payload.split(":", 2);
      const workdir = ptyManager.getStatus(ctx.chat.id).workdir;

      await ctx.answerCbQuery(t(locale, "callbackRefreshed"));

      if (action === "show") {
        const packet = await memoryService.buildMemoryPacket({
          workdir,
          prompt: "project memory status",
          intent: "status"
        });
        const rendered = renderRelevantMemory(locale, workdir, packet);
        await applySkillResult(
          ctx,
          {
            text: rendered.text,
            parseMode: "markdown",
            buttons: rendered.buttons
          },
          locale,
          ptyManager,
          audioSummaryManager
        );
        return;
      }

      if (action === "candidates") {
        const rendered = renderMemoryCandidates(
          locale,
          await memoryService.listCandidates(workdir)
        );
        await applySkillResult(
          ctx,
          {
            text: rendered.text,
            parseMode: "markdown",
            buttons: rendered.buttons
          },
          locale,
          ptyManager,
          audioSummaryManager
        );
        return;
      }

      if (action === "promote") {
        const proposal = await memoryService.proposePromotion(
          workdir,
          argument || ""
        );
        if (!proposal) {
          await sendChunkedMarkdown(ctx, "No memory candidate matched that selector.");
          return;
        }
        const rendered = renderMemoryProposal(locale, proposal);
        await applySkillResult(
          ctx,
          {
            text: rendered.text,
            parseMode: "markdown",
            buttons: rendered.buttons
          },
          locale,
          ptyManager,
          audioSummaryManager
        );
        return;
      }

      if (action === "discard") {
        const discarded = await memoryService.discardCandidate(
          workdir,
          argument || ""
        );
        await sendChunkedMarkdown(
          ctx,
          discarded
            ? `Discarded memory candidate: ${discarded.title}`
            : "No memory candidate matched that selector."
        );
        return;
      }

      if (action === "why") {
        const explanation = await memoryService.explainCandidate(
          workdir,
          argument || ""
        );
        await sendChunkedMarkdown(
          ctx,
          explanation || "No memory candidate matched that selector."
        );
        return;
      }

      if (action === "confirm") {
        const result = await memoryService.applyPromotion(
          workdir,
          argument || ""
        );
        if (!result.ok) {
          await sendChunkedMarkdown(
            ctx,
            result.reason === "duplicate"
              ? "A matching durable memory entry already exists. Nothing was written."
              : "Memory promotion could not be completed."
          );
          return;
        }
        await sendChunkedMarkdown(
          ctx,
          result.skillPromotion
            ? [
                result.destination === "global_skill"
                  ? "Memory promoted and skill created globally with repo mirror."
                  : "Memory promoted and project skill created.",
                `kind: ${result.entry?.kind}`,
                `title: ${result.entry?.title}`,
                `skill: ${result.skillPromotion.draft.name}`
              ].join("\n")
            : `Memory promoted.\nkind: ${result.entry?.kind}\ntitle: ${result.entry?.title}`
        );
        return;
      }

      if (action === "cancel") {
        const cancelled = await memoryService.cancelProposal(
          workdir,
          argument || ""
        );
        await sendChunkedMarkdown(
          ctx,
          cancelled
            ? "Memory promotion cancelled."
            : "No pending memory proposal matched that selector."
        );
        return;
      }

      if (action === "view") {
        const target = (argument || "active") as "active" | "handoff" | "napkin" | "ledger";
        const content = await memoryService.readOperationalFile(workdir, target);
        await sendChunkedMarkdown(
          ctx,
          content
            ? `*${target.toUpperCase()}*\n\n${content.slice(0, 3200)}`
            : `No ${target} file exists for this project.`,
          { parse_mode: "MarkdownV2" }
        );
        return;
      }
    }

    if (data.startsWith("inbox:")) {
      const payload = data.replace("inbox:", "");
      const [action, argument] = payload.split(":", 2);
      const workdir = ptyManager.getStatus(ctx.chat.id).workdir;

      await ctx.answerCbQuery(t(locale, "callbackRefreshed"));

      if (action === "show") {
        const rendered = renderInboxOverview(
          locale,
          await memoryService.listCandidates(workdir),
          await memoryService.listProposals(workdir)
        );
        await applySkillResult(
          ctx,
          {
            text: rendered.text,
            parseMode: "markdown",
            buttons: rendered.buttons
          },
          locale,
          ptyManager,
          audioSummaryManager
        );
        return;
      }

      if (action === "candidates") {
        const rendered = renderInboxCandidates(
          locale,
          await memoryService.listCandidates(workdir)
        );
        await applySkillResult(
          ctx,
          {
            text: rendered.text,
            parseMode: "markdown",
            buttons: rendered.buttons
          },
          locale,
          ptyManager,
          audioSummaryManager
        );
        return;
      }

      if (action === "proposals") {
        const rendered = renderInboxProposals(
          locale,
          await memoryService.listProposals(workdir)
        );
        await applySkillResult(
          ctx,
          {
            text: rendered.text,
            parseMode: "markdown",
            buttons: rendered.buttons
          },
          locale,
          ptyManager,
          audioSummaryManager
        );
        return;
      }

      if (action === "promote") {
        const proposal = await memoryService.proposePromotion(
          workdir,
          argument || ""
        );
        if (!proposal) {
          await sendChunkedMarkdown(ctx, "No inbox candidate matched that selector.");
          return;
        }
        const rendered = renderInboxProposal(locale, proposal);
        await applySkillResult(
          ctx,
          {
            text: rendered.text,
            parseMode: "markdown",
            buttons: rendered.buttons
          },
          locale,
          ptyManager,
          audioSummaryManager
        );
        return;
      }

      if (action === "discard") {
        const discarded = await memoryService.discardCandidate(
          workdir,
          argument || ""
        );
        await sendChunkedMarkdown(
          ctx,
          discarded
            ? `Discarded inbox candidate: ${discarded.title}`
            : "No inbox candidate matched that selector."
        );
        return;
      }

      if (action === "why") {
        const explanation = await memoryService.explainCandidate(
          workdir,
          argument || ""
        );
        await sendChunkedMarkdown(
          ctx,
          explanation || "No inbox candidate matched that selector."
        );
        return;
      }

      if (action === "confirm") {
        const result = await memoryService.applyPromotion(
          workdir,
          argument || ""
        );
        if (!result.ok) {
          await sendChunkedMarkdown(
            ctx,
            result.reason === "duplicate"
              ? "A matching durable memory entry already exists. Nothing was written."
              : "Inbox promotion could not be completed."
          );
          return;
        }
        await sendChunkedMarkdown(
          ctx,
          result.skillPromotion
            ? [
                result.destination === "global_skill"
                  ? "Memory promoted and skill created globally with repo mirror."
                  : "Memory promoted and project skill created.",
                `kind: ${result.entry?.kind}`,
                `title: ${result.entry?.title}`,
                `skill: ${result.skillPromotion.draft.name}`
              ].join("\n")
            : `Memory promoted.\nkind: ${result.entry?.kind}\ntitle: ${result.entry?.title}`
        );
        return;
      }

      if (action === "cancel") {
        const cancelled = await memoryService.cancelProposal(
          workdir,
          argument || ""
        );
        await sendChunkedMarkdown(
          ctx,
          cancelled
            ? "Inbox proposal cancelled."
            : "No inbox proposal matched that selector."
        );
        return;
      }
    }

    if (data.startsWith("prompts:")) {
      const payload = data.replace("prompts:", "");
      const [action, rawArgument] = payload.split(":", 2);
      const argument = normalizePromptSelector(rawArgument || "");
      const workdir = ptyManager.getStatus(ctx.chat.id).workdir;
      const contract = await skills.project_status.inspect({
        text: "",
        chatId: ctx.chat.id,
        workdir,
        locale,
        variant: "prompts"
      });
      const presets = buildProjectPromptPresets(
        contract,
        await promptLibraryService.listPrompts(workdir)
      );

      await ctx.answerCbQuery(t(locale, "callbackRefreshed"));

      if (action === "show") {
        const rendered = renderPromptLibrary(presets);
        await applySkillResult(
          ctx,
          {
            text: rendered.text,
            parseMode: "markdown",
            buttons: rendered.buttons
          },
          locale,
          ptyManager,
          audioSummaryManager
        );
        return;
      }

      if (action === "run") {
        const selected = resolveProjectPromptPreset(argument, presets);
        if (!selected) {
          await sendChunkedMarkdown(
            ctx,
            "Nao encontrei esse prompt. Use /prompts para recarregar a biblioteca."
          );
          return;
        }
        await executeActionPrompt(
          ctx,
          locale,
          selected.prompt,
          selected.intent
        );
        return;
      }

      if (action === "remove") {
        if (!argument.startsWith("custom:")) {
          await sendChunkedMarkdown(
            ctx,
            "So prompts custom podem ser removidos."
          );
          return;
        }
        const removed = await promptLibraryService.removePrompt(
          workdir,
          argument.replace(/^custom:/, "")
        );
        await sendChunkedMarkdown(
          ctx,
          removed ? `Prompt removido: ${removed.label}` : "Nao encontrei esse prompt custom."
        );
        return;
      }
    }

    if (data.startsWith("project_status:")) {
      const payload = data.replace("project_status:", "") || "default";
      const [action, firstArg] = payload.split(":", 2);
      const variant =
        action === "audio" || action === "meeting" || action === "continue"
          ? firstArg || "default"
          : payload;
      const workdir = ptyManager.getStatus(ctx.chat.id).workdir;

      await ctx.answerCbQuery(
        action === "audio"
          ? t(locale, "audioSummaryGenerating")
          : t(locale, "callbackRefreshed")
      );

      try {
        if (action === "continue") {
          const contract = await skills.project_status.inspect({
            text: "",
            chatId: ctx.chat.id,
            workdir,
            locale,
            variant
          });

          if (!hasPlannedSprint(contract)) {
            await sendChunkedMarkdown(
              ctx,
              "Nao encontrei um proximo sprint programado neste contrato. Se quiser estruturar o que vem agora, use /plan descrevendo o objetivo do proximo bloco."
            );
            return;
          }

          await executeActionPrompt(
            ctx,
            locale,
            buildProjectContinuePrompt(contract),
            "continue"
          );
          return;
        }

        if (action === "prompt") {
          const contract = await skills.project_status.inspect({
            text: "",
            chatId: ctx.chat.id,
            workdir,
            locale,
            variant: "prompts"
          });
          const selectedPreset = resolveProjectPromptPreset(
            firstArg || "",
            buildProjectPromptPresets(
              contract,
              await promptLibraryService.listPrompts(workdir)
            )
          );

          if (!selectedPreset) {
            await sendChunkedMarkdown(
              ctx,
              "Nao encontrei esse prompt pronto no contrato atual. Use /project prompts para recarregar a colecao."
            );
            return;
          }

          await executeActionPrompt(
            ctx,
            locale,
            selectedPreset.prompt,
            selectedPreset.intent
          );
          return;
        }

        if (action === "command") {
          const contract = await skills.project_status.inspect({
            text: "",
            chatId: ctx.chat.id,
            workdir,
            locale,
            variant: "commands"
          });
          const commandIndex = Number(firstArg);
          const selectedCommand =
            Number.isInteger(commandIndex) && commandIndex >= 0
              ? contract.suggestedCommands[commandIndex]
              : undefined;

          if (!selectedCommand) {
            await sendChunkedMarkdown(
              ctx,
              "Nao encontrei esse comando sugerido no contrato atual. Se quiser estruturar algo novo, use /plan."
            );
            return;
          }

          await executeActionPrompt(
            ctx,
            locale,
            buildProjectCommandPrompt(selectedCommand),
            "implementation"
          );
          return;
        }

        if (action === "plan") {
          await sendChunkedMarkdown(
            ctx,
            "Nao encontrei um comando canonico pronto aqui. Se quiser abrir o proximo bloco com seguranca, use /plan descrevendo o objetivo e eu estruturo o sprint."
          );
          return;
        }

        const result = await skills.project_status.execute({
          text: "",
          chatId: ctx.chat.id,
          workdir,
          locale,
          variant
        });

        if (action === "audio") {
          if (!audioSummaryManager?.isEnabled()) {
            await sendChunkedMarkdown(ctx, t(locale, "audioSummaryUnavailable"));
            return;
          }

          const summarySent = await audioSummaryManager.sendSummaryForChat(
            ctx.chat.id,
            typeof result === "string" ? result : result.text || ""
          );
          if (!summarySent) {
            await sendChunkedMarkdown(ctx, t(locale, "audioSummaryUnavailable"));
          }
          return;
        }

        if (action === "meeting") {
          const sourceText = typeof result === "string" ? result : result.text || "";
          const prompt = buildProjectStatusMeetingPrompt(variant, sourceText);
          await executeActionPrompt(ctx, locale, prompt, "planning");
          return;
        }

        await applySkillResult(
          ctx,
          result,
          locale,
          ptyManager,
          audioSummaryManager
        );
      } catch (error) {
        await sendChunkedMarkdown(
          ctx,
          t(locale, "processingFailed", { error: toErrorMessage(error) })
        );
      }
      return;
    }

    if (data.startsWith("audio:summary:")) {
      if (!audioSummaryManager?.isEnabled()) {
        await ctx.answerCbQuery(t(locale, "audioSummaryUnavailable"));
        return;
      }

      try {
        const ok = await audioSummaryManager.handleCallback(
          ctx,
          data.replace("audio:summary:", ""),
          locale
        );
        if (!ok) {
          await sendChunkedMarkdown(ctx, t(locale, "audioSummaryExpired"));
        }
      } catch (error) {
        await sendChunkedMarkdown(
          ctx,
          t(locale, "audioSummaryFailed", {
            error: toErrorMessage(error)
          })
        );
      }
      return;
    }

    if (data.startsWith("final_action:")) {
      const [, action, requestId] = data.split(":", 3);
      const record = audioSummaryManager?.resolveRequest(ctx.chat.id, requestId);

      if (!record) {
        await ctx.answerCbQuery(t(locale, "audioSummaryExpired"));
        return;
      }

      await ctx.answerCbQuery(t(locale, "callbackRefreshed"));

      if (record.workdir) {
        const currentStatus = ptyManager.getStatus(ctx.chat.id);
        if (currentStatus.workdir !== record.workdir) {
          try {
            ptyManager.switchWorkdir(ctx.chat.id, record.workdir);
          } catch {
            // Fall through on the current project if the original workdir is no longer available.
          }
        }
      }

      if (action === "plan") {
        await executeActionPrompt(
          ctx,
          locale,
          buildFinalResponsePlanPrompt(record.text),
          "planning"
        );
        return;
      }

      if (action === "continue") {
        await executeActionPrompt(
          ctx,
          locale,
          buildFinalResponseContinuePrompt(record.text),
          "continue"
        );
        return;
      }

      if (action === "meeting") {
        await executeActionPrompt(
          ctx,
          locale,
          buildFinalResponseMeetingPrompt(record.text),
          "planning"
        );
        return;
      }

      return;
    }

    if (!data.startsWith("gh:test_status:")) return;

    const jobId = data.replace("gh:test_status:", "");
    const result = await skills.github.getTestStatus(jobId, locale);
    await ctx.answerCbQuery(t(locale, "callbackRefreshed"));

    if (!result) {
      await sendChunkedMarkdown(ctx, t(locale, "testJobNotFound", { jobId }));
      return;
    }

    await sendSkillResult(ctx, result, locale, audioSummaryManager);
  });

  bot.on("text", async (ctx: any) => {
    const text = ctx.message.text?.trim() || "";
    const locale = localeOf(ctx.chat.id);
    await handleIncomingText(ctx, text, locale);
  });

  bot.on("voice", handleAudioMessage);
  bot.on("audio", handleAudioMessage);
  bot.on("photo", handleImageMessage);
  bot.on("document", handleImageMessage);
}
