import path from "node:path";
import { createHash } from "node:crypto";
import type {
  ProjectSkillStatus,
  SkillAssessment,
  SkillDraft,
  SkillPromotionDestination,
  SkillPromotionResult
} from "./skillPromotionService.js";

export type MemoryKind =
  | "decision"
  | "rule"
  | "procedure"
  | "exception"
  | "fact"
  | "task_state"
  | "skill_candidate"
  | "noise";

export type DurableMemoryKind = Exclude<
  MemoryKind,
  "noise" | "skill_candidate"
>;
export type MemoryStage =
  | "recent_context"
  | "durable_memory"
  | "skill_candidate"
  | "real_skill";

export type MemoryScope = "repo" | "subsystem" | "task";

export type MemoryIntent =
  | "auto"
  | "status"
  | "planning"
  | "implementation"
  | "debug"
  | "continue"
  | "repo_control"
  | "trivial";

export type MemoryConfidence = "none" | "low" | "medium" | "high";

export interface MemoryReference {
  type: "file" | "command" | "test" | "operator" | "assistant";
  value: string;
}

export interface MemorySourceDescriptor {
  type: "runtime" | "operator" | "telegram" | "file";
  detail: string;
}

export interface MemoryEntry {
  id: string;
  createdAt: string;
  project: string;
  scope: MemoryScope;
  kind: MemoryKind;
  stage?: MemoryStage;
  title: string;
  summary: string;
  evidence: MemoryReference;
  tags: string[];
  supersedes: string[];
  confidence: number;
  source: MemorySourceDescriptor;
}

export interface MemoryCandidate {
  id: string;
  createdAt: string;
  workdir: string;
  project: string;
  scope: MemoryScope;
  kind: MemoryKind;
  stage?: MemoryStage;
  baseKind: DurableMemoryKind;
  title: string;
  summary: string;
  evidence: MemoryReference;
  tags: string[];
  confidence: number;
  source: MemorySourceDescriptor;
  reasoning: string[];
  promptText?: string | null;
  destination?: SkillPromotionDestination;
  autoPromote?: boolean;
  skillAssessment?: SkillAssessment | null;
  skillDraft?: SkillDraft | null;
}

export interface MemoryWriteProposal {
  id: string;
  createdAt: string;
  workdir: string;
  candidateId: string;
  destination: SkillPromotionDestination;
  entry: MemoryEntry;
  reason: string;
  skillDraft?: SkillDraft | null;
}

export interface RetrievalOperationalContext {
  projectName?: string | null;
  currentObjective?: string | null;
  nextEligibleBlock?: string | null;
  latestClosedBlock?: string | null;
}

export interface MemoryQuery {
  workdir: string;
  prompt: string;
  intent?: MemoryIntent;
  maxEntries?: number;
  operationalContext?: RetrievalOperationalContext | null;
}

export interface MemoryPacket {
  workdir: string;
  currentObjective: string | null;
  latestClosedBlock: string | null;
  nextEligibleBlock: string | null;
  tacticalNotes: string[];
  relevantMemory: MemoryEntry[];
  sources: string[];
  confidence: MemoryConfidence;
  usedOperationalState: boolean;
}

export interface MemoryCaptureInput {
  workdir: string;
  text: string;
  source: MemorySourceDescriptor;
  evidence: MemoryReference;
  promptText?: string | null;
  kind?: MemoryKind;
  scope?: MemoryScope;
}

export interface FinalizedResponseCaptureResult {
  candidate: MemoryCandidate | null;
  message: string | null;
  promotionResult?: SkillPromotionResult | null;
  projectSkillStatus?: ProjectSkillStatus | null;
}

export interface MemoryQueryResult {
  entries: MemoryEntry[];
  sources: string[];
  confidence: MemoryConfidence;
}

export interface ProjectMemoryServiceOptions {
  globalMemoriesRoot?: string | null;
}

export interface BuildRetrievalQueryInput {
  prompt: string;
  intent?: MemoryIntent;
  operationalContext?: RetrievalOperationalContext | null;
}

export const STRUCTURED_MEMORY_PREFIXES = [
  "Decision:",
  "Rule:",
  "Procedure:",
  "Exception:",
  "Task state:"
] as const;

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "project",
  "current",
  "status",
  "next",
  "block",
  "using",
  "para",
  "com",
  "que",
  "uma",
  "mais",
  "isso",
  "este",
  "esta",
  "de",
  "do",
  "da",
  "dos",
  "das",
  "por",
  "sem",
  "nos",
  "nas",
  "como"
]);

const MOJIBAKE_FRAGMENTS = ["Ã", "Â", "â", "ï¿½"];

export function normalizeWhitespace(value: string): string {
  return String(value || "")
    .replace(/\r/g, "")
    .trim();
}

export function normalizeAscii(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      normalizeAscii(value)
        .split(/[^a-z0-9_./-]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
        .filter((token) => !STOPWORDS.has(token))
    )
  );
}

export function firstSentence(value: string, maxLength = 96): string {
  const compact = normalizeWhitespace(value).replace(/\s+/g, " ");
  if (!compact) return "";
  const sentence = compact.split(/(?<=[.!?])\s+/)[0] || compact;
  return sentence.length <= maxLength
    ? sentence
    : `${sentence.slice(0, maxLength - 3).trimEnd()}...`;
}

export function compactPacketText(value: string, maxLength = 88): string {
  const compact = normalizeWhitespace(value).replace(/\s+/g, " ");
  if (!compact) return "";
  return compact.length <= maxLength
    ? compact
    : `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}

export function createDeterministicId(...parts: string[]): string {
  return createHash("sha1").update(parts.join("\n")).digest("hex").slice(0, 16);
}

function countSubstringOccurrences(value: string, fragment: string): number {
  if (!fragment) return 0;
  let count = 0;
  let offset = 0;
  while (offset < value.length) {
    const next = value.indexOf(fragment, offset);
    if (next === -1) break;
    count += 1;
    offset = next + fragment.length;
  }
  return count;
}

export function looksLikeSevereMojibake(value: string): boolean {
  const compact = normalizeWhitespace(value).replace(/\s+/g, " ");
  if (!compact) return false;
  const markerCount = MOJIBAKE_FRAGMENTS.reduce(
    (total, fragment) => total + countSubstringOccurrences(compact, fragment),
    0
  );
  return markerCount >= 3;
}

export function inferMemoryKind(text: string): {
  kind: DurableMemoryKind | "noise";
  reasoning: string[];
} {
  const normalized = normalizeAscii(text);
  const reasoning: string[] = [];

  if (!normalized || normalized.length < 18) {
    return {
      kind: "noise",
      reasoning: ["Text is too short to become durable memory."]
    };
  }

  if (
    /\b(decid|decision|escolh|approved|aprovad|we will|vamos usar)\b/i.test(
      normalized
    )
  ) {
    reasoning.push("Contains decision language.");
    return { kind: "decision", reasoning };
  }

  if (
    /\b(always|never|must|nao use|nao fazer|do not|prefer|sempre)\b/i.test(
      normalized
    )
  ) {
    reasoning.push("Contains stable rule language.");
    return { kind: "rule", reasoning };
  }

  if (
    /\b(step|steps|run |execute|command|proced|primeiro|depois|then|use o comando)\b/i.test(
      normalized
    )
  ) {
    reasoning.push("Looks like a procedure or repeatable command flow.");
    return { kind: "procedure", reasoning };
  }

  if (
    /\b(except|unless|only if|apenas se|somente se|exceto)\b/i.test(normalized)
  ) {
    reasoning.push("Describes an exception or guardrail.");
    return { kind: "exception", reasoning };
  }

  if (
    /\b(sprint|bloco|current objective|next step|pendente|pending|closed|concluid|in progress|handoff)\b/i.test(
      normalized
    )
  ) {
    reasoning.push("Describes active project state.");
    return { kind: "task_state", reasoning };
  }

  reasoning.push("Useful fact with reusable project context.");
  return { kind: "fact", reasoning };
}

export function inferTags(text: string, limit = 6): string[] {
  return tokenize(text).slice(0, limit);
}

export function scoreKind(kind: MemoryKind, intent: MemoryIntent): number {
  const matrix: Record<MemoryIntent, Partial<Record<MemoryKind, number>>> = {
    auto: {
      decision: 20,
      rule: 18,
      procedure: 16,
      task_state: 16,
      fact: 10,
      exception: 12
    },
    status: {
      task_state: 22,
      decision: 14,
      fact: 12,
      rule: 8,
      procedure: 6,
      exception: 10
    },
    planning: {
      decision: 20,
      rule: 18,
      procedure: 16,
      task_state: 14,
      exception: 12,
      fact: 10
    },
    implementation: {
      procedure: 20,
      rule: 18,
      decision: 16,
      exception: 14,
      task_state: 12,
      fact: 8
    },
    debug: {
      exception: 20,
      rule: 18,
      procedure: 12,
      fact: 12,
      decision: 10,
      task_state: 8
    },
    continue: {
      task_state: 20,
      procedure: 16,
      decision: 14,
      rule: 14,
      exception: 10,
      fact: 8
    },
    repo_control: {},
    trivial: {}
  };

  return matrix[intent]?.[kind] || 0;
}

export function scoreRecency(createdAt: string): number {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return 0;
  const ageHours = Math.max(0, (Date.now() - created) / (1000 * 60 * 60));
  if (ageHours < 24) return 12;
  if (ageHours < 24 * 7) return 8;
  if (ageHours < 24 * 30) return 4;
  return 1;
}

function operationalMatchBoost(
  entryTokens: string[],
  value: string | null | undefined,
  boost: number
): number {
  if (!value) return 0;
  const contextTokens = tokenize(value);
  if (!contextTokens.length) return 0;
  return contextTokens.some((token) => entryTokens.includes(token)) ? boost : 0;
}

export function scoreEntry(
  entry: MemoryEntry,
  input: {
    queryTokens: string[];
    intent: MemoryIntent;
    operationalContext?: RetrievalOperationalContext | null;
  }
): number {
  if (entry.kind === "noise") return Number.NEGATIVE_INFINITY;

  const combined = `${entry.title} ${entry.summary} ${entry.tags.join(" ")}`;
  const entryTokens = tokenize(combined);
  const overlap = input.queryTokens.filter((token) =>
    entryTokens.includes(token)
  );
  const titleMatch = input.queryTokens.filter((token) =>
    tokenize(entry.title).includes(token)
  ).length;
  const operationalContext = input.operationalContext || null;
  const objectiveBoost = operationalMatchBoost(
    entryTokens,
    operationalContext?.currentObjective,
    8
  );
  const nextStepBoost = operationalMatchBoost(
    entryTokens,
    operationalContext?.nextEligibleBlock,
    8
  );
  const scopeBoost =
    entry.scope === "repo" ? 4 : entry.scope === "subsystem" ? 2 : 0;
  const taskStateAligned =
    entry.kind === "task_state" && (objectiveBoost > 0 || nextStepBoost > 0);
  const recency = taskStateAligned
    ? scoreRecency(entry.createdAt) * 2
    : scoreRecency(entry.createdAt);
  const summaryPenalty =
    path
      .basename(extractSourcePath(entry.source?.detail || ""))
      .toLowerCase() === "memory_summary.md"
      ? -4
      : 0;

  return (
    scoreKind(entry.kind, input.intent) +
    recency +
    overlap.length * 10 +
    titleMatch * 6 +
    scopeBoost +
    Math.min(16, objectiveBoost + nextStepBoost) +
    Math.round((entry.confidence || 0) * 10) +
    summaryPenalty
  );
}

export function inferCandidateStage(candidate: {
  kind: MemoryKind;
  baseKind?: DurableMemoryKind;
  destination?: SkillPromotionDestination;
  stage?: MemoryStage;
}): MemoryStage {
  if (candidate.stage) {
    return candidate.stage;
  }
  if (candidate.kind === "skill_candidate") {
    return "skill_candidate";
  }
  if ((candidate.baseKind || candidate.kind) === "task_state") {
    return "recent_context";
  }
  return "durable_memory";
}

export function inferEntryStage(entry: {
  kind: MemoryKind;
  destination?: SkillPromotionDestination;
  stage?: MemoryStage;
}): MemoryStage {
  if (entry.stage) {
    return entry.stage;
  }
  if (entry.destination && entry.destination !== "memory") {
    return "real_skill";
  }
  return "durable_memory";
}

export function stageStrength(stage: MemoryStage): number {
  switch (stage) {
    case "recent_context":
      return 1;
    case "durable_memory":
      return 2;
    case "skill_candidate":
      return 3;
    case "real_skill":
      return 4;
    default:
      return 0;
  }
}

export function confidenceFromScore(score: number): MemoryConfidence {
  if (score <= 0) return "none";
  if (score < 20) return "low";
  if (score < 40) return "medium";
  return "high";
}

export function toDurableMemoryKind(
  kind: MemoryKind | DurableMemoryKind
): DurableMemoryKind {
  switch (kind) {
    case "decision":
    case "rule":
    case "procedure":
    case "exception":
    case "fact":
    case "task_state":
      return kind;
    default:
      return "procedure";
  }
}

export function summarizeCandidateText(normalizedText: string): {
  summary: string;
  title: string;
} {
  const summary =
    normalizedText.length <= 260
      ? normalizedText
      : `${normalizedText.slice(0, 257).trimEnd()}...`;
  return {
    summary,
    title: firstSentence(summary)
  };
}

export function extractSourcePath(detail: string): string {
  return String(detail || "").split(" :: ")[0] || "";
}

export function isPathInside(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(rootPath, targetPath);
  return (
    Boolean(relative) &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

export function buildRetrievalQuery({
  prompt,
  intent = "auto",
  operationalContext
}: BuildRetrievalQueryInput): string {
  const components = [
    prompt,
    operationalContext?.projectName || "",
    operationalContext?.currentObjective || "",
    operationalContext?.nextEligibleBlock || "",
    operationalContext?.latestClosedBlock || "",
    intent,
    "project status sprint progress risks commands handoff next block"
  ];

  return components
    .map((value) => normalizeWhitespace(String(value || "")))
    .filter(Boolean)
    .join(" ");
}

export function hasExplicitMemoryCaptureIntent(
  promptText: string | null | undefined
): boolean {
  const normalized = normalizeAscii(promptText || "");
  if (!normalized) return false;
  return (
    /(^|[\s/])(remember|memorize|memorizar|guarda|guardar)\b/.test(
      normalized
    ) ||
    /\/memory\s+remember\b/.test(normalized) ||
    /\b(promove|promover|promote|turn)\b.+\b(skill)\b/.test(normalized) ||
    /\bvirar skill\b/.test(normalized) ||
    /\bisso tem que virar skill\b/.test(normalized)
  );
}

export function extractStructuredMemoryLine(
  text: string | null | undefined
): string | null {
  const lines = normalizeWhitespace(text || "").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (
      STRUCTURED_MEMORY_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
    ) {
      return trimmed;
    }
  }
  return null;
}
