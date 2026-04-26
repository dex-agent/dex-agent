import fs from "node:fs/promises";
import path from "node:path";
import { Markup } from "telegraf";
import {
  buildPlanPrompt,
  extractCommandPayload,
  shouldAttachImmediateContextToPlan,
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
import type { AppConfig, CodexReasoningEffort } from "../config.js";
import type { Scheduler } from "../cron/scheduler.js";
import { toErrorMessage } from "../lib/errors.js";
import type { AudioTranscriber } from "../lib/audioTranscription.js";
import type { AudioSummaryManager } from "../lib/audioSummaryManager.js";
import type { AdminWebServer } from "../lib/adminWebServer.js";
import {
  extractFinalResponseNextSpecialist,
  extractFinalResponseRecommendedStep,
  extractFinalResponseNextStep
} from "../lib/finalActionContext.js";
import {
  downloadTelegramMediaToTemp,
  type TelegramMediaSource
} from "../lib/telegramMedia.js";
import type {
  OperationalContinuationState,
  PtyManager,
  SendPromptResult
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
  PromptLibraryService,
  type ProjectPromptIntent
} from "../orchestrator/promptLibraryService.js";
import {
  DashboardAdminService,
  type DashboardAdminSnapshot
} from "../orchestrator/dashboardAdminService.js";
import { HistoryAdminService } from "../orchestrator/historyAdminService.js";
import { PromptAdminService } from "../orchestrator/promptAdminService.js";
import {
  buildProjectPromptPresets,
  type ProjectPromptPreset
} from "../orchestrator/skills/projectStatusSkill.js";

interface SkillResultPayload {
  text?: string;
  testJobId?: string;
  switchToRepo?: string;
  parseMode?: "plain" | "markdown";
  buttons?: Array<Array<{ text: string; callbackData: string }>>;
}

type AdminWebServerLike = Pick<AdminWebServer, "getLink">;

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
  dashboardAdminService?: DashboardAdminService;
  adminWebServer?: AdminWebServerLike;
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
  instance?: AppConfig["instance"];
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
    { labelKey: "buttonMemoryIndex", callbackData: "memory:view:index" },
    { labelKey: "buttonMemoryProject", callbackData: "memory:view:project" }
  ],
  [
    { labelKey: "buttonMemoryActive", callbackData: "memory:view:active" },
    { labelKey: "buttonMemoryHandoff", callbackData: "memory:view:handoff" }
  ]
];

const PROJECT_MEMORY_BUTTON_ROW: LocalizedButtonSpec[] = [
  { labelKey: "buttonMemoryInbox", callbackData: "inbox:show" },
  { labelKey: "buttonMemoryIndex", callbackData: "memory:view:index" },
  { labelKey: "buttonMemoryProject", callbackData: "memory:view:project" },
  { labelKey: "buttonMemoryActive", callbackData: "memory:view:active" },
  { labelKey: "buttonMemoryHandoff", callbackData: "memory:view:handoff" }
];

const ADMIN_DASHBOARD_BUTTON_ROWS: LocalizedButtonSpec[][] = [
  [
    { labelKey: "buttonAdminPrompts", callbackData: "admin:prompts" },
    { labelKey: "buttonAdminHistory", callbackData: "admin:history" },
    { labelKey: "buttonMemoryRefresh", callbackData: "admin:show" }
  ]
];

const REASONING_EFFORT_ALIASES: Record<string, CodexReasoningEffort> = {
  minimal: "minimal",
  minima: "minimal",
  low: "low",
  baixa: "low",
  medium: "medium",
  media: "medium",
  medio: "medium",
  high: "high",
  alta: "high",
  xhigh: "xhigh",
  altissima: "xhigh",
  altissimo: "xhigh"
};

function normalizeCommandToken(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function parseReasoningEffortValue(value: string): CodexReasoningEffort | null {
  return REASONING_EFFORT_ALIASES[normalizeCommandToken(value)] || null;
}

function parseAutopilotResponseCount(value: string): number | null {
  const trimmed = String(value || "").trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

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

function extractRememberShortcut(text: string): string | null {
  const value = String(text || "").trim();
  if (!value) return null;

  const patterns = [
    /^(?:lembra(?:\s+(?:disso|isso))?|guarda(?:\s+(?:disso|isso))?|salva(?:\s+(?:disso|isso))?)\s*[:-]\s*(.+)$/i,
    /^(?:lembra(?:\s+(?:disso|isso))?|guarda(?:\s+(?:disso|isso))?|salva(?:\s+(?:disso|isso))?)\s+como\s+memoria(?:\s+duravel)?\s*[:-]\s*(.+)$/i,
    /^(?:lembra(?:\s+(?:disso|isso))?|guarda(?:\s+(?:disso|isso))?|salva(?:\s+(?:disso|isso))?)\s+como\s+(?:habilidade|skill)(?:\s+(?:de\s+projeto|global))?\s*[:-]\s*(.+)$/i,
    /^grave\s+isso\s+como\s+(?:memoria(?:\s+duravel)?|(?:habilidade|skill)(?:\s+(?:de\s+projeto|global))?)\s*[:-]\s*(.+)$/i
  ];

  for (const pattern of patterns) {
    if (pattern.test(value)) {
      return value;
    }
  }

  return null;
}

function parseRememberCapture(rawRemember: string): {
  text: string;
  kind?:
    | "decision"
    | "rule"
    | "procedure"
    | "exception"
    | "fact"
    | "task_state";
  promptText?: string;
} {
  const trimmed = String(rawRemember || "").trim();
  let rememberText = trimmed;
  let promptText: string | undefined;

  const wrapperPatterns: Array<{
    pattern: RegExp;
    marksSkillIntent?: boolean;
  }> = [
    {
      pattern:
        /^(?:lembra(?:\s+(?:disso|isso))?|guarda(?:\s+(?:disso|isso))?|salva(?:\s+(?:disso|isso))?)\s+como\s+(?:habilidade|skill)(?:\s+(?:de\s+projeto|global))?\s*[:-]\s*(.+)$/i,
      marksSkillIntent: true
    },
    {
      pattern:
        /^grave\s+isso\s+como\s+(?:habilidade|skill)(?:\s+(?:de\s+projeto|global))?\s*[:-]\s*(.+)$/i,
      marksSkillIntent: true
    },
    {
      pattern:
        /^(?:lembra(?:\s+(?:disso|isso))?|guarda(?:\s+(?:disso|isso))?|salva(?:\s+(?:disso|isso))?)\s+como\s+memoria(?:\s+duravel)?\s*[:-]\s*(.+)$/i
    },
    {
      pattern: /^grave\s+isso\s+como\s+memoria(?:\s+duravel)?\s*[:-]\s*(.+)$/i
    },
    {
      pattern:
        /^(?:lembra(?:\s+(?:disso|isso))?|guarda(?:\s+(?:disso|isso))?|salva(?:\s+(?:disso|isso))?)\s*[:-]\s*(.+)$/i
    }
  ];

  for (const wrapper of wrapperPatterns) {
    const match = trimmed.match(wrapper.pattern);
    if (match?.[1]) {
      rememberText = match[1].trim();
      if (wrapper.marksSkillIntent) {
        promptText = trimmed;
      }
      break;
    }
  }

  const skillMatch = rememberText.match(
    /^(?:isso (?:tem que|precisa|deve) virar skill(?:\s+(?:de\s+projeto|global))?|memoriza(?: isso)? como (?:habilidade|skill)(?:\s+(?:de\s+projeto|global))?|promove(?: isso)? para skill(?:\s+(?:de\s+projeto|global))?|vira skill(?:\s+(?:de\s+projeto|global))?)\s*[:-]\s*(.+)$/i
  );
  if (skillMatch?.[1]) {
    rememberText = skillMatch[1].trim();
    promptText = promptText || trimmed;
  }

  const typedMatch = rememberText.match(
    /^(decision|rule|procedure|exception|fact|task_state)\s*[:-]\s*(.+)$/i
  );

  return {
    text: typedMatch?.[2] || rememberText,
    kind: typedMatch?.[1]
      ? (typedMatch[1].toLowerCase() as
          | "decision"
          | "rule"
          | "procedure"
          | "exception"
          | "fact"
          | "task_state")
      : undefined,
    promptText
  };
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
    payload.parseMode === "markdown"
      ? sourceText
      : escapeMarkdownV2(sourceText);
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

function isFixedInstanceMode(
  instance: AppConfig["instance"] | undefined
): instance is AppConfig["instance"] {
  return instance?.contextMode === "instance";
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

function isOperationalNextStepQuestion(text: string): boolean {
  const normalized = normalizeAscii(text)
    .replace(/[?!.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [
    "qual o proximo passo seguro",
    "qual o proximo passo",
    "proximo passo seguro",
    "como seguir daqui",
    "onde paramos",
    "o que faco agora"
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

function extractSuggestedSessionSpecialists(input: string): string | null {
  const normalized = String(input || "")
    .replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, "$1")
    .replace(/[*~]/g, "")
    .replace(/`([^`]+)`/g, "$1");

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(
      /^(?:[-•]\s*)?(?:Sugestao de especialistas da sessao|Sugestao de especialistas para a sessao|sugestao_especialistas_sessao|sugestaoespecialistassessao)\s*:\s*(.+)$/i
    );
    if (match?.[1]) {
      return stripProjectStatusFormatting(match[1]);
    }
  }

  return null;
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
  const specialistLine = buildSuggestedSpecialistsLine(currentText, [
    "$sprinter",
    "$chato",
    "$focado",
    "$estacionamento"
  ]);

  return buildPlanPrompt(
    [
      "Modo planejamento usando $sprinter.",
      "Transforme a conclusao abaixo em planejamento de bloco e sprints detalhados, com checklist separado, prioridades, riscos, riscos contraditorios, definicao de pronto e estacionamento.",
      "Use o formato do $sprinter e entregue o plano pronto para continuar depois, sem deixar o proximo corte implícito.",
      "Se houver contexto suficiente, organize a saida para encaixar no contrato canonico de retomada: Restart protocol now, Suggested commands, Next queue, First steps if resuming now e Progress snapshot.",
      "A retomada deve seguir esta ordem quando os arquivos existirem: INDEX.md raiz -> AGENTS.md -> INDEX.md local relevante -> arquivo alvo -> ACTIVE.md + HANDOFF.md -> .codex/napkin.md -> .agents/sprints/INDEX.md quando houver sprint/bloco -> .agents/ESTACIONAMENTO.md quando houver residuo/reabertura. Use .agents/MEMORY.ndjson como ledger, nao como fonte primaria do proximo passo.",
      "Quando criar ou alterar sprint em repo com .agents/, crie ou atualize .agents/sprints/INDEX.md no Markdown parseavel canonico, completo para o diretorio e com uma linha por entrada.",
      "Nao use MEMORY/ como destino novo de sprint; se houver MEMORY/ legado, trate apenas como fallback de leitura ou legado operacional indexado.",
      "Todo plano deve terminar com Proximo passo e Proximo especialista indicado.",
      ...(specialistLine ? [specialistLine] : []),
      "Se nao houver base suficiente para planejar com seguranca, diga isso claramente e retorne para Pensamento ou mantenha em Planejamento, em vez de fabricar um pseudo-sprint.",
      "",
      "Conclusao atual:",
      stripProjectStatusFormatting(currentText)
    ].join("\n")
  );
}

function buildFinalResponseHandoffPrompt(currentText: string): string {
  const nextSpecialist = extractFinalResponseNextSpecialist(currentText);

  return applyLocalExecutionPreference(
    [
      "Trate este clique como encaminhamento de um unico proximo corte ao Proximo especialista indicado abaixo.",
      "Use $ancora-fluxo como Fernanda do Fluxo no menor preset seguro para seguir para o owner correto.",
      nextSpecialist
        ? `Proximo especialista indicado pelo contexto: ${nextSpecialist}.`
        : "Nao ha especialista explicito no contexto; escolha o menor encaminhamento seguro pelo contrato de fase.",
      "Nao replaneje o bloco, nao abra reuniao e nao avance para outros blocos.",
      "Confirme a fase atual entre Pensamento, Planejamento, Construir, Revisar, Testar e Veredito.",
      "Se houver conflito entre Proximo passo e Proximo especialista indicado, explique objetivamente e retorne para Planejamento.",
      "Use $focado para proteger a prioridade dominante e $estacionamento apenas para residuos fora deste encaminhamento.",
      "Entregue curto:",
      "- Fase atual",
      "- Resultado do encaminhamento",
      "- Proximo passo",
      "- Proximo especialista indicado",
      "- Cooperacao sugerida",
      "- Seguir, segurar ou retornar",
      "- Fallback se precisar voltar",
      "",
      "Conclusao atual:",
      stripProjectStatusFormatting(currentText)
    ].join("\n")
  );
}

function applyLocalExecutionPreference(prompt: string): string {
  return [
    "Preferencia operacional deste bot/projeto:",
    "- para leitura, extracao local, cortes de arquivo e verificacoes compactas, prefira $motor-local",
    "",
    prompt.trim()
  ].join("\n");
}

function buildSuggestedSpecialistsLine(
  currentText: string,
  extras: string[] = []
): string | null {
  const suggestedSpecialists = extractSuggestedSessionSpecialists(currentText);
  const nextSpecialist = extractFinalResponseNextSpecialist(currentText);
  const normalized = Array.from(
    new Set(
      [nextSpecialist, suggestedSpecialists, ...extras]
        .flatMap((value) =>
          String(value || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        )
        .map((item) => item.replace(/^[$`]+|[$`]+$/g, ""))
        .filter(Boolean)
    )
  );

  return normalized.length
    ? `Adicione os especialistas sugeridos para sessao antes de executar: ${normalized.join(", ")}.`
    : null;
}

function buildFinalResponseContinuePrompt(
  currentText: string,
  level: "short" | "medium" | "full" = "short"
): string {
  const specialistLine = buildSuggestedSpecialistsLine(currentText);
  const exactNextStep =
    extractFinalResponseRecommendedStep(currentText) ||
    extractFinalResponseNextStep(currentText);
  const levelLines =
    level === "medium"
      ? [
          "Treat this button click as approval to continue beyond a single micro-step and close the current sprint or current open block implied by the finalized conclusion below.",
          "Work through the implementation, review, test, and honest closeout needed for that one sprint or block without stopping after the first tiny follow-up.",
          "Do not reinterpret this click as approval for all future open sprints, unrelated work, or a new planning loop."
        ]
      : level === "full"
        ? [
            "Treat this button click as approval to conclude the entire current open block implied by the finalized conclusion below.",
            "Close that one block from the current state through implementation, review, test, and honest verdict when those phases apply, without stopping after the first tiny follow-up.",
            "Before advancing, restate the block you are closing and the concrete steps you will perform now. Do not reinterpret this click as approval for future blocks, unrelated work, or a fresh planning branch."
          ]
        : [
            "Treat this button click as approval for exactly one small and safe follow-up execution scoped to the finalized conclusion below.",
            exactNextStep
              ? `Execute exactly this next safe step if it is still valid: ${exactNextStep}`
              : "Execute only the next eligible block or next concrete implementation step already implied by that conclusion in the open project.",
            "Do not reinterpret this click as blanket approval for unrelated work, a new meeting, or a full replan."
          ];

  return applyLocalExecutionPreference(
    [
      ...levelLines,
      "Se o proximo passo seguro nao for execucao e sim revisao ou /plan, diga isso objetivamente e pare.",
      ...(specialistLine ? [specialistLine] : []),
      "",
      "Approved context:",
      stripProjectStatusFormatting(currentText)
    ].join("\n")
  );
}

export function buildFinalResponseAutopilotPrompt(currentText: string): string {
  const specialistLine = buildSuggestedSpecialistsLine(currentText, [
    "$kant",
    "$chato",
    "$focado",
    "$garimpeiro",
    "$estacionamento",
    "$bruno-brain"
  ]);

  return applyLocalExecutionPreference(
    [
      "Treat this button click as approval for an autopilot execution run on the current line of work until all currently open planned sprints or open blocks in scope reach 100 percent or a real blocker requires explicit user input.",
      "Ative $ancora-fluxo e use os presets canonicos pensamento, planejamento, construir, revisar, testar e veredito com pre-flight, post-flight e return-flight quando necessario.",
      "Coordene explicitamente os owners do fluxo neste formato: Rita Reuniao e Quele Questiona em Pensamento, Paula Planeja em Planejamento, Ivo Implementa em Construir, Renata Review em Revisar, Tereza Testa em Testar e Vera Veredito em Veredito.",
      "Use o contrato da ancora-fluxo para decidir se deve seguir para, segurar em, ou retornar para uma fase anterior. Se houver duvida, escolha o menor preset seguro em vez de avancar artificialmente.",
      "Use reunioes rapidas e concisas de especialistas apenas quando elas ajudarem a destravar uma decisao, um risco, uma revisao, um teste ou um fechamento real do bloco atual.",
      "Cada fase, especialista ou reuniao deve indicar explicitamente Proximo passo, Proximo especialista indicado e, quando fizer sentido, Cooperacao sugerida.",
      "Se o trabalho travar por escopo aberto, falta de opcoes ou falta de caminho claro, faca uma reuniao curta de quebra-gelo com $bruno-brain para gerar alternativas e depois encaminhe o fluxo de volta para o especialista correto.",
      ...(specialistLine ? [specialistLine] : []),
      "Use $focado para proteger a prioridade dominante, $kant e $chato como lentes transversais de simplicidade e pressao adversarial, $garimpeiro para separar aprendizado forte de ruido no fechamento, e $estacionamento para residuos fora do foco imediato.",
      "Nao invente escopo novo fora do que ja esta aberto ou claramente implicado pelo contexto aprovado. Feche um bloco por vez com progresso real, objetivo atual, proximo passo, fallback e sprints restantes quando existirem.",
      "Antes de executar, recupere rapidamente o estado vivo nesta ordem quando os arquivos existirem: INDEX.md raiz -> AGENTS.md -> INDEX.md local relevante -> arquivo alvo -> ACTIVE.md + HANDOFF.md -> .codex/napkin.md -> .agents/sprints/INDEX.md quando houver sprint/bloco -> .agents/ESTACIONAMENTO.md quando houver residuo/reabertura. Use .agents/MEMORY.ndjson como ledger, nao como fonte primaria do proximo passo. So use busca textual como fallback.",
      "Toda resposta do autopilot deve terminar com este mini-card operacional, mesmo quando a decisao for parar:",
      "- Resultado real",
      "- Decisao do piloto: seguir | parar | retornar",
      "- Por que segui ou parei",
      "- Ponto cego",
      "- Dica de ouro",
      "- Opcoes seguras",
      "- Proximo passo recomendado",
      "- Proximo especialista indicado",
      "Nao deixe `Ponto cego`, `Dica de ouro` ou `Opcoes seguras` vazios; se nada material apareceu, diga isso honestamente em uma frase curta.",
      "Ao concluir cada resposta, deixe um checkpoint retomavel com: progresso real, proximo passo seguro, especialista indicado, fallback e se ainda ha trabalho aberto para o piloto seguir.",
      "Se a execucao ficar maior que o contexto seguro, pare com um checkpoint claro e instrua usar /autopilot resume depois do restart, em vez de improvisar continuidade invisivel.",
      "Se houver ambiguidade material, nao avance no automatico: convoque a menor reuniao necessaria, registre a decisao e retorne para o owner correto.",
      "",
      "Approved context:",
      stripProjectStatusFormatting(currentText)
    ].join("\n")
  );
}

function buildFinalResponseMeetingPrompt(currentText: string): string {
  return applyLocalExecutionPreference(
    [
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
    ].join("\n")
  );
}

type FinalActionRoute =
  | "plan"
  | "handoff"
  | "continue_short"
  | "continue_medium"
  | "continue_full"
  | "autopilot"
  | "autopilot_arm"
  | "review"
  | "organize"
  | "meeting";

function normalizeFinalActionRoute(action: string): FinalActionRoute {
  switch (action) {
    case "c1":
    case "continue":
    case "execute":
    case "continue_short":
      return "continue_short";
    case "pl":
    case "plan":
      return "plan";
    case "sp":
    case "handoff":
    case "specialist":
    case "encaminhar":
      return "handoff";
    case "c2":
    case "continue_medium":
      return "continue_medium";
    case "c3":
    case "continue_full":
      return "continue_full";
    case "ap":
    case "autopilot":
      return "autopilot";
    case "ax":
    case "autopilot_arm":
      return "autopilot_arm";
    case "rv":
    case "review":
      return "review";
    case "mt":
    case "meeting":
      return "meeting";
    case "ib":
    case "organize":
      return "organize";
    default:
      return "plan";
  }
}

function parseIsoTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compactStatusPreview(
  value: string | null | undefined,
  max = 120
): string {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function formatRelativeTimestamp(
  locale: Locale,
  value: string | null | undefined
): string | null {
  const timestamp = parseIsoTimestamp(value);
  if (timestamp === null) {
    return null;
  }

  const deltaSeconds = Math.round((timestamp - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  const formatter = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto"
  });

  if (absoluteSeconds < 60) {
    return formatter.format(deltaSeconds, "second");
  }

  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (Math.abs(deltaMinutes) < 60) {
    return formatter.format(deltaMinutes, "minute");
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return formatter.format(deltaHours, "hour");
  }

  const deltaDays = Math.round(deltaHours / 24);
  return formatter.format(deltaDays, "day");
}

type OperationalPosture =
  | "working"
  | "pending_replay"
  | "queued"
  | "awaiting_closeout"
  | "recent_finish"
  | "prolonged_silence"
  | "idle";

function deriveOperationalPosture(
  state: OperationalContinuationState
): OperationalPosture {
  if (state.active) {
    return "working";
  }

  if (state.pendingPromptText) {
    return "pending_replay";
  }

  if (state.queuedItems.length) {
    return "queued";
  }

  const lastPromptAt = parseIsoTimestamp(state.lastPromptAt);
  const lastFinalizedAt = parseIsoTimestamp(state.lastFinalizedAt);

  if (
    lastPromptAt !== null &&
    (lastFinalizedAt === null || lastPromptAt > lastFinalizedAt)
  ) {
    return "awaiting_closeout";
  }

  if (lastFinalizedAt !== null) {
    const ageMs = Date.now() - lastFinalizedAt;
    if (ageMs <= 15 * 60 * 1000) {
      return "recent_finish";
    }
    if (ageMs >= 6 * 60 * 60 * 1000) {
      return "prolonged_silence";
    }
  }

  return "idle";
}

function buildObservabilityLines(
  locale: Locale,
  state: OperationalContinuationState,
  options: {
    includeHeader?: boolean;
    includeLastResponse?: boolean;
  } = {}
): string[] {
  const { includeHeader = true, includeLastResponse = true } = options;
  const lines: string[] = [];
  const postureKey = {
    working: "statusPostureWorking",
    pending_replay: "statusPosturePendingReplay",
    queued: "statusPostureQueued",
    awaiting_closeout: "statusPostureAwaitingCloseout",
    recent_finish: "statusPostureRecentFinish",
    prolonged_silence: "statusPostureProlongedSilence",
    idle: "statusPostureIdle"
  } as const;
  const posture = t(locale, postureKey[deriveOperationalPosture(state)]);

  if (includeHeader) {
    lines.push("", t(locale, "statusObservabilityHeader"));
  }

  lines.push(t(locale, "statusOperationalPosture", { value: posture }));

  if (state.pendingPromptText) {
    lines.push(
      t(locale, "statusPendingPromptSignal", {
        text: compactStatusPreview(state.pendingPromptText)
      })
    );
  }

  if (state.queuedItems.length) {
    lines.push(
      t(locale, "statusQueueSignal", {
        count: state.queuedItems.length,
        next: compactStatusPreview(state.queuedItems[0]?.text || "")
      })
    );
  }

  const lastPromptAge = formatRelativeTimestamp(locale, state.lastPromptAt);
  if (lastPromptAge) {
    lines.push(t(locale, "statusLastPromptSignal", { value: lastPromptAge }));
  }

  const lastFinalizedAge = formatRelativeTimestamp(
    locale,
    state.lastFinalizedAt
  );
  if (lastFinalizedAge) {
    lines.push(
      t(locale, "statusLastFinalizedSignal", { value: lastFinalizedAge })
    );
  }

  if (includeLastResponse && state.lastFinalResponseText) {
    lines.push(
      t(locale, "statusLastFinalResponseSignal", {
        text: compactStatusPreview(state.lastFinalResponseText)
      })
    );
  }

  return lines;
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
    lines.push(
      `Proximo bloco elegivel: ${contract.currentStatus.nextEligibleBlock}.`
    );
  }

  if (contract.currentStatus.executionFormal) {
    lines.push(
      `Estado formal atual: ${contract.currentStatus.executionFormal}.`
    );
  }

  if (contract.nextQueue.length) {
    lines.push("", "Fila canonica:");
    lines.push(
      ...contract.nextQueue.map((line) => `- ${line.replace(/^- /, "").trim()}`)
    );
  }

  if (contract.nextStepSummary.length) {
    lines.push("", "Passos imediatos registrados:");
    lines.push(
      ...contract.nextStepSummary.map(
        (line) => `- ${line.replace(/^- /, "").trim()}`
      )
    );
  }

  if (contract.suggestedCommands.length) {
    lines.push("", "Comandos sugeridos do contrato:");
    lines.push(
      ...contract.suggestedCommands.map(
        (line) => `- ${line.replace(/^- /, "").trim()}`
      )
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
  return applyLocalExecutionPreference(
    [
      "Use o comando sugerido abaixo como atalho operacional do projeto atual.",
      `Comando/protocolo selecionado: ${cleanedCommand}`,
      "",
      "Se isso for um comando de leitura, execute a leitura e resuma o resultado.",
      "Se isso for um comando operacional, use-o como guia para continuar o trabalho agora.",
      "Se ele nao estiver disponivel ou nao fizer sentido neste contexto, explique objetivamente sem inventar."
    ].join("\n")
  );
}

function inferMemoryIntent(
  prompt: string,
  fallback: MemoryIntent = "auto"
): MemoryIntent {
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

  if (
    /\b(plan|sprint|next step|roadmap|refactor|implement|debug|fix|review)\b/i.test(
      normalized
    )
  ) {
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
    `- workflow phase: ${state.workflowPhase}`
  ];

  const lastPrompt = compactContinuationText(state.lastPromptText);
  const pending = compactContinuationText(state.pendingPromptText);
  const nextQueued = compactContinuationText(state.queuedItems[0]?.text, 220);
  const liveCut = pending || nextQueued || lastPrompt;

  if (liveCut) {
    lines.push(`- live cut: ${liveCut}`);
  }

  lines.push(
    "",
    "Use this operational state as the primary source of truth for requests to continue or resume work in this chat.",
    "Do not treat prior assistant narration as verified live state.",
    "If it conflicts with durable project memory, prefer the operational continuation state and treat durable memory as fallback that may be stale."
  );

  if (packet) {
    lines.push("", "Durable memoria-viva fallback only if needed:");
    if (packet.currentObjective) {
      lines.push(`- current objective: ${packet.currentObjective}`);
    }
    if (packet.nextEligibleBlock) {
      lines.push(`- next eligible block: ${packet.nextEligibleBlock}`);
    }
    for (const note of packet.tacticalNotes.slice(0, 1)) {
      lines.push(`- tactical note: ${note.replace(/^- /, "").trim()}`);
    }
  }

  lines.push("", "User request:", originalPrompt.trim());
  return lines.join("\n");
}

function formatMemorySourcesForReply(
  workdir: string,
  sources: string[]
): string {
  return sources
    .map(
      (source) =>
        path.relative(workdir, source).replace(/\\/g, "/") ||
        path.basename(source)
    )
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

function compactMemoryUiText(
  value: string | null | undefined,
  max = 96
): string {
  const normalized = String(value || "")
    .replace(/\[([^\]]+)\]\(<\/abs\/path\/[^>]+>\)/gi, "$1")
    .replace(/\[([^\]]+)\]\(\/abs\/path\/[^)]+\)/gi, "$1")
    .replace(/\[([^\]]+)\]\(([A-Za-z]:[^\s)]+)\)/gi, "$1")
    .replace(/\/abs\/path\/[^\s)]+/gi, (match) => {
      const raw = match.replace(/^\/abs\/path\//i, "");
      const [token, line] = raw.split(/:(\d+)$/).filter(Boolean);
      const base = path.basename(token || raw);
      return line ? `${base}:${line}` : base;
    })
    .replace(/[A-Za-z]:[\\/][^\s)]+/g, (match) => {
      const normalizedPath = match.replace(/\\/g, "/");
      const [token, line] = normalizedPath.split(/:(\d+)$/).filter(Boolean);
      const base = path.posix.basename(token || normalizedPath);
      return line ? `${base}:${line}` : base;
    })
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function humanizeMemoryKind(
  locale: Locale,
  kind: string | null | undefined
): string {
  switch (kind) {
    case "skill_candidate":
      return t(locale, "memoryKindSkillCandidate");
    case "decision":
      return t(locale, "memoryKindDecision");
    case "rule":
      return t(locale, "memoryKindRule");
    case "procedure":
      return t(locale, "memoryKindProcedure");
    case "exception":
      return t(locale, "memoryKindException");
    case "fact":
      return t(locale, "memoryKindFact");
    case "task_state":
      return t(locale, "memoryKindTaskState");
    default:
      return String(kind || t(locale, "memoryNotRecorded"));
  }
}

function humanizeMemoryDestination(
  locale: Locale,
  destination: string | null | undefined
): string {
  switch (destination) {
    case "memory":
      return t(locale, "memoryDestinationMemory");
    case "project_skill":
      return t(locale, "memoryDestinationProjectSkill");
    case "global_skill":
      return t(locale, "memoryDestinationGlobalSkill");
    default:
      return t(locale, "memoryDestinationReview");
  }
}

function humanizeMemoryStage(
  locale: Locale,
  stage: string | null | undefined
): string {
  switch (stage) {
    case "recent_context":
      return t(locale, "memoryStageRecentContext");
    case "durable_memory":
      return t(locale, "memoryStageDurableMemory");
    case "skill_candidate":
      return t(locale, "memoryStageSkillCandidate");
    case "real_skill":
      return t(locale, "memoryStageRealSkill");
    default:
      return t(locale, "memoryNotRecorded");
  }
}

function humanizeCandidateReason(
  locale: Locale,
  reason: string | null | undefined
): string {
  const normalized = String(reason || "").trim();
  if (!normalized) {
    return t(locale, "memoryReasonDefault");
  }

  const replacements: Array<[RegExp, string]> = [
    [
      /Prompt explicitly asks to preserve the workflow as a reusable skill\./gi,
      t(locale, "memoryReasonExplicitSkillRequest")
    ],
    [
      /Operator explicitly asked for reusable skill promotion\./gi,
      t(locale, "memoryReasonExplicitSkillRequest")
    ],
    [
      /Multiple structural signals suggest this workflow should become a reusable skill\./gi,
      t(locale, "memoryReasonStrongSignals")
    ],
    [
      /A similar workflow already appeared before\./gi,
      t(locale, "memoryReasonWorkflowRepeated")
    ],
    [
      /The workflow contains three or more explicit steps\./gi,
      t(locale, "memoryReasonThreeSteps")
    ],
    [
      /The workflow references commands, files, scripts, or operational contracts\./gi,
      t(locale, "memoryReasonOperationalReferences")
    ],
    [
      /The destination is clearly project-specific\./gi,
      t(locale, "memoryReasonProjectSpecific")
    ],
    [
      /The destination spans multiple projects or a reusable personal workflow\./gi,
      t(locale, "memoryReasonGlobalScope")
    ],
    [
      /The signal is strong and clear enough for automatic skill promotion\./gi,
      t(locale, "memoryReasonAutoPromoteStrong")
    ],
    [
      /The workflow looks reusable, but it still needs manual review\./gi,
      t(locale, "memoryReasonNeedsManualReview")
    ],
    [
      /The workflow should stay in memory until the reuse signal is stronger\./gi,
      t(locale, "memoryReasonReuseSignalWeak")
    ],
    [
      /Looks like a procedure or repeatable command flow\./gi,
      t(locale, "memoryReasonProcedureFlow")
    ],
    [
      /Contains decision language\./gi,
      t(locale, "memoryReasonDecisionLanguage")
    ],
    [
      /Contains stable rule language\./gi,
      t(locale, "memoryReasonRuleLanguage")
    ],
    [
      /Describes an exception or guardrail\./gi,
      t(locale, "memoryReasonExceptionGuardrail")
    ],
    [/Describes active project state\./gi, t(locale, "memoryReasonTaskState")],
    [
      /Useful fact with reusable project context\./gi,
      t(locale, "memoryReasonReusableFact")
    ],
    [
      /Explicitly classified by caller\./gi,
      t(locale, "memoryReasonExplicitClassification")
    ],
    [
      /Candidate was captured from runtime evidence\./gi,
      t(locale, "memoryReasonRuntimeEvidence")
    ],
    [
      /Text is too short to become durable memory\./gi,
      t(locale, "memoryReasonTextTooShort")
    ]
  ];

  let text = normalized;
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  return compactMemoryUiText(text, 180);
}

function getMemoryCandidateDisplayTitle(
  locale: Locale,
  candidate: MemoryCandidate
): string {
  const title =
    candidate.skillDraft?.title ||
    candidate.title ||
    candidate.summary ||
    t(locale, "memoryUntitledCandidate");

  if (
    /^Use (este|this) prompt de retomada em uma nova conversa/i.test(title) ||
    /^```text Projeto:/i.test(title)
  ) {
    return t(locale, "memoryResumePromptTitle");
  }

  return compactMemoryUiText(title, 88);
}

function formatCandidateListItem(
  locale: Locale,
  candidate: MemoryCandidate,
  index: number
): string {
  const stage =
    candidate.stage ||
    (candidate.destination && candidate.destination !== "memory"
      ? "skill_candidate"
      : candidate.baseKind === "task_state"
        ? "recent_context"
        : "durable_memory");
  const lines = [
    `${index + 1}. *${escapeMarkdownV2(getMemoryCandidateDisplayTitle(locale, candidate))}*`,
    `   ${t(locale, "memoryTypeLabel")}: ${escapeMarkdownV2(humanizeMemoryKind(locale, candidate.baseKind))}`,
    `   ${t(locale, "memoryStageLabel")}: ${escapeMarkdownV2(humanizeMemoryStage(locale, stage))}`
  ];

  if (stage === "skill_candidate") {
    lines.push(
      `   ${t(locale, "memoryDestinationLabel")}: ${escapeMarkdownV2(humanizeMemoryDestination(locale, candidate.destination))}`
    );
  }

  lines.push(
    `   ${t(locale, "memorySummaryLabel")}: ${escapeMarkdownV2(compactMemoryUiText(candidate.summary, 120) || t(locale, "memoryNotRecorded"))}`
  );

  return lines.join("\n");
}

function getMemoryProposalDisplayTitle(
  locale: Locale,
  proposal: MemoryWriteProposal
): string {
  const title =
    proposal.skillDraft?.title ||
    proposal.entry.title ||
    proposal.entry.summary ||
    t(locale, "memoryUntitledCandidate");

  if (
    /^Use (este|this) prompt de retomada em uma nova conversa/i.test(title) ||
    /^```text Projeto:/i.test(title)
  ) {
    return t(locale, "memoryResumePromptTitle");
  }

  return compactMemoryUiText(title, 88);
}

function renderInboxOverview(
  locale: Locale,
  candidates: MemoryCandidate[],
  proposals: MemoryWriteProposal[]
): MemoryReplyPayload {
  const recentContextCount = candidates.filter(
    (candidate) =>
      (candidate.stage ||
        (candidate.baseKind === "task_state"
          ? "recent_context"
          : candidate.destination && candidate.destination !== "memory"
            ? "skill_candidate"
            : "durable_memory")) === "recent_context"
  ).length;
  const durableCount = candidates.filter(
    (candidate) =>
      (candidate.stage ||
        (candidate.baseKind === "task_state"
          ? "recent_context"
          : candidate.destination && candidate.destination !== "memory"
            ? "skill_candidate"
            : "durable_memory")) === "durable_memory"
  ).length;
  const skillCandidateCount = candidates.filter(
    (candidate) =>
      (candidate.stage ||
        (candidate.baseKind === "task_state"
          ? "recent_context"
          : candidate.destination && candidate.destination !== "memory"
            ? "skill_candidate"
            : "durable_memory")) === "skill_candidate"
  ).length;
  const text = [
    `*${t(locale, "memoryInboxTitle")}*`,
    "",
    `${t(locale, "memoryCandidatesCountLabel")}: ${candidates.length}`,
    `${t(locale, "memoryProposalsCountLabel")}: ${proposals.length}`,
    `${t(locale, "memoryRecentContextCountLabel")}: ${recentContextCount}`,
    `${t(locale, "memoryDurableCountLabel")}: ${durableCount}`,
    `${t(locale, "memorySkillCandidateCountLabel")}: ${skillCandidateCount}`,
    "",
    ...(candidates.length
      ? [
          `*${t(locale, "memoryRecentCandidatesTitle")}*`,
          ...candidates
            .slice(0, 5)
            .map(
              (candidate, index) =>
                `${index + 1}. *${escapeMarkdownV2(getMemoryCandidateDisplayTitle(locale, candidate))}*`
            ),
          ""
        ]
      : []),
    ...(proposals.length
      ? [
          `*${t(locale, "memoryRecentProposalsTitle")}*`,
          ...proposals
            .slice(0, 5)
            .map(
              (proposal, index) =>
                `${index + 1}. *${escapeMarkdownV2(getMemoryProposalDisplayTitle(locale, proposal))}*`
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
      ...candidates
        .slice(0, 6)
        .map((candidate, index) =>
          formatCandidateListItem(locale, candidate, index)
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
      ...candidates
        .slice(0, 6)
        .map((candidate, index) =>
          formatCandidateListItem(locale, candidate, index)
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
      ...proposals
        .slice(0, 6)
        .map(
          (proposal, index) =>
            `${index + 1}. *${escapeMarkdownV2(getMemoryProposalDisplayTitle(locale, proposal))}*\n   ${t(locale, "memoryTypeLabel")}: ${escapeMarkdownV2(humanizeMemoryKind(locale, proposal.entry.kind))}\n   ${t(locale, "memoryStageLabel")}: ${escapeMarkdownV2(humanizeMemoryStage(locale, proposal.entry.stage || (proposal.destination !== "memory" ? "real_skill" : "durable_memory")))}${proposal.destination !== "memory" ? `\n   ${t(locale, "memoryDestinationLabel")}: ${escapeMarkdownV2(humanizeMemoryDestination(locale, proposal.destination))}` : ""}\n   ${t(locale, "memorySummaryLabel")}: ${escapeMarkdownV2(compactMemoryUiText(proposal.entry.summary, 120) || t(locale, "memoryNotRecorded"))}`
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
      `${t(locale, "memoryKindLabel")}: ${escapeMarkdownV2(humanizeMemoryKind(locale, proposal.entry.kind))}`,
      `${t(locale, "memoryStageLabel")}: ${escapeMarkdownV2(humanizeMemoryStage(locale, proposal.entry.stage || (proposal.destination !== "memory" ? "real_skill" : "durable_memory")))}`,
      `${t(locale, "memoryDestinationLabel")}: ${escapeMarkdownV2(humanizeMemoryDestination(locale, proposal.destination))}`,
      `${t(locale, "memoryTitleLabel")}: ${escapeMarkdownV2(getMemoryProposalDisplayTitle(locale, proposal))}`,
      `${t(locale, "memorySummaryLabel")}: ${escapeMarkdownV2(compactMemoryUiText(proposal.entry.summary, 220) || t(locale, "memoryNotRecorded"))}`,
      `${t(locale, "memoryEvidenceLabel")}: ${escapeMarkdownV2(compactMemoryUiText(proposal.entry.evidence.value, 140) || t(locale, "memoryNotRecorded"))}`,
      "",
      `${t(locale, "memoryWhyLabel")}: ${escapeMarkdownV2(humanizeCandidateReason(locale, proposal.reason))}`
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
      `*${t(locale, "memoryPromotionProposalTitle")}*`,
      "",
      `${t(locale, "memoryKindLabel")}: ${escapeMarkdownV2(humanizeMemoryKind(locale, proposal.entry.kind))}`,
      `${t(locale, "memoryStageLabel")}: ${escapeMarkdownV2(humanizeMemoryStage(locale, proposal.entry.stage || (proposal.destination !== "memory" ? "real_skill" : "durable_memory")))}`,
      `${t(locale, "memoryDestinationLabel")}: ${escapeMarkdownV2(humanizeMemoryDestination(locale, proposal.destination))}`,
      `${t(locale, "memoryTitleLabel")}: ${escapeMarkdownV2(getMemoryProposalDisplayTitle(locale, proposal))}`,
      `${t(locale, "memorySummaryLabel")}: ${escapeMarkdownV2(compactMemoryUiText(proposal.entry.summary, 220) || t(locale, "memoryNotRecorded"))}`,
      `${t(locale, "memoryEvidenceLabel")}: ${escapeMarkdownV2(compactMemoryUiText(proposal.entry.evidence.value, 140) || t(locale, "memoryNotRecorded"))}`,
      "",
      `${t(locale, "memoryWhyLabel")}: ${escapeMarkdownV2(humanizeCandidateReason(locale, proposal.reason))}`
    ].join("\n"),
    buttons: buildInboxProposalButtons(locale, proposal.id)
  };
}

function renderCandidateExplanation(
  locale: Locale,
  candidate: MemoryCandidate
): string {
  const stage =
    candidate.stage ||
    (candidate.destination && candidate.destination !== "memory"
      ? "skill_candidate"
      : candidate.baseKind === "task_state"
        ? "recent_context"
        : "durable_memory");
  const lines = [
    `*${t(locale, "memoryCandidateDetailTitle")}*`,
    "",
    `${t(locale, "memoryKindLabel")}: ${escapeMarkdownV2(humanizeMemoryKind(locale, candidate.baseKind))}`,
    `${t(locale, "memoryStageLabel")}: ${escapeMarkdownV2(humanizeMemoryStage(locale, stage))}`,
    `${t(locale, "memoryTitleLabel")}: ${escapeMarkdownV2(getMemoryCandidateDisplayTitle(locale, candidate))}`,
    `${t(locale, "memorySummaryLabel")}: ${escapeMarkdownV2(compactMemoryUiText(candidate.summary, 220) || t(locale, "memoryNotRecorded"))}`,
    `${t(locale, "memoryEvidenceLabel")}: ${escapeMarkdownV2(compactMemoryUiText(candidate.evidence.value, 140) || t(locale, "memoryNotRecorded"))}`
  ];

  if (stage === "skill_candidate") {
    lines.push(
      `${t(locale, "memoryDestinationLabel")}: ${escapeMarkdownV2(humanizeMemoryDestination(locale, candidate.destination))}`,
      `${t(locale, "memoryAutoPromoteLabel")}: ${escapeMarkdownV2(candidate.autoPromote ? t(locale, "memoryYes") : t(locale, "memoryNo"))}`
    );
  }

  lines.push(
    "",
    `${t(locale, "memoryWhyLabel")}: ${escapeMarkdownV2(humanizeCandidateReason(locale, candidate.reasoning.join(" ")))}`,
    `${t(locale, "memoryCapturedFromLabel")}: ${escapeMarkdownV2(`${candidate.source.type}: ${candidate.source.detail}`)}`
  );

  return lines.join("\n");
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
    "- `/remember <texto>`: atalho curto que ja tenta abrir a proposta de promocao",
    "- `/refinar <texto>`: abre o trilho guiado quando a captura ainda estiver frouxa",
    "- `guarda isso: ...`: atalho de texto livre para o mesmo fluxo",
    "- `guarda isso como skill de projeto: ...`: preserva a intencao de promover para skill",
    "",
    "Contrato atual:",
    "- localizacao comeca em `INDEX.md`, `AGENTS.md` e na camada 2 `.agents/PROJECT.md`, `.agents/ACTIVE.md`, `.agents/HANDOFF.md` e `.codex/napkin.md`",
    "- retomada operacional completa tambem confere `.agents/sprints/INDEX.md` quando houver sprint/bloco e `.agents/ESTACIONAMENTO.md` quando houver residuo/reabertura",
    "- memoria duravel do workspace fica em `.agents/MEMORY.ndjson`",
    "- skill candidate e o estagio entre memoria reutilizavel e skill pronta",
    "- escrita duravel segue `proposal-first writes`",
    "- recall mistura estado operacional local, ledger duravel do workspace e memoria global read-only",
    "- a query de recall agora e unificada com `projectName`, `currentObjective`, `nextEligibleBlock` e `latestClosedBlock`",
    "- captura automatica de resposta finalizada so entra quando o pedido original ja e de memoria/promocao ou quando a resposta traz uma linha estruturada como `Decision:` ou `Rule:`",
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
    "- quando o estagio do candidato for `skill_candidate`, o destino sugerido tambem aparece",
    "- `.agents/MEMORY.ndjson` continua append-only",
    "",
    `README completo: ${memoryReadmePath}`
  ].join("\n");
}

function buildRememberRefinementGuide(rawRemember: string): string {
  const preview = compactMemoryUiText(rawRemember, 140) || "nota vazia";
  return [
    "This note is still too weak to become a memory candidate.",
    "",
    "Use `refinador-intencao` and answer quickly:",
    "1. destino: memoria | skill deste repo | skill global | estado vivo",
    "2. repo alvo: dex-agent raiz | repo filho | ainda nao sei",
    "3. escopo: so este repo | varios repos | ainda nao sei",
    "4. repeticao: sim | talvez | nao",
    "5. evidencia: decisao | comando | arquivo | comportamento real",
    "",
    `Rascunho atual: ${preview}`,
    "",
    "Depois disso, tente `/remember ...` de novo."
  ].join("\n");
}

function buildPromptLibraryHelpText(): string {
  return [
    "Biblioteca de prompts do projeto:",
    "- `/prompts` ou `/prompts show`: lista prompts prontos do projeto atual",
    "- `/prompts add <label> :: <prompt>`: adiciona um prompt custom com intent `implementation`",
    "- `/prompts add <intent> :: <label> :: <prompt>`: adiciona um prompt custom com intent explicito",
    "- `/prompts run <numero|selector>`: executa um prompt da biblioteca",
    "- `/prompts remove <selector>`: remove um prompt custom",
    "",
    "Intents aceitos:",
    "- `status`",
    "- `continue`",
    "- `planning`",
    "- `implementation`",
    "",
    "Exemplos:",
    "- `/prompts run 1`",
    "- `/prompts run builtin:0`",
    "- `/prompts add Sprint implementacao :: /plan concordo com voce quero crie os sprint de planejamento de implementacao usando $sprinter`",
    "- `/prompts add planning :: Sprint implementacao :: /plan concordo com voce quero crie os sprint de planejamento de implementacao usando $sprinter`"
  ].join("\n");
}

function buildDashboardAdminText(
  locale: Locale,
  snapshot: DashboardAdminSnapshot,
  relativeWorkdir: string
): string {
  const builtinCount = snapshot.prompts.items.filter(
    (item) => item.source === "builtin"
  ).length;
  const customCount = snapshot.prompts.items.filter(
    (item) => item.source === "custom"
  ).length;

  return [
    t(locale, "adminDashboardTitle"),
    `${t(locale, "adminDashboardProjectLabel")}: ${relativeWorkdir || snapshot.workdir}`,
    "",
    `${t(locale, "adminDashboardModulesLabel")}:`,
    ...snapshot.modules.map((module) =>
      [
        `- ${module.label}: ${module.status} / ${module.mode}`,
        module.reason ? ` - ${module.reason}` : ""
      ].join("")
    ),
    "",
    `${t(locale, "adminDashboardPromptsLabel")}:`,
    `- ${t(locale, "adminDashboardBuiltinsLabel")}: ${builtinCount}`,
    `- ${t(locale, "adminDashboardCustomLabel")}: ${customCount}`,
    `- ${t(locale, "adminDashboardActionsLabel")}: ${snapshot.prompts.capabilities.join(", ")}`,
    "",
    `${t(locale, "adminDashboardHistoryLabel")}:`,
    `- ${t(locale, "adminDashboardCandidatesLabel")}: ${snapshot.history.candidates.length}`,
    `- ${t(locale, "adminDashboardProposalsLabel")}: ${snapshot.history.proposals.length}`,
    `- ${t(locale, "adminDashboardActionsLabel")}: ${snapshot.history.capabilities.join(", ")}`,
    "",
    `${t(locale, "adminDashboardOperationLabel")}: ${snapshot.operation.reason}`,
    `${t(locale, "adminDashboardSettingsLabel")}: ${snapshot.settings.reason}`,
    "",
    t(locale, "adminDashboardLinkHint")
  ].join("\n");
}

function buildAdminPromptsText(
  locale: Locale,
  snapshot: DashboardAdminSnapshot,
  relativeWorkdir: string
): string {
  const builtinItems = snapshot.prompts.items.filter(
    (item) => item.source === "builtin"
  );
  const customItems = snapshot.prompts.items.filter(
    (item) => item.source === "custom"
  );

  const formatItem = (item: (typeof snapshot.prompts.items)[number]): string =>
    [
      `- ${item.selector}`,
      item.label,
      humanizePromptIntent(item.intent),
      item.removable ? t(locale, "adminPromptsRemovable") : null
    ]
      .filter(Boolean)
      .join(" | ");

  return [
    t(locale, "adminPromptsTitle"),
    `${t(locale, "adminDashboardProjectLabel")}: ${relativeWorkdir || snapshot.workdir}`,
    "",
    `${t(locale, "adminDashboardBuiltinsLabel")}:`,
    ...(builtinItems.length
      ? builtinItems.map(formatItem)
      : [t(locale, "adminPromptsEmptyBuiltins")]),
    "",
    `${t(locale, "adminDashboardCustomLabel")}:`,
    ...(customItems.length
      ? customItems.map(formatItem)
      : [t(locale, "adminPromptsEmptyCustom")]),
    "",
    `${t(locale, "adminDashboardActionsLabel")}: ${snapshot.prompts.capabilities.join(", ")}`,
    t(locale, "adminPromptsUsage")
  ].join("\n");
}

function buildAdminHistoryText(
  locale: Locale,
  snapshot: DashboardAdminSnapshot,
  relativeWorkdir: string
): string {
  const formatCandidate = (
    item: (typeof snapshot.history.candidates)[number]
  ): string =>
    [
      `- ${item.selector}`,
      item.title,
      `${item.confidence}`,
      item.stage || item.kind
    ]
      .filter(Boolean)
      .join(" | ");

  const formatProposal = (
    item: (typeof snapshot.history.proposals)[number]
  ): string =>
    [`- ${item.selector}`, item.title, item.destination, `${item.confidence}`]
      .filter(Boolean)
      .join(" | ");

  return [
    t(locale, "adminHistoryTitle"),
    `${t(locale, "adminDashboardProjectLabel")}: ${relativeWorkdir || snapshot.workdir}`,
    "",
    `${t(locale, "adminDashboardCandidatesLabel")}:`,
    ...(snapshot.history.candidates.length
      ? snapshot.history.candidates.map(formatCandidate)
      : [t(locale, "adminHistoryEmptyCandidates")]),
    "",
    `${t(locale, "adminDashboardProposalsLabel")}:`,
    ...(snapshot.history.proposals.length
      ? snapshot.history.proposals.map(formatProposal)
      : [t(locale, "adminHistoryEmptyProposals")]),
    "",
    `${t(locale, "adminDashboardActionsLabel")}: ${snapshot.history.capabilities.join(", ")}`,
    t(locale, "adminHistoryUsage")
  ].join("\n");
}

function buildAdminHistoryExplainText(
  locale: Locale,
  relativeWorkdir: string,
  selector: string,
  explanation: string
): string {
  return [
    t(locale, "adminHistoryExplainTitle"),
    `${t(locale, "adminDashboardProjectLabel")}: ${relativeWorkdir}`,
    `selector: ${selector}`,
    "",
    explanation || t(locale, "emptyResponse")
  ].join("\n");
}

function isProjectPromptIntent(value: string): value is ProjectPromptIntent {
  return (
    value === "status" ||
    value === "continue" ||
    value === "planning" ||
    value === "implementation"
  );
}

function parseAdminPromptAddPayload(
  raw: string
): { label: string; prompt: string; intent?: ProjectPromptIntent } | null {
  const normalized = String(raw || "").trim();
  if (!normalized) {
    return null;
  }

  const parts = normalized
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 2) {
    const [label, prompt] = parts;
    return label && prompt ? { label, prompt } : null;
  }

  if (parts.length === 3 && isProjectPromptIntent(parts[0] || "")) {
    const intent = parts[0] as ProjectPromptIntent;
    const label = parts[1];
    const prompt = parts[2];
    return label && prompt ? { intent, label, prompt } : null;
  }

  return null;
}

const PROMPT_LIBRARY_PAGE_SIZE = 8;

function normalizePromptLibraryPage(page: number, total: number): number {
  const lastPage = Math.max(0, Math.ceil(total / PROMPT_LIBRARY_PAGE_SIZE) - 1);
  return Math.min(Math.max(0, page), lastPage);
}

function buildPromptLibraryButtons(
  presets: ReturnType<typeof buildProjectPromptPresets>,
  page = 0
): Array<Array<{ text: string; callbackData: string }>> {
  const safePage = normalizePromptLibraryPage(page, presets.length);
  const start = safePage * PROMPT_LIBRARY_PAGE_SIZE;
  const pagePresets = presets.slice(start, start + PROMPT_LIBRARY_PAGE_SIZE);
  const buttons = pagePresets.map((preset, index) => ({
    text: `${start + index + 1}. ${compactPromptLibraryText(preset.label, 20)}`,
    callbackData: `prompts:run:${preset.selector.replace(/:/g, "~")}`
  }));
  const rows: Array<Array<{ text: string; callbackData: string }>> = [];

  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2));
  }

  if (presets.length > PROMPT_LIBRARY_PAGE_SIZE) {
    rows.push([
      ...(safePage > 0
        ? [{ text: "← Anterior", callbackData: `prompts:show:${safePage - 1}` }]
        : []),
      {
        text: `${safePage + 1}/${Math.ceil(presets.length / PROMPT_LIBRARY_PAGE_SIZE)}`,
        callbackData: "prompts:show"
      },
      ...(start + PROMPT_LIBRARY_PAGE_SIZE < presets.length
        ? [{ text: "Proxima →", callbackData: `prompts:show:${safePage + 1}` }]
        : [])
    ]);
  }

  rows.push([{ text: "Atualizar", callbackData: `prompts:show:${safePage}` }]);
  return rows;
}

function compactPromptLibraryText(value: string, max = 108): string {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function humanizePromptIntent(intent: ProjectPromptPreset["intent"]): string {
  switch (intent) {
    case "continue":
      return "Continuacao";
    case "planning":
      return "Planejamento";
    case "implementation":
      return "Implementacao";
    default:
      return "Status";
  }
}

function formatPromptLibrarySection(
  title: string,
  presets: ProjectPromptPreset[],
  startIndex = 0
): string[] {
  if (!presets.length) return [];

  return [
    `*${title}*`,
    ...presets.map(
      (preset, index) =>
        `${startIndex + index + 1}. *${escapeMarkdownV2(preset.label)}*` +
        `\n   tipo: ${escapeMarkdownV2(humanizePromptIntent(preset.intent))}` +
        `\n   atalho: ${escapeMarkdownV2(`/prompts run ${startIndex + index + 1}`)}` +
        `\n   uso: ${escapeMarkdownV2(compactPromptLibraryText(preset.prompt))}`
    ),
    ""
  ];
}

function groupPromptLibraryPresets(
  presets: ProjectPromptPreset[]
): Array<{ title: string; presets: ProjectPromptPreset[] }> {
  const order = [
    "Execucao",
    "Planejamento",
    "Reuniao",
    "Testes",
    "Analise",
    "Organizacao",
    "Retomada",
    "Custom"
  ];

  return order
    .map((title) => ({
      title,
      presets: presets.filter((preset) => preset.group === title)
    }))
    .filter((group) => group.presets.length);
}

function renderPromptLibrary(
  presets: ReturnType<typeof buildProjectPromptPresets>,
  page = 0
): MemoryReplyPayload {
  if (!presets.length) {
    return {
      text: [
        "*Biblioteca de Prompts*",
        "",
        "Nenhum prompt disponivel neste projeto."
      ].join("\n")
    };
  }
  const safePage = normalizePromptLibraryPage(page, presets.length);
  const grouped = groupPromptLibraryPresets(presets);
  let offset = 0;
  const sections = grouped.flatMap((group) => {
    const lines = formatPromptLibrarySection(
      group.title,
      group.presets,
      offset
    );
    offset += group.presets.length;
    return lines;
  });

  return {
    text: [
      "*Biblioteca de Prompts*",
      "",
      "Use esta biblioteca para reaproveitar pedidos frequentes sem redigitar tudo.",
      "",
      ...sections,
      "",
      `Pagina rapida: ${safePage + 1}/${Math.max(1, Math.ceil(presets.length / PROMPT_LIBRARY_PAGE_SIZE))}.`,
      "Use `/prompts run <numero>` para executar pelo indice da lista.",
      "Toque em um atalho abaixo para executar rapido.",
      "Para adicionar novos prompts, use `/prompts add ...`.",
      "Para remover prompts custom, use `/prompts remove custom:<id>`."
    ].join("\n"),
    buttons: buildPromptLibraryButtons(presets, safePage)
  };
}

function normalizePromptSelector(value: string): string {
  return String(value || "")
    .replace(/~/g, ":")
    .trim();
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
    if (numeric === 0) {
      return presets[0] || null;
    }
    return presets[numeric - 1] || null;
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
              .map(
                (line) => `\\- ${escapeMarkdownV2(line.replace(/^- /, ""))}`
              ),
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
                  `\\- \\[${escapeMarkdownV2(entry.kind)}\\] ${escapeMarkdownV2(entry.title)}`
              ),
            ""
          ]
        : []),
      `${t(locale, "memorySourcesLabel")}: ${escapeMarkdownV2(
        formatMemorySourcesForReply(workdir, packet.sources) ||
          t(locale, "memoryNone")
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
  dashboardAdminService,
  adminWebServer,
  audioTranscriber,
  audioSummaryManager,
  telegramMediaDownloader = (source) => downloadTelegramMediaToTemp({ source }),
  telegramConfig,
  instance,
  adminActions
}: RegisterHandlersOptions): void {
  const instanceConfig = instance ?? ptyManager.config.instance;
  const fixedInstanceProject =
    instanceConfig?.projectLabel || path.basename(ptyManager.config.runner.cwd);
  const effectiveReuseEngine =
    reuseEngine || new ProjectReuseEngine(memoryService);
  const effectiveDashboardAdminService =
    dashboardAdminService || new DashboardAdminService();
  const effectiveAdminWebServer = adminWebServer;
  const effectiveHistoryAdminService = new HistoryAdminService(memoryService);
  const effectivePromptAdminService = new PromptAdminService(
    memoryService,
    promptLibraryService
  );
  const localeOf = (chatId: string | number): Locale =>
    ptyManager.getLanguage(chatId);
  const resolveImmediatePlanContext = (
    chatId: string | number,
    workdir: string,
    task: string
  ): string | null => {
    if (!shouldAttachImmediateContextToPlan(task)) {
      return null;
    }

    const latestFinalActionText =
      audioSummaryManager?.getLatestFinalActionText?.(chatId, workdir);
    if (latestFinalActionText) {
      return latestFinalActionText;
    }

    const projectState = ptyManager.getProjectState(chatId, workdir);
    const operationalState = ptyManager.getOperationalContinuationState(
      chatId,
      workdir
    );

    return (
      projectState.lastFinalResponseText ||
      operationalState.lastFinalResponseText ||
      null
    );
  };
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
    const operational = ptyManager.getOperationalContinuationState(ctx.chat.id);

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
      ...buildObservabilityLines(locale, operational, {
        includeHeader: false,
        includeLastResponse: false
      })
    ];

    await sendSkillResult(
      ctx,
      {
        text: lines.join("\n"),
        buttons: buildQueueButtons(operational.queuedItems)
      },
      locale,
      audioSummaryManager
    );
  };

  const executeProjectStatus = async (
    ctx: any,
    locale: Locale,
    variant:
      | "default"
      | "executive"
      | "next"
      | "sources"
      | "steps"
      | "commands"
      | "prompts"
      | "queue" = "default"
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
    options: Record<string, unknown> & { startedMessageText?: string } = {}
  ): Promise<SendPromptResult | null> => {
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
    const { startedMessageText, ...sendPromptOptions } = options;
    const result = await ptyManager.sendPrompt(
      ctx,
      promptWithMemory.prompt,
      sendPromptOptions as any
    );
    if (result.started) {
      await sendChunkedMarkdown(
        ctx,
        startedMessageText ||
          "Pedido enviado ao Codex. Vou te mostrando o andamento aqui."
      );
      return result;
    }
    if (!result.started) {
      await handlePromptResult(ctx, locale, result);
    }
    return result;
  };

  const handleStatusCommand = async (ctx: any): Promise<void> => {
    const locale = localeOf(ctx.chat.id);
    const status = ptyManager.getStatus(ctx.chat.id);
    const operational = ptyManager.getOperationalContinuationState(ctx.chat.id);
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
    const observabilityLines = buildObservabilityLines(locale, operational);
    await sendChunkedMarkdown(
      ctx,
      [
        ...t(locale, "statusLines", {
          status,
          recentProjects:
            ptyManager
              .getRecentProjects(ctx.chat.id)
              .map((item) => item.relativePath)
              .join(", ") || ".",
          shellSummary,
          skillsSummary,
          mcpSummary
        }),
        ...observabilityLines
      ].join("\n")
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

    if (isFixedInstanceMode(instanceConfig)) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "instanceRepoSwitchBlocked", {
          project: fixedInstanceProject
        })
      );
      return;
    }

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
      const recent = recentProjects.map(
        (project) => `- ${project.relativePath}`
      );
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
  const handleAdminDashboardCommand = async (ctx: any): Promise<void> => {
    const locale = localeOf(ctx.chat.id);
    const status = ptyManager.getStatus(ctx.chat.id);
    const keyboard = Markup.inlineKeyboard(
      ADMIN_DASHBOARD_BUTTON_ROWS.map((row) =>
        buildLocalizedButtonRow(locale, row).map((button) =>
          Markup.button.callback(button.text, button.callbackData)
        )
      )
    );

    try {
      const snapshot = await effectiveDashboardAdminService.inspect(
        status.workdir
      );
      await sendChunkedMarkdown(
        ctx,
        buildDashboardAdminText(locale, snapshot, status.relativeWorkdir),
        {
          ...keyboard
        }
      );
    } catch (error) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "adminDashboardInspectFailed", {
          error: toErrorMessage(error)
        })
      );
    }
  };
  const handleAdminLinkCommand = async (ctx: any): Promise<void> => {
    const locale = localeOf(ctx.chat.id);
    const status = ptyManager.getStatus(ctx.chat.id);

    if (!effectiveAdminWebServer) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "adminLinkFailed", {
          error: "admin_web_server_unavailable"
        })
      );
      return;
    }

    try {
      const url = await effectiveAdminWebServer.getLink(status.workdir);
      await sendChunkedMarkdown(
        ctx,
        t(locale, "adminLinkReady", {
          relativeWorkdir: status.relativeWorkdir,
          url
        })
      );
    } catch (error) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "adminLinkFailed", {
          error: toErrorMessage(error)
        })
      );
    }
  };
  const handleAdminPromptsCommand = async (
    ctx: any,
    payload = ""
  ): Promise<void> => {
    const locale = localeOf(ctx.chat.id);
    const status = ptyManager.getStatus(ctx.chat.id);
    const trimmedPayload = String(payload || "").trim();

    if (trimmedPayload) {
      const lowerPayload = trimmedPayload.toLowerCase();

      if (lowerPayload.startsWith("add ")) {
        const parsed = parseAdminPromptAddPayload(trimmedPayload.slice(4));
        if (!parsed) {
          await sendChunkedMarkdown(ctx, t(locale, "adminPromptsUsage"));
          return;
        }

        try {
          const created =
            await effectivePromptAdminService.createPromptAdminItem(
              status.workdir,
              parsed
            );
          await sendChunkedMarkdown(
            ctx,
            t(locale, "adminPromptsCreated", {
              selector: created.selector,
              label: created.label,
              intent: humanizePromptIntent(created.intent)
            })
          );
          return;
        } catch (error) {
          await sendChunkedMarkdown(
            ctx,
            t(locale, "adminDashboardInspectFailed", {
              error: toErrorMessage(error)
            })
          );
          return;
        }
      }

      if (lowerPayload.startsWith("remove ")) {
        const selector = trimmedPayload.slice(7).trim();
        if (!selector) {
          await sendChunkedMarkdown(ctx, t(locale, "adminPromptsUsage"));
          return;
        }

        try {
          const removed =
            await effectivePromptAdminService.removePromptAdminItem(
              status.workdir,
              selector
            );

          if (!removed) {
            await sendChunkedMarkdown(
              ctx,
              t(locale, "adminPromptsNotFound", { selector })
            );
            return;
          }

          await sendChunkedMarkdown(
            ctx,
            t(locale, "adminPromptsRemoved", {
              selector: removed.selector,
              label: removed.label,
              intent: humanizePromptIntent(removed.intent)
            })
          );
          return;
        } catch (error) {
          const message = toErrorMessage(error);

          if (message === "prompt_admin_builtin_not_removable") {
            await sendChunkedMarkdown(
              ctx,
              t(locale, "adminPromptsBuiltinNotRemovable")
            );
            return;
          }

          if (
            message === "prompt_admin_selector_required" ||
            message === "prompt_admin_selector_invalid"
          ) {
            await sendChunkedMarkdown(ctx, t(locale, "adminPromptsUsage"));
            return;
          }

          await sendChunkedMarkdown(
            ctx,
            t(locale, "adminDashboardInspectFailed", {
              error: message
            })
          );
          return;
        }
      }

      await sendChunkedMarkdown(ctx, t(locale, "adminPromptsUsage"));
      return;
    }

    try {
      const snapshot = await effectiveDashboardAdminService.inspect(
        status.workdir
      );
      await sendChunkedMarkdown(
        ctx,
        buildAdminPromptsText(locale, snapshot, status.relativeWorkdir),
        {
          ...Markup.inlineKeyboard(
            ADMIN_DASHBOARD_BUTTON_ROWS.map((row) =>
              buildLocalizedButtonRow(locale, row).map((button) =>
                Markup.button.callback(button.text, button.callbackData)
              )
            )
          )
        }
      );
    } catch (error) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "adminDashboardInspectFailed", {
          error: toErrorMessage(error)
        })
      );
    }
  };
  const handleAdminHistoryCommand = async (
    ctx: any,
    payload = ""
  ): Promise<void> => {
    const locale = localeOf(ctx.chat.id);
    const status = ptyManager.getStatus(ctx.chat.id);
    const trimmedPayload = String(payload || "").trim();

    if (trimmedPayload) {
      const lowerPayload = trimmedPayload.toLowerCase();

      if (lowerPayload.startsWith("explain ")) {
        const selector = trimmedPayload.slice(8).trim();
        if (!selector) {
          await sendChunkedMarkdown(ctx, t(locale, "adminHistoryUsage"));
          return;
        }

        try {
          const explanation =
            await effectiveHistoryAdminService.explainHistoryCandidate(
              status.workdir,
              selector
            );

          if (!explanation) {
            await sendChunkedMarkdown(
              ctx,
              t(locale, "adminHistoryCandidateNotFound", { selector })
            );
            return;
          }

          await sendChunkedMarkdown(
            ctx,
            buildAdminHistoryExplainText(
              locale,
              status.relativeWorkdir,
              selector,
              explanation
            )
          );
          return;
        } catch (error) {
          const message = toErrorMessage(error);

          if (
            message === "history_admin_selector_required" ||
            message === "history_admin_selector_invalid"
          ) {
            await sendChunkedMarkdown(ctx, t(locale, "adminHistoryUsage"));
            return;
          }

          await sendChunkedMarkdown(
            ctx,
            t(locale, "adminDashboardInspectFailed", {
              error: message
            })
          );
          return;
        }
      }

      if (lowerPayload.startsWith("discard ")) {
        const selector = trimmedPayload.slice(8).trim();
        if (!selector) {
          await sendChunkedMarkdown(ctx, t(locale, "adminHistoryUsage"));
          return;
        }

        try {
          const discarded =
            await effectiveHistoryAdminService.discardHistoryCandidate(
              status.workdir,
              selector
            );

          if (!discarded) {
            await sendChunkedMarkdown(
              ctx,
              t(locale, "adminHistoryCandidateNotFound", { selector })
            );
            return;
          }

          await sendChunkedMarkdown(
            ctx,
            t(locale, "adminHistoryCandidateDiscarded", {
              selector: discarded.selector,
              title: discarded.title,
              stage: discarded.stage || "none"
            })
          );
          return;
        } catch (error) {
          const message = toErrorMessage(error);

          if (
            message === "history_admin_selector_required" ||
            message === "history_admin_selector_invalid"
          ) {
            await sendChunkedMarkdown(ctx, t(locale, "adminHistoryUsage"));
            return;
          }

          await sendChunkedMarkdown(
            ctx,
            t(locale, "adminDashboardInspectFailed", {
              error: message
            })
          );
          return;
        }
      }

      if (lowerPayload.startsWith("propose ")) {
        const selector = trimmedPayload.slice(8).trim();
        if (!selector) {
          await sendChunkedMarkdown(ctx, t(locale, "adminHistoryUsage"));
          return;
        }

        try {
          const proposal =
            await effectiveHistoryAdminService.proposeHistoryCandidate(
              status.workdir,
              selector
            );

          if (!proposal) {
            await sendChunkedMarkdown(
              ctx,
              t(locale, "adminHistoryCandidateNotFound", { selector })
            );
            return;
          }

          await sendChunkedMarkdown(
            ctx,
            t(locale, "adminHistoryProposalCreated", {
              selector: proposal.selector,
              candidateSelector: proposal.candidateSelector,
              destination: proposal.destination
            })
          );
          return;
        } catch (error) {
          const message = toErrorMessage(error);

          if (
            message === "history_admin_selector_required" ||
            message === "history_admin_selector_invalid"
          ) {
            await sendChunkedMarkdown(ctx, t(locale, "adminHistoryUsage"));
            return;
          }

          await sendChunkedMarkdown(
            ctx,
            t(locale, "adminDashboardInspectFailed", {
              error: message
            })
          );
          return;
        }
      }

      if (lowerPayload.startsWith("cancel ")) {
        const selector = trimmedPayload.slice(7).trim();
        if (!selector) {
          await sendChunkedMarkdown(ctx, t(locale, "adminHistoryUsage"));
          return;
        }

        try {
          const proposal =
            await effectiveHistoryAdminService.cancelHistoryProposal(
              status.workdir,
              selector
            );

          if (!proposal) {
            await sendChunkedMarkdown(
              ctx,
              t(locale, "adminHistoryProposalNotFound", { selector })
            );
            return;
          }

          await sendChunkedMarkdown(
            ctx,
            t(locale, "adminHistoryProposalCanceled", {
              selector: proposal.selector,
              candidateSelector: proposal.candidateSelector,
              destination: proposal.destination
            })
          );
          return;
        } catch (error) {
          const message = toErrorMessage(error);

          if (
            message === "history_admin_selector_required" ||
            message === "history_admin_selector_invalid"
          ) {
            await sendChunkedMarkdown(ctx, t(locale, "adminHistoryUsage"));
            return;
          }

          await sendChunkedMarkdown(
            ctx,
            t(locale, "adminDashboardInspectFailed", {
              error: message
            })
          );
          return;
        }
      }

      await sendChunkedMarkdown(ctx, t(locale, "adminHistoryUsage"));
      return;
    }

    try {
      const snapshot = await effectiveDashboardAdminService.inspect(
        status.workdir
      );
      await sendChunkedMarkdown(
        ctx,
        buildAdminHistoryText(locale, snapshot, status.relativeWorkdir),
        {
          ...Markup.inlineKeyboard(
            ADMIN_DASHBOARD_BUTTON_ROWS.map((row) =>
              buildLocalizedButtonRow(locale, row).map((button) =>
                Markup.button.callback(button.text, button.callbackData)
              )
            )
          )
        }
      );
    } catch (error) {
      await sendChunkedMarkdown(
        ctx,
        t(locale, "adminDashboardInspectFailed", {
          error: toErrorMessage(error)
        })
      );
    }
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
      const rememberShortcut = extractRememberShortcut(text);
      if (rememberShortcut) {
        const workdir = ptyManager.getStatus(ctx.chat.id).workdir;
        await handleRememberCapture(
          ctx,
          locale,
          workdir,
          rememberShortcut,
          "text remember shortcut"
        );
        return;
      }

      if (isOperationalStatusQuestion(text)) {
        await renderOperationalStatus(ctx, locale, "status");
        return;
      }

      if (isOperationalNextStepQuestion(text)) {
        await executeProjectStatus(ctx, locale, "next");
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
      await sendChunkedMarkdown(
        ctx,
        t(locale, "audioTranscriptionUnavailable")
      );
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

  bot.command("admin", async (ctx: any) => {
    const payload = String(
      extractCommandPayload(ctx.message.text, "admin") || "show"
    ).trim();
    const lowerPayload = payload.toLowerCase();

    if (lowerPayload === "show") {
      await handleAdminDashboardCommand(ctx);
      return;
    }

    if (lowerPayload === "link") {
      await handleAdminLinkCommand(ctx);
      return;
    }

    if (lowerPayload === "prompts" || lowerPayload.startsWith("prompts ")) {
      await handleAdminPromptsCommand(ctx, payload.slice("prompts".length));
      return;
    }

    if (lowerPayload === "history" || lowerPayload.startsWith("history ")) {
      await handleAdminHistoryCommand(ctx, payload.slice("history".length));
      return;
    }

    await sendChunkedMarkdown(ctx, t(localeOf(ctx.chat.id), "adminUsage"));
  });

  bot.command("status", handleStatusCommand);

  bot.command("pwd", handlePwdCommand);

  bot.command("repo", handleRepoCommand);

  bot.command("project", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const rawVariant = normalizeAscii(
      extractCommandPayload(ctx.message.text, "project")
    );
    const variantMap: Record<
      string,
      | "default"
      | "executive"
      | "next"
      | "sources"
      | "steps"
      | "commands"
      | "queue"
      | "prompts"
    > = {
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

      const showPageMatch = payload.match(/^show\s+(\d+)$/i);
      if (showPageMatch?.[1]) {
        const rendered = renderPromptLibrary(
          presets,
          Number(showPageMatch[1]) - 1
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
        await sendChunkedMarkdown(
          ctx,
          "No inbox candidate matched that selector."
        );
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
      const candidate = await memoryService.getCandidate(
        workdir,
        whyMatch[1].trim()
      );
      await sendChunkedMarkdown(
        ctx,
        candidate
          ? renderCandidateExplanation(locale, candidate)
          : "No inbox candidate matched that selector."
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

  async function handleRememberCapture(
    ctx: any,
    locale: Locale,
    workdir: string,
    rawRemember: string,
    sourceDetail = "/memory remember"
  ): Promise<void> {
    const parsed = parseRememberCapture(rawRemember);
    const candidate = await memoryService.captureCandidate({
      workdir,
      text: parsed.text,
      kind: parsed.kind,
      promptText: parsed.promptText,
      source: {
        type: "operator",
        detail: sourceDetail
      },
      evidence: {
        type: "operator",
        value: rawRemember
      }
    });

    if (!candidate) {
      await sendChunkedMarkdown(ctx, buildRememberRefinementGuide(rawRemember));
      return;
    }

    const proposal = await memoryService.proposePromotion(
      workdir,
      candidate.id
    );
    if (proposal) {
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

    await sendChunkedMarkdown(
      ctx,
      `Created memory candidate ${candidate.id}\nkind: ${candidate.kind}\ntitle: ${candidate.title}`
    );
  }

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
        await sendChunkedMarkdown(
          ctx,
          "No memory candidate matched that selector."
        );
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
      const candidate = await memoryService.getCandidate(
        workdir,
        whyMatch[1].trim()
      );
      await sendChunkedMarkdown(
        ctx,
        candidate
          ? renderCandidateExplanation(locale, candidate)
          : "No memory candidate matched that selector."
      );
      return;
    }

    const rememberMatch = payload.match(/^remember\s+(.+)$/i);
    if (rememberMatch?.[1]) {
      await handleRememberCapture(
        ctx,
        locale,
        workdir,
        rememberMatch[1].trim(),
        "/memory remember"
      );
      return;
    }

    await sendChunkedMarkdown(
      ctx,
      "Usage: /memory [show|help|candidates|promote <id|index>|discard <id|index>|why <id|index>|remember <text>] or /remember <text> or /inbox [...]"
    );
  });

  bot.command("remember", async (ctx: any) => {
    const locale = localeOf(ctx.chat.id);
    const payload = extractCommandPayload(ctx.message.text, "remember");
    const workdir = ptyManager.getStatus(ctx.chat.id).workdir;

    if (!payload) {
      await sendChunkedMarkdown(ctx, "Usage: /remember <text>");
      return;
    }

    await handleRememberCapture(
      ctx,
      locale,
      workdir,
      payload.trim(),
      "/remember"
    );
  });

  bot.command("refinar", async (ctx: any) => {
    const payload = extractCommandPayload(ctx.message.text, "refinar");

    if (!payload) {
      await sendChunkedMarkdown(
        ctx,
        ["Uso: /refinar <texto>", "", buildRememberRefinementGuide("")].join(
          "\n"
        )
      );
      return;
    }

    await sendChunkedMarkdown(
      ctx,
      buildRememberRefinementGuide(payload.trim())
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
    const workdir = ptyManager.getStatus(ctx.chat.id).workdir;

    await executeActionPrompt(
      ctx,
      locale,
      applyLocalExecutionPreference(
        buildPlanPrompt(task, {
          immediateContext: resolveImmediatePlanContext(
            ctx.chat.id,
            workdir,
            task
          )
        })
      ),
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

    if (
      !trimmedPayload ||
      /^(list|ls|listar|ver|status)$/.test(normalizedAction)
    ) {
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

      const finalTask = projectScopedMatch
        ? projectScopedMatch[2].trim()
        : task;
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

  const handleReasoningCommand = async (ctx: any, commandName: string) => {
    const locale = localeOf(ctx.chat.id);
    const value = extractCommandPayload(ctx.message.text, commandName);
    if (!value) {
      const status = ptyManager.getStatus(ctx.chat.id);
      await sendChunkedMarkdown(
        ctx,
        t(locale, "reasoningCurrent", {
          effort: status.preferredReasoningEffort
        })
      );
      return;
    }

    if (/^(reset|default|inherit)$/i.test(value)) {
      ptyManager.clearPreferredReasoningEffort(ctx.chat.id);
      const closed = ptyManager.closeSession(ctx.chat.id);
      await sendChunkedMarkdown(ctx, t(locale, "reasoningReset", { closed }));
      return;
    }

    const effort = parseReasoningEffortValue(value);
    if (!effort) {
      await sendChunkedMarkdown(ctx, t(locale, "usageReasoning"));
      return;
    }

    ptyManager.setPreferredReasoningEffort(ctx.chat.id, effort);
    const closed = ptyManager.closeSession(ctx.chat.id);
    await sendChunkedMarkdown(
      ctx,
      t(locale, "reasoningSet", { value: effort, closed })
    );
  };

  bot.command("reasoning", async (ctx: any) =>
    handleReasoningCommand(ctx, "reasoning")
  );
  bot.command("raciocinio", async (ctx: any) =>
    handleReasoningCommand(ctx, "raciocinio")
  );

  const handleAutopilotCommand = async (ctx: any, commandName: string) => {
    const locale = localeOf(ctx.chat.id);
    const value = extractCommandPayload(ctx.message.text, commandName);

    if (!value || /^(status|state|estado)$/i.test(value.trim())) {
      const status = ptyManager.getSpecialAutopilotStatus(ctx.chat.id);
      await sendChunkedMarkdown(
        ctx,
        t(locale, "autopilotLoopCurrent", {
          enabled: status.enabled,
          remaining: status.remainingResponses
        })
      );
      return;
    }

    const normalizedValue = normalizeCommandToken(value);
    if (
      /^(resume|retomar|continuar|continue|seguir|de onde parou|de-onde-parou|ponto)$/.test(
        normalizedValue
      )
    ) {
      const status = ptyManager.getSpecialAutopilotStatus(ctx.chat.id);
      if (!status.enabled || status.remainingResponses <= 0) {
        await sendChunkedMarkdown(ctx, t(locale, "autopilotResumeDisabled"));
        return;
      }

      const projectState = ptyManager.getProjectState(ctx.chat.id);
      const operational = ptyManager.getOperationalContinuationState(
        ctx.chat.id
      );
      const lastFinalResponseText = String(
        projectState.lastFinalResponseText ||
          operational.lastFinalResponseText ||
          ""
      ).trim();

      if (!lastFinalResponseText) {
        await sendChunkedMarkdown(
          ctx,
          t(locale, "autopilotResumeMissingFinal")
        );
        return;
      }

      await sendChunkedMarkdown(
        ctx,
        t(locale, "autopilotResumeRequested", {
          remaining: status.remainingResponses,
          lastFinalized: operational.lastFinalizedAt || ""
        })
      );

      const result = await executeActionPrompt(
        ctx,
        locale,
        buildFinalResponseAutopilotPrompt(lastFinalResponseText),
        "continue",
        {
          queueLabel: "Retomar piloto automatico do ultimo fechamento",
          queueOnBusy: false,
          startedMessageText: t(locale, "autopilotResumeStarted")
        }
      );

      if (result?.started) {
        const nextStatus = ptyManager.consumeSpecialAutopilotStep(ctx.chat.id);
        await sendChunkedMarkdown(
          ctx,
          t(locale, "autopilotLoopTriggered", {
            remaining: nextStatus.remainingResponses
          })
        );
      }
      return;
    }

    if (/^(off|disable|desligar|stop|parar|0)$/.test(normalizedValue)) {
      ptyManager.clearSpecialAutopilot(ctx.chat.id);
      await sendChunkedMarkdown(ctx, t(locale, "autopilotLoopDisabled"));
      return;
    }

    const inlineCount = parseAutopilotResponseCount(value);
    const matchCount = value.match(/^(?:on|ativar|ligar)\s+(\d+)\s*$/i);
    const count =
      inlineCount || parseAutopilotResponseCount(matchCount?.[1] || "");

    if (!count || count > 50) {
      await sendChunkedMarkdown(ctx, t(locale, "usageAutopilotLoop"));
      return;
    }

    const status = ptyManager.setSpecialAutopilot(ctx.chat.id, count);
    await sendChunkedMarkdown(
      ctx,
      t(locale, "autopilotLoopEnabled", {
        remaining: status.remainingResponses
      })
    );
  };

  bot.command("autopilot", async (ctx: any) =>
    handleAutopilotCommand(ctx, "autopilot")
  );
  bot.command("piloto", async (ctx: any) =>
    handleAutopilotCommand(ctx, "piloto")
  );

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
    await sendChunkedMarkdown(ctx, t(locale, "interruptResult", { ok }));

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
      if (action === "admin") {
        await handleAdminDashboardCommand(ctx);
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

    if (data.startsWith("admin:")) {
      await ctx.answerCbQuery(t(locale, "callbackRefreshed"));
      const action = data.replace("admin:", "");

      if (action === "show") {
        await handleAdminDashboardCommand(ctx);
        return;
      }

      if (action === "prompts") {
        await handleAdminPromptsCommand(ctx);
        return;
      }

      if (action === "history") {
        await handleAdminHistoryCommand(ctx);
        return;
      }

      return;
    }

    if (data.startsWith("repo:switch:")) {
      await ctx.answerCbQuery(t(locale, "callbackRefreshed"));
      if (isFixedInstanceMode(instanceConfig)) {
        await sendChunkedMarkdown(
          ctx,
          t(locale, "instanceRepoSwitchBlocked", {
            project: fixedInstanceProject
          })
        );
        return;
      }

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
          await sendChunkedMarkdown(
            ctx,
            "No memory candidate matched that selector."
          );
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
        const candidate = await memoryService.getCandidate(
          workdir,
          argument || ""
        );
        await sendChunkedMarkdown(
          ctx,
          candidate
            ? renderCandidateExplanation(locale, candidate)
            : "No memory candidate matched that selector."
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
        const target = (argument || "active") as
          | "index"
          | "agents"
          | "project"
          | "active"
          | "handoff"
          | "napkin"
          | "sprintsIndex"
          | "estacionamento"
          | "ledger";
        const content = await memoryService.readOperationalFile(
          workdir,
          target
        );
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
          await sendChunkedMarkdown(
            ctx,
            "No inbox candidate matched that selector."
          );
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
        const candidate = await memoryService.getCandidate(
          workdir,
          argument || ""
        );
        await sendChunkedMarkdown(
          ctx,
          candidate
            ? renderCandidateExplanation(locale, candidate)
            : "No inbox candidate matched that selector."
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
        const page = rawArgument ? Number(rawArgument) : 0;
        const rendered = renderPromptLibrary(
          presets,
          Number.isFinite(page) ? page : 0
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
          removed
            ? `Prompt removido: ${removed.label}`
            : "Nao encontrei esse prompt custom."
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
            await sendChunkedMarkdown(
              ctx,
              t(locale, "audioSummaryUnavailable")
            );
            return;
          }

          const summarySent = await audioSummaryManager.sendSummaryForChat(
            ctx.chat.id,
            typeof result === "string" ? result : result.text || ""
          );
          if (!summarySent) {
            await sendChunkedMarkdown(
              ctx,
              t(locale, "audioSummaryUnavailable")
            );
          }
          return;
        }

        if (action === "meeting") {
          const sourceText =
            typeof result === "string" ? result : result.text || "";
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
      const record = audioSummaryManager?.resolveRequest(
        ctx.chat.id,
        requestId
      );

      if (!record) {
        await ctx.answerCbQuery(t(locale, "audioSummaryExpired"));
        return;
      }

      const normalizedAction = normalizeFinalActionRoute(action);
      const handoffTarget =
        normalizedAction === "handoff"
          ? extractFinalResponseNextSpecialist(record.text)
          : null;
      const callbackKey =
        normalizedAction === "plan"
          ? "finalActionPlanCallbackReceived"
          : normalizedAction === "handoff"
            ? "finalActionHandoffCallbackReceived"
            : normalizedAction === "continue_medium"
              ? "finalActionContinueMediumCallbackReceived"
              : normalizedAction === "continue_full"
                ? "finalActionContinueFullCallbackReceived"
                : normalizedAction === "autopilot"
                  ? "finalActionAutopilotCallbackReceived"
                  : normalizedAction === "autopilot_arm"
                    ? "finalActionAutopilotArmCallbackReceived"
                    : "finalActionContinueShortCallbackReceived";

      await ctx.answerCbQuery(
        normalizedAction === "plan" ||
          normalizedAction === "handoff" ||
          normalizedAction === "continue_short" ||
          normalizedAction === "continue_medium" ||
          normalizedAction === "continue_full" ||
          normalizedAction === "autopilot" ||
          normalizedAction === "autopilot_arm"
          ? t(locale, callbackKey, { target: handoffTarget || "" })
          : t(locale, "callbackRefreshed")
      );

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

      if (normalizedAction === "plan") {
        await executeActionPrompt(
          ctx,
          locale,
          buildFinalResponsePlanPrompt(record.text),
          "planning"
        );
        return;
      }

      if (normalizedAction === "handoff") {
        const targetText = handoffTarget ? ` para ${handoffTarget}` : "";
        await sendChunkedMarkdown(
          ctx,
          `Callback do botao Encaminhar${targetText} recebido.`
        );
        await executeActionPrompt(
          ctx,
          locale,
          buildFinalResponseHandoffPrompt(record.text),
          "planning",
          {
            queueLabel: "Botao Encaminhar acionado",
            startedMessageText:
              "Botao Encaminhar acionado. Pedido enviado ao Codex. Vou te mostrando o andamento aqui."
          }
        );
        return;
      }

      if (
        normalizedAction === "continue_short" ||
        normalizedAction === "continue_medium" ||
        normalizedAction === "continue_full"
      ) {
        const level =
          normalizedAction === "continue_medium"
            ? "medium"
            : normalizedAction === "continue_full"
              ? "full"
              : "short";
        const labelText =
          normalizedAction === "continue_medium"
            ? "Botao Continuar sprint acionado"
            : normalizedAction === "continue_full"
              ? "Botao Concluir bloco todo acionado"
              : "Botao Proximo passo acionado";
        const callbackText =
          normalizedAction === "continue_medium"
            ? "Callback do botao Continuar sprint recebido."
            : normalizedAction === "continue_full"
              ? "Callback do botao Concluir bloco todo recebido."
              : "Callback do botao Proximo passo recebido.";

        await sendChunkedMarkdown(ctx, callbackText);
        await executeActionPrompt(
          ctx,
          locale,
          buildFinalResponseContinuePrompt(record.text, level),
          "continue",
          {
            queueLabel: labelText,
            startedMessageText: `${labelText}. Pedido enviado ao Codex. Vou te mostrando o andamento aqui.`
          }
        );
        return;
      }

      if (normalizedAction === "autopilot") {
        await sendChunkedMarkdown(
          ctx,
          "Callback do botao Piloto automatico recebido."
        );
        await executeActionPrompt(
          ctx,
          locale,
          buildFinalResponseAutopilotPrompt(record.text),
          "continue",
          {
            queueLabel: "Botao Piloto automatico acionado",
            startedMessageText:
              "Botao Piloto automatico acionado. Pedido enviado ao Codex. Vou te mostrando o andamento aqui."
          }
        );
        return;
      }

      if (normalizedAction === "autopilot_arm") {
        await sendChunkedMarkdown(ctx, "Callback do botao Piloto x3 recebido.");
        ptyManager.setSpecialAutopilot(ctx.chat.id, 3);
        const result = await executeActionPrompt(
          ctx,
          locale,
          buildFinalResponseAutopilotPrompt(record.text),
          "continue",
          {
            queueLabel: "Botao Piloto x3 acionado",
            queueOnBusy: false,
            startedMessageText:
              "Botao Piloto x3 acionado. Piloto armado e pedido enviado ao Codex. Vou te mostrando o andamento aqui."
          }
        );

        if (result?.started) {
          const nextStatus = ptyManager.consumeSpecialAutopilotStep(
            ctx.chat.id
          );
          await sendChunkedMarkdown(
            ctx,
            t(locale, "autopilotLoopTriggered", {
              remaining: nextStatus.remainingResponses
            })
          );
        }
        return;
      }

      if (normalizedAction === "meeting" || normalizedAction === "review") {
        await executeActionPrompt(
          ctx,
          locale,
          buildFinalResponseMeetingPrompt(record.text),
          "planning"
        );
        return;
      }

      if (normalizedAction === "organize") {
        const workdir = ptyManager.getStatus(ctx.chat.id).workdir;
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
