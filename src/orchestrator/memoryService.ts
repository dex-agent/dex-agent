import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  SkillPromotionService,
  type ProjectSkillStatus,
  type SkillAssessment,
  type SkillDraft,
  type SkillPromotionDestination,
  type SkillPromotionResult
} from "./skillPromotionService.js";
import { MemoryRecallEngine } from "./memoryRecallEngine.js";
import {
  resolveOperationalRecoverySources,
  type OperationalRecoveryTarget
} from "./operationalRecoverySources.js";
import {
  buildRetrievalQuery as buildSharedRetrievalQuery,
  extractStructuredMemoryLine,
  hasExplicitMemoryCaptureIntent
} from "./memoryContracts.js";

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

export interface MemoryQuery {
  workdir: string;
  prompt: string;
  intent?: MemoryIntent;
  maxEntries?: number;
  operationalContext?: {
    projectName?: string | null;
    currentObjective?: string | null;
    nextEligibleBlock?: string | null;
    latestClosedBlock?: string | null;
  } | null;
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

interface ProjectMemoryServiceOptions {
  globalMemoriesRoot?: string | null;
}

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

function normalizeWhitespace(value: string): string {
  return String(value || "")
    .replace(/\r/g, "")
    .trim();
}

function normalizeAscii(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function tokenize(value: string): string[] {
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

function firstSentence(value: string, maxLength = 96): string {
  const compact = normalizeWhitespace(value).replace(/\s+/g, " ");
  if (!compact) return "";
  const sentence = compact.split(/(?<=[.!?])\s+/)[0] || compact;
  return sentence.length <= maxLength
    ? sentence
    : `${sentence.slice(0, maxLength - 3).trimEnd()}...`;
}

function createDeterministicId(...parts: string[]): string {
  return createHash("sha1").update(parts.join("\n")).digest("hex").slice(0, 16);
}

const MOJIBAKE_FRAGMENTS = [
  "Ãƒ",
  "Ã†",
  "Ã¢",
  "Ã‚",
  "Â",
  "â€",
  "â€™",
  "â€œ",
  "â€\u009d",
  "â€“",
  "â€”",
  "â€¦",
  "�"
];

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

function looksLikeSevereMojibake(value: string): boolean {
  const compact = normalizeWhitespace(value).replace(/\s+/g, " ");
  if (!compact) return false;
  const markerCount = MOJIBAKE_FRAGMENTS.reduce(
    (total, fragment) => total + countSubstringOccurrences(compact, fragment),
    0
  );
  return markerCount >= 3;
}

function compactSectionLines(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("## "));
}

function extractHeadingLines(
  markdown: string,
  heading: string,
  prefixes: string[] = ["##"]
): string[] {
  const normalized = normalizeWhitespace(markdown);
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const target = heading.trim().toLowerCase();
  const startIndex = lines.findIndex((line) =>
    prefixes.some(
      (prefix) => line.trim().toLowerCase() === `${prefix} ${target}`
    )
  );
  if (startIndex === -1) {
    return [];
  }

  const section: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^#{2,3}\s/.test(line)) {
      break;
    }
    section.push(line);
  }

  return section;
}

function extractSectionLines(markdown: string, heading: string): string[] {
  return extractHeadingLines(markdown, heading, ["##"]);
}

function extractBulletItems(lines: string[]): string[] {
  const items: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current.length) {
        items.push(current.join(" ").trim());
        current = [];
      }
      continue;
    }
    if (/^#{2,3}\s/.test(trimmed)) {
      if (current.length) {
        items.push(current.join(" ").trim());
        current = [];
      }
      continue;
    }
    if (trimmed.startsWith("- ")) {
      if (current.length) {
        items.push(current.join(" ").trim());
      }
      current = [trimmed.slice(2).trim()];
      continue;
    }
    if (current.length) {
      current.push(trimmed);
    }
  }

  if (current.length) {
    items.push(current.join(" ").trim());
  }

  return items.filter(Boolean);
}

function extractParagraphItems(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current.length) {
        paragraphs.push(current.join(" ").trim());
        current = [];
      }
      continue;
    }
    if (/^#{2,3}\s/.test(trimmed) || trimmed.startsWith("- ")) {
      if (current.length) {
        paragraphs.push(current.join(" ").trim());
        current = [];
      }
      continue;
    }
    current.push(trimmed);
  }

  if (current.length) {
    paragraphs.push(current.join(" ").trim());
  }

  return paragraphs.filter(Boolean);
}

function collectSubheadingBulletItems(
  markdown: string,
  heading: string
): string[] {
  const normalized = normalizeWhitespace(markdown);
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const items: string[] = [];
  let insideTarget = false;
  let buffer: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^###\s+/i.test(trimmed)) {
      if (insideTarget && buffer.length) {
        items.push(...extractBulletItems(buffer));
        buffer = [];
      }
      insideTarget =
        normalizeAscii(trimmed.replace(/^###\s+/, "").trim()) ===
        normalizeAscii(heading);
      continue;
    }
    if (insideTarget && /^##\s+/i.test(trimmed)) {
      if (buffer.length) {
        items.push(...extractBulletItems(buffer));
        buffer = [];
      }
      insideTarget = false;
      continue;
    }
    if (insideTarget) {
      buffer.push(line);
    }
  }

  if (insideTarget && buffer.length) {
    items.push(...extractBulletItems(buffer));
  }

  return items;
}

function extractTaskGroups(markdown: string): Array<{
  title: string;
  content: string;
}> {
  const normalized = normalizeWhitespace(markdown);
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const groups: Array<{ title: string; content: string }> = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("# Task Group:")) {
      if (currentTitle) {
        groups.push({
          title: currentTitle,
          content: currentLines.join("\n")
        });
      }
      currentTitle = line.slice("# Task Group:".length).trim();
      currentLines = [line];
      continue;
    }
    if (currentTitle) {
      currentLines.push(line);
    }
  }

  if (currentTitle) {
    groups.push({
      title: currentTitle,
      content: currentLines.join("\n")
    });
  }

  return groups;
}

function extractBulletValue(
  lines: string[],
  prefix: string | string[]
): string | null {
  const prefixes = Array.isArray(prefix) ? prefix : [prefix];
  const normalizedPrefixes = prefixes.map((item) => ({
    raw: item,
    normalized: normalizeAscii(item.trim())
  }));
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) continue;
    const body = trimmed.slice(2).trim();
    const bodyProbe = normalizeAscii(body);
    const matched = normalizedPrefixes.find((item) =>
      bodyProbe.startsWith(item.normalized)
    );
    if (!matched) continue;
    return body.slice(matched.raw.length).trim().replace(/\.$/, "") || null;
  }
  return null;
}

function extractSectionFallbackValue(lines: string[]): string | null {
  const compact = compactSectionLines(lines)
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
  return compact[0] || null;
}

function extractFirstUsefulLine(lines: string[]): string | null {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const withoutBullet = trimmed.replace(/^- /, "").trim();
    if (!withoutBullet) continue;
    return withoutBullet.replace(/\.$/, "") || null;
  }
  return null;
}

function extractBlocksFromLines(lines: string[]): string[] {
  const blocks: string[] = [];
  for (const line of lines) {
    if (!/fechad/i.test(line)) continue;
    const matches = line.matchAll(/`(\d{2,4}-\d{2,4})`/g);
    for (const match of matches) {
      if (match[1]) blocks.push(match[1]);
    }
  }
  return blocks;
}

function extractClosedResiduals(lines: string[]): string[] {
  const residuals: string[] = [];
  for (const line of lines) {
    const match = line.match(/Residual fechado no vivo:\s*`([^`]+)`/i);
    if (match?.[1]) {
      residuals.push(match[1]);
    }
  }
  return residuals;
}

function extractLatestClosedBlock(
  activeContent: string,
  handoffContent: string
): string | null {
  const activeObjective = extractSectionLines(
    activeContent,
    "Current objective"
  );
  const latestCompleted = extractSectionLines(
    handoffContent,
    "Latest completed"
  );
  const currentProof = extractSectionLines(activeContent, "Current proof");
  const lastClosedResidual = extractSectionLines(
    activeContent,
    "Last closed residual"
  );
  const blocks = [
    ...extractBlocksFromLines(activeObjective),
    ...extractBlocksFromLines(latestCompleted),
    ...extractBlocksFromLines(currentProof)
  ];
  if (blocks.length > 0) {
    return blocks.at(-1) || null;
  }
  return extractClosedResiduals(lastClosedResidual).at(-1) || null;
}

function extractNextEligibleBlock(markdown: string): string | null {
  const directMatch = markdown.match(/Proximo bloco elegivel:\s*`([^`]+)`/i);
  if (directMatch?.[1]) return directMatch[1];
  const handoffMatch = markdown.match(
    /Proximo bloco elegivel agora:\s*-?\s*`([^`]+)`/i
  );
  if (handoffMatch?.[1]) return handoffMatch[1];
  const slotMatch = markdown.match(
    /Proximo slot elegivel(?: no historico de front-end)?:\s*`([^`]+)`/i
  );
  if (slotMatch?.[1]) return slotMatch[1];
  return null;
}

interface OperationalCurrentBlockStatus {
  name: string | null;
  currentObjective: string | null;
  nextStep: string | null;
}

function extractCurrentBlockStatus(
  handoffContent: string
): OperationalCurrentBlockStatus | null {
  const lines = compactSectionLines(
    extractSectionLines(handoffContent, "Current block status")
  );
  if (!lines.length) {
    return null;
  }

  return {
    name: extractBulletValue(lines, "nome:"),
    currentObjective: extractBulletValue(lines, "objetivo_atual:"),
    nextStep: extractBulletValue(lines, "proximo_passo_indicado:")
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function inferMemoryKind(text: string): {
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

function inferTags(text: string, limit = 6): string[] {
  return tokenize(text).slice(0, limit);
}

function inferCandidateStage(candidate: {
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

function isWeakRuntimeCandidate(
  input: MemoryCaptureInput,
  title: string,
  summary: string
): boolean {
  if (
    input.source.type !== "runtime" ||
    input.source.detail !== "finalized_codex_response"
  ) {
    return false;
  }

  const normalizedTitle = normalizeAscii(title).trim();
  const probe = normalizedTitle.replace(/[`"'()[\]{}:;,.!?*_]+/g, " ").trim();
  const summaryProbe = normalizeAscii(summary);
  if (!probe) return true;

  if (/^\[[^\]\r\n]+\|[^\]\r\n]+\]/.test(normalizedTitle)) {
    return true;
  }

  if (
    /^\[?error\]?/i.test(title) ||
    /\bunder-development features enabled: memories\b/i.test(summaryProbe)
  ) {
    return true;
  }

  if (
    /^(usei|entendi|achei|continuei|encontrei|corrigi|detectei|promovi|revisei|fechei|acompanhei|apliquei|ajustei|validei|confirmei|retomei|montei|rodei|executei|gerei)\b/i.test(
      probe
    )
  ) {
    return true;
  }

  if (
    /^(sim|nao\b|a implementacao concluiu\b|foco atual\b|tema da reuniao\b|veredito\b|pensamento\b|planejamento\b|construir\b|revisar\b|testar\b|organizar\b)\b/i.test(
      probe
    )
  ) {
    return true;
  }

  return /^(fechamos|conclui|concluimos|nesta passada|o que ficou provado|visao do|visao da|fechamos a sequencia|sequencia ate o sprint|resumo honesto|vou\b|agora vou\b|o que apareceu\b|o que surgiu\b|o que ficou\b)\b/i.test(
    probe
  );
}

function shouldDropCorruptedRecentCandidate(
  candidate: MemoryCandidate
): boolean {
  return (
    inferCandidateStage(candidate) === "recent_context" &&
    (looksLikeSevereMojibake(candidate.title) ||
      looksLikeSevereMojibake(candidate.summary))
  );
}

function inferEntryStage(entry: {
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

function stageStrength(stage: MemoryStage): number {
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

function toDurableMemoryKind(
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

function summarizeCandidateText(normalizedText: string): {
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

export class ProjectMemoryService {
  private static readonly MAX_CANDIDATES = 20;
  private static readonly MAX_PROPOSALS = 20;
  private readonly recallEngine: MemoryRecallEngine;

  constructor(
    private readonly skillPromotionService = new SkillPromotionService(),
    private readonly options: ProjectMemoryServiceOptions = {}
  ) {
    this.recallEngine = new MemoryRecallEngine(options);
  }

  getSkillPromotionService(): SkillPromotionService {
    return this.skillPromotionService;
  }

  buildRetrievalQuery(input: {
    prompt: string;
    intent?: MemoryIntent;
    operationalContext?: {
      projectName?: string | null;
      currentObjective?: string | null;
      nextEligibleBlock?: string | null;
      latestClosedBlock?: string | null;
    } | null;
  }): string {
    return buildSharedRetrievalQuery(input);
  }

  private ledgerPath(workdir: string): string {
    return path.join(workdir, ".agents", "MEMORY.ndjson");
  }

  private globalMemoriesRoot(): string | null {
    if (this.options.globalMemoriesRoot === null) {
      return null;
    }
    if (this.options.globalMemoriesRoot) {
      return this.options.globalMemoriesRoot;
    }
    const codexHome = normalizeWhitespace(process.env.CODEX_HOME || "");
    if (codexHome) {
      return path.join(codexHome, "memories");
    }
    return path.join(os.homedir(), ".codex", "memories");
  }

  private globalMemoryRegistryPath(): string | null {
    const root = this.globalMemoriesRoot();
    return root ? path.join(root, "MEMORY.md") : null;
  }

  private globalMemorySummaryPath(): string | null {
    const root = this.globalMemoriesRoot();
    return root ? path.join(root, "memory_summary.md") : null;
  }

  private inboxDir(workdir: string): string {
    return path.join(workdir, ".agents", "INBOX");
  }

  private candidatesPath(workdir: string): string {
    return path.join(this.inboxDir(workdir), "candidates.ndjson");
  }

  private proposalsPath(workdir: string): string {
    return path.join(this.inboxDir(workdir), "proposals.ndjson");
  }

  private buildGlobalMemoryEntry(input: {
    sourcePath: string;
    sourceLabel: string;
    section: string;
    index: number;
    workdir: string;
    title: string;
    summary: string;
    kind: DurableMemoryKind;
    confidence: number;
    context?: string;
  }): MemoryEntry {
    const sourceDetail = `${input.sourcePath} :: ${input.sourceLabel} :: ${input.section}`;
    return {
      id: `global-${createDeterministicId(
        input.sourcePath,
        input.section,
        String(input.index),
        input.summary
      )}`,
      createdAt: new Date().toISOString(),
      project: path.basename(input.workdir),
      scope: "repo",
      kind: input.kind,
      stage: "durable_memory",
      title: input.title,
      summary: input.summary,
      evidence: {
        type: "file",
        value: `${input.sourcePath}#${input.section}`
      },
      tags: inferTags(
        `${input.title} ${input.summary} ${input.context || ""} ${path.basename(input.workdir)}`
      ),
      supersedes: [],
      confidence: input.confidence,
      source: {
        type: "file",
        detail: sourceDetail
      }
    };
  }

  private async readOperationalContext(workdir: string): Promise<{
    currentObjective: string | null;
    latestClosedBlock: string | null;
    nextEligibleBlock: string | null;
    tacticalNotes: string[];
    sources: string[];
    usedOperationalState: boolean;
  }> {
    const recoverySources = await resolveOperationalRecoverySources(workdir);
    const { indexPath, projectPath, activePath, handoffPath, napkinPath } =
      recoverySources.paths;

    const [
      indexContent,
      projectContent,
      activeContent,
      handoffContent,
      napkinContent
    ] = await Promise.all([
      fs.readFile(indexPath, "utf8").catch(() => ""),
      fs.readFile(projectPath, "utf8").catch(() => ""),
      fs.readFile(activePath, "utf8").catch(() => ""),
      fs.readFile(handoffPath, "utf8").catch(() => ""),
      fs.readFile(napkinPath, "utf8").catch(() => "")
    ]);

    const currentObjectiveLines = extractSectionLines(
      activeContent,
      "Current objective"
    );
    const currentBlockStatus = extractCurrentBlockStatus(handoffContent);
    const currentObjective =
      currentBlockStatus?.currentObjective ||
      extractBulletValue(extractSectionLines(indexContent, "Agora"), [
        "Objetivo atual:",
        "Current objective:"
      ]) ||
      extractFirstUsefulLine(
        extractSectionLines(projectContent, "Current focus")
      ) ||
      extractBulletValue(currentObjectiveLines, [
        "Frente principal atual:",
        "Frente ativa:",
        "Objetivo atual:"
      ]) ||
      extractSectionFallbackValue(currentObjectiveLines);
    const latestClosedBlock = extractLatestClosedBlock(
      activeContent,
      handoffContent
    );
    const nextEligibleBlock =
      currentBlockStatus?.nextStep ||
      extractNextEligibleBlock(activeContent) ||
      extractNextEligibleBlock(handoffContent) ||
      extractBulletValue(extractSectionLines(indexContent, "Agora"), [
        "Proximo passo indicado:",
        "Next step:"
      ]);
    const tacticalNotes = compactSectionLines(napkinContent.split("\n"))
      .filter((line) => !line.startsWith("#"))
      .slice(0, 3);
    return {
      currentObjective,
      latestClosedBlock,
      nextEligibleBlock,
      tacticalNotes,
      sources: recoverySources.sources,
      usedOperationalState: recoverySources.sources.length > 0
    };
  }

  private async readLedgerEntries(workdir: string): Promise<MemoryEntry[]> {
    const ledgerPath = this.ledgerPath(workdir);
    const entries = await this.readNdjson(
      ledgerPath,
      this.isValidEntry.bind(this)
    );

    const supersededIds = new Set<string>();
    for (const entry of entries) {
      for (const id of entry.supersedes || []) {
        supersededIds.add(id);
      }
    }

    return entries
      .filter((entry) => !supersededIds.has(entry.id))
      .map((entry) => ({
        ...entry,
        stage: inferEntryStage(entry)
      }));
  }

  private buildSummaryEntries(
    workdir: string,
    sourcePath: string,
    sourceMtime: Date,
    markdown: string
  ): MemoryEntry[] {
    const createdAt = sourceMtime.toISOString();
    const buildEntry = (
      section: string,
      index: number,
      kind: DurableMemoryKind,
      text: string
    ) =>
      ({
        ...this.buildGlobalMemoryEntry({
          sourcePath,
          sourceLabel: "global",
          section,
          index,
          workdir,
          title: firstSentence(text),
          summary: text,
          kind,
          confidence: section === "User Profile" ? 0.78 : 0.74,
          context: section
        }),
        createdAt
      }) satisfies MemoryEntry;

    const profile = extractParagraphItems(
      extractSectionLines(markdown, "User Profile")
    ).map((text, index) => buildEntry("User Profile", index, "fact", text));
    const preferences = extractBulletItems(
      extractSectionLines(markdown, "User preferences")
    ).map((text, index) => buildEntry("User preferences", index, "rule", text));
    const tips = extractBulletItems(
      extractSectionLines(markdown, "General Tips")
    ).map((text, index) =>
      buildEntry("General Tips", index, "procedure", text)
    );

    return [...profile, ...preferences, ...tips];
  }

  private taskGroupAppliesToWorkdir(
    workdir: string,
    appliesTo: string
  ): boolean {
    const probe = normalizeAscii(appliesTo);
    if (!probe) return false;
    const basename = normalizeAscii(path.basename(workdir));
    const normalizedWorkdir = normalizeAscii(workdir);
    return (
      probe.includes("cross-repo") ||
      probe.includes("cross-workflow") ||
      (basename ? probe.includes(basename) : false) ||
      (normalizedWorkdir ? probe.includes(normalizedWorkdir) : false)
    );
  }

  private buildRegistryEntries(
    workdir: string,
    sourcePath: string,
    sourceMtime: Date,
    markdown: string
  ): MemoryEntry[] {
    const createdAt = sourceMtime.toISOString();
    const groups = extractTaskGroups(markdown);
    const entries: MemoryEntry[] = [];

    for (const group of groups) {
      const scope = group.content.match(/^scope:\s*(.+)$/im)?.[1]?.trim() || "";
      const appliesTo =
        group.content.match(/^applies_to:\s*(.+)$/im)?.[1]?.trim() || "";
      if (!this.taskGroupAppliesToWorkdir(workdir, appliesTo)) {
        continue;
      }

      const keywords = collectSubheadingBulletItems(
        group.content,
        "keywords"
      ).join(" ");
      const context = [group.title, scope, appliesTo, keywords]
        .filter(Boolean)
        .join(" ");
      const sections: Array<{
        name: string;
        kind: DurableMemoryKind;
        items: string[];
      }> = [
        {
          name: "User preferences",
          kind: "rule",
          items: extractBulletItems(
            extractSectionLines(group.content, "User preferences")
          )
        },
        {
          name: "Reusable knowledge",
          kind: "fact",
          items: extractBulletItems(
            extractSectionLines(group.content, "Reusable knowledge")
          )
        },
        {
          name: "Failures and how to do differently",
          kind: "procedure",
          items: extractBulletItems(
            extractSectionLines(
              group.content,
              "Failures and how to do differently"
            )
          )
        }
      ];

      for (const section of sections) {
        section.items.forEach((text, index) => {
          entries.push({
            ...this.buildGlobalMemoryEntry({
              sourcePath,
              sourceLabel: "global",
              section: `${group.title} / ${section.name}`,
              index,
              workdir,
              title: `${group.title}: ${firstSentence(text, 72)}`,
              summary: text,
              kind: section.kind,
              confidence: 0.88,
              context
            }),
            createdAt
          });
        });
      }
    }

    return entries;
  }

  private async readGlobalMemoryEntries(
    workdir: string
  ): Promise<MemoryEntry[]> {
    const registryPath = this.globalMemoryRegistryPath();
    const summaryPath = this.globalMemorySummaryPath();
    const entries: MemoryEntry[] = [];

    for (const sourcePath of [registryPath, summaryPath].filter(
      (value): value is string => Boolean(value)
    )) {
      if (!(await pathExists(sourcePath))) {
        continue;
      }
      const [content, stats] = await Promise.all([
        fs.readFile(sourcePath, "utf8"),
        fs.stat(sourcePath)
      ]);
      if (path.basename(sourcePath).toLowerCase() === "memory_summary.md") {
        entries.push(
          ...this.buildSummaryEntries(workdir, sourcePath, stats.mtime, content)
        );
      } else {
        entries.push(
          ...this.buildRegistryEntries(
            workdir,
            sourcePath,
            stats.mtime,
            content
          )
        );
      }
    }

    return entries;
  }

  private isValidEntry(entry: unknown): entry is MemoryEntry {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as MemoryEntry;
    return Boolean(
      candidate.id &&
      candidate.createdAt &&
      candidate.project &&
      candidate.scope &&
      candidate.kind &&
      candidate.title &&
      candidate.summary &&
      candidate.evidence?.type &&
      candidate.evidence?.value &&
      Array.isArray(candidate.tags) &&
      Array.isArray(candidate.supersedes) &&
      typeof candidate.confidence === "number" &&
      candidate.source?.type &&
      candidate.source?.detail
    );
  }

  private isValidCandidate(candidate: unknown): candidate is MemoryCandidate {
    if (!candidate || typeof candidate !== "object") return false;
    const entry = candidate as MemoryCandidate;
    return Boolean(
      entry.id &&
      entry.createdAt &&
      entry.workdir &&
      entry.project &&
      entry.scope &&
      entry.kind &&
      entry.title &&
      entry.summary &&
      entry.evidence?.type &&
      entry.evidence?.value &&
      Array.isArray(entry.tags) &&
      typeof entry.confidence === "number" &&
      entry.source?.type &&
      entry.source?.detail &&
      Array.isArray(entry.reasoning)
    );
  }

  private normalizeCandidate(candidate: MemoryCandidate): MemoryCandidate {
    const baseKind =
      candidate.kind === "skill_candidate"
        ? candidate.baseKind || "procedure"
        : (candidate.kind as DurableMemoryKind);
    const assessment = candidate.skillAssessment || null;
    const destination =
      candidate.destination ||
      assessment?.destination ||
      (candidate.kind === "skill_candidate" ? "project_skill" : "memory");

    return {
      ...candidate,
      stage: inferCandidateStage(candidate),
      baseKind,
      promptText: candidate.promptText || null,
      destination,
      autoPromote: Boolean(candidate.autoPromote),
      skillAssessment: assessment,
      skillDraft: candidate.skillDraft || null
    };
  }

  private isValidProposal(proposal: unknown): proposal is MemoryWriteProposal {
    if (!proposal || typeof proposal !== "object") return false;
    const entry = proposal as MemoryWriteProposal;
    return Boolean(
      entry.id &&
      entry.createdAt &&
      entry.workdir &&
      entry.candidateId &&
      typeof entry.reason === "string" &&
      this.isValidEntry(entry.entry)
    );
  }

  private normalizeProposal(
    proposal: MemoryWriteProposal
  ): MemoryWriteProposal {
    return {
      ...proposal,
      destination: proposal.destination || "memory",
      skillDraft: proposal.skillDraft || null
    };
  }

  private async readNdjson<T>(
    targetPath: string,
    validator: (value: unknown) => value is T
  ): Promise<T[]> {
    if (!(await pathExists(targetPath))) {
      return [];
    }

    const raw = await fs.readFile(targetPath, "utf8");
    const entries: T[] = [];

    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed.replace(/^\uFEFF/, "")) as unknown;
        if (validator(parsed)) {
          entries.push(parsed);
        }
      } catch {
        continue;
      }
    }

    return entries;
  }

  private async writeNdjson(
    targetPath: string,
    entries: unknown[]
  ): Promise<void> {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const payload = entries.length
      ? `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`
      : "";
    await fs.writeFile(targetPath, payload, "utf8");
  }

  private async readCandidates(workdir: string): Promise<MemoryCandidate[]> {
    const entries = await this.readNdjson(
      this.candidatesPath(path.resolve(workdir)),
      this.isValidCandidate.bind(this)
    );
    return entries
      .map((entry) => this.normalizeCandidate(entry))
      .filter((entry) => !shouldDropCorruptedRecentCandidate(entry));
  }

  private async writeCandidates(
    workdir: string,
    entries: MemoryCandidate[]
  ): Promise<void> {
    await this.writeNdjson(
      this.candidatesPath(path.resolve(workdir)),
      entries.slice(0, ProjectMemoryService.MAX_CANDIDATES)
    );
  }

  private async readProposals(workdir: string): Promise<MemoryWriteProposal[]> {
    const entries = await this.readNdjson(
      this.proposalsPath(path.resolve(workdir)),
      this.isValidProposal.bind(this)
    );
    return entries.map((entry) => this.normalizeProposal(entry));
  }

  private async writeProposals(
    workdir: string,
    entries: MemoryWriteProposal[]
  ): Promise<void> {
    await this.writeNdjson(
      this.proposalsPath(path.resolve(workdir)),
      entries.slice(0, ProjectMemoryService.MAX_PROPOSALS)
    );
  }

  private async resolveCandidate(
    workdir: string,
    selector: string | number
  ): Promise<MemoryCandidate | null> {
    const candidates = await this.readCandidates(workdir);
    if (!candidates.length) return null;

    if (typeof selector === "number" || /^\d+$/.test(String(selector))) {
      const index = typeof selector === "number" ? selector : Number(selector);
      return candidates[index] || null;
    }

    return (
      candidates.find((candidate) => candidate.id === String(selector)) || null
    );
  }

  private async resolveProposal(
    workdir: string,
    selector: string | number
  ): Promise<MemoryWriteProposal | null> {
    const proposals = await this.readProposals(workdir);
    if (!proposals.length) return null;

    if (typeof selector === "number" || /^\d+$/.test(String(selector))) {
      const index = typeof selector === "number" ? selector : Number(selector);
      return proposals[index] || null;
    }

    return (
      proposals.find((proposal) => proposal.id === String(selector)) || null
    );
  }

  private scoreCandidateSimilarity(
    title: string,
    summary: string,
    against: { title: string; summary: string; tags?: string[] }
  ): number {
    const leftTokens = tokenize(`${title} ${summary}`);
    const rightTokens = tokenize(
      `${against.title} ${against.summary} ${(against.tags || []).join(" ")}`
    );
    return leftTokens.filter((token) => rightTokens.includes(token)).length;
  }

  private async countSimilarWorkflowMatches(
    workdir: string,
    title: string,
    summary: string
  ): Promise<number> {
    const [candidates, entries] = await Promise.all([
      this.readCandidates(workdir),
      this.recallEngine.readLedgerEntries(workdir)
    ]);

    const candidateMatches = candidates.filter(
      (candidate) =>
        this.scoreCandidateSimilarity(title, summary, candidate) >= 3
    ).length;
    const ledgerMatches = entries.filter(
      (entry) => this.scoreCandidateSimilarity(title, summary, entry) >= 3
    ).length;

    return candidateMatches + ledgerMatches;
  }

  private async buildCandidatePromotionContext(
    workdir: string,
    input: MemoryCaptureInput,
    classificationKind: DurableMemoryKind,
    title: string,
    summary: string
  ): Promise<{
    assessment: SkillAssessment;
    draft: SkillDraft | null;
    candidateKind: MemoryKind;
    baseKind: DurableMemoryKind;
    stage: MemoryStage;
  }> {
    const existingMatches = await this.countSimilarWorkflowMatches(
      workdir,
      title,
      summary
    );
    const projectName = path.basename(workdir);
    const assessment = this.skillPromotionService.assessCandidate({
      workdir,
      projectName,
      title,
      summary,
      promptText: input.promptText,
      evidenceValue: input.evidence.value,
      existingMatches
    });
    const draft = assessment.shouldSuggestSkill
      ? this.skillPromotionService.buildDraft({
          workdir,
          projectName,
          title,
          summary,
          promptText: input.promptText,
          evidenceValue: input.evidence.value,
          sourceDetail: input.source.detail,
          tags: inferTags(`${title} ${summary}`),
          assessment
        })
      : null;
    const candidateKind =
      assessment.shouldSuggestSkill && draft
        ? "skill_candidate"
        : classificationKind;
    const baseKind = toDurableMemoryKind(classificationKind);
    const stage = inferCandidateStage({
      kind: candidateKind,
      baseKind,
      destination: assessment.destination
    });

    return { assessment, draft, candidateKind, baseKind, stage };
  }

  private buildNewCandidate(
    workdir: string,
    input: MemoryCaptureInput,
    classification: { kind: MemoryKind; reasoning: string[] },
    payload: {
      title: string;
      summary: string;
      assessment: SkillAssessment;
      draft: SkillDraft | null;
      candidateKind: MemoryKind;
      baseKind: DurableMemoryKind;
      stage: MemoryStage;
    }
  ): MemoryCandidate {
    return {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      workdir,
      project: path.basename(workdir),
      scope: input.scope || "repo",
      kind: payload.candidateKind,
      stage: payload.stage,
      baseKind: payload.baseKind,
      title: payload.title,
      summary: payload.summary,
      evidence: input.evidence,
      tags: inferTags(`${payload.title} ${payload.summary}`),
      confidence:
        input.kind && input.kind !== "noise"
          ? 0.9
          : classification.kind === "fact"
            ? 0.65
            : 0.8,
      source: input.source,
      reasoning: [...classification.reasoning, ...payload.assessment.rationale],
      promptText: input.promptText || null,
      destination: payload.assessment.destination,
      autoPromote: payload.assessment.shouldAutoPromote,
      skillAssessment: payload.assessment,
      skillDraft: payload.draft
    };
  }

  private mergeCandidateUpdate(
    existing: MemoryCandidate,
    payload: {
      assessment: SkillAssessment;
      draft: SkillDraft | null;
      candidateKind: MemoryKind;
      stage: MemoryStage;
    }
  ): MemoryCandidate {
    const existingStage = inferCandidateStage(existing);
    const upgradedStage =
      stageStrength(payload.stage) > stageStrength(existingStage)
        ? payload.stage
        : existingStage;

    return this.normalizeCandidate({
      ...existing,
      kind:
        payload.candidateKind === "skill_candidate"
          ? "skill_candidate"
          : existing.kind,
      stage: upgradedStage,
      destination:
        existing.destination && existing.destination !== "memory"
          ? existing.destination
          : payload.assessment.destination,
      autoPromote:
        Boolean(existing.autoPromote) || payload.assessment.shouldAutoPromote,
      skillAssessment:
        stageStrength(payload.stage) > stageStrength(existingStage)
          ? payload.assessment
          : existing.skillAssessment || payload.assessment,
      skillDraft: existing.skillDraft || payload.draft || null,
      reasoning: Array.from(
        new Set([...existing.reasoning, ...payload.assessment.rationale])
      )
    });
  }

  shouldUseMemory(prompt: string, intent: MemoryIntent = "auto"): boolean {
    return this.recallEngine.shouldUseMemory(prompt, intent);
  }

  async queryMemory({
    workdir,
    prompt,
    intent = "auto",
    maxEntries = 5,
    operationalContext
  }: MemoryQuery): Promise<MemoryQueryResult> {
    return this.recallEngine.queryMemory({
      workdir,
      prompt,
      intent,
      maxEntries,
      operationalContext
    });
  }

  async buildMemoryPacket({
    workdir,
    prompt,
    intent = "auto",
    maxEntries = 5
  }: MemoryQuery): Promise<MemoryPacket | null> {
    return this.recallEngine.buildMemoryPacket({
      workdir,
      prompt,
      intent,
      maxEntries
    });
  }

  renderMemoryPacket(packet: MemoryPacket, prompt: string): string {
    return this.recallEngine.renderMemoryPacket(packet, prompt);
  }

  buildSourceDisclosure(packet: MemoryPacket): string | null {
    return this.recallEngine.buildSourceDisclosure(packet);
  }

  async captureCandidate(
    input: MemoryCaptureInput
  ): Promise<MemoryCandidate | null> {
    const workdir = path.resolve(input.workdir);
    const normalizedText = normalizeWhitespace(input.text).replace(/\s+/g, " ");
    const classification = input.kind
      ? { kind: input.kind, reasoning: ["Explicitly classified by caller."] }
      : inferMemoryKind(normalizedText);

    if (classification.kind === "noise") {
      return null;
    }

    const candidates = await this.readCandidates(workdir);
    const { summary, title } = summarizeCandidateText(normalizedText);
    if (isWeakRuntimeCandidate(input, title, summary)) {
      return null;
    }
    if (
      looksLikeSevereMojibake(normalizedText) ||
      looksLikeSevereMojibake(title) ||
      looksLikeSevereMojibake(summary)
    ) {
      return null;
    }
    const promotion = await this.buildCandidatePromotionContext(
      workdir,
      input,
      toDurableMemoryKind(classification.kind),
      title,
      summary
    );
    const existing = candidates.find(
      (candidate) =>
        normalizeAscii(candidate.title) === normalizeAscii(title) &&
        normalizeAscii(candidate.summary) === normalizeAscii(summary)
    );
    if (existing) {
      const merged = this.mergeCandidateUpdate(existing, promotion);
      const next = candidates.map((candidate) =>
        candidate.id === existing.id ? merged : candidate
      );
      await this.writeCandidates(workdir, next);
      return merged;
    }
    const candidate = this.buildNewCandidate(workdir, input, classification, {
      title,
      summary,
      ...promotion
    });

    candidates.unshift(candidate);
    await this.writeCandidates(workdir, candidates);
    return candidate;
  }

  async listCandidates(workdir: string): Promise<MemoryCandidate[]> {
    return this.readCandidates(path.resolve(workdir));
  }

  async discardCandidate(
    workdir: string,
    selector: string | number
  ): Promise<MemoryCandidate | null> {
    const resolvedWorkdir = path.resolve(workdir);
    const candidates = await this.readCandidates(resolvedWorkdir);
    const candidate = await this.resolveCandidate(resolvedWorkdir, selector);
    if (!candidate) return null;

    const next = candidates.filter((item) => item.id !== candidate.id);
    await this.writeCandidates(resolvedWorkdir, next);
    return candidate;
  }

  async getCandidate(
    workdir: string,
    selector: string | number
  ): Promise<MemoryCandidate | null> {
    return this.resolveCandidate(path.resolve(workdir), selector);
  }

  async explainCandidate(
    workdir: string,
    selector: string | number
  ): Promise<string | null> {
    const candidate = await this.resolveCandidate(workdir, selector);
    if (!candidate) return null;
    const reasons = candidate.reasoning.length
      ? candidate.reasoning.join(" ")
      : "Candidate was captured from runtime evidence.";
    const lines = [
      `Candidate ${candidate.id}`,
      `kind: ${candidate.kind}`,
      `stage: ${inferCandidateStage(candidate)}`,
      `base kind: ${candidate.baseKind}`,
      `title: ${candidate.title}`,
      `why it matters: ${reasons}`,
      `evidence: ${candidate.evidence.type} -> ${candidate.evidence.value}`
    ];
    if (inferCandidateStage(candidate) === "skill_candidate") {
      lines.push(`destination: ${candidate.destination || "review"}`);
      lines.push(`auto promote: ${candidate.autoPromote ? "yes" : "no"}`);
    }
    return lines.join("\n");
  }

  async proposePromotion(
    workdir: string,
    selector: string | number
  ): Promise<MemoryWriteProposal | null> {
    const resolvedWorkdir = path.resolve(workdir);
    const candidate = await this.resolveCandidate(resolvedWorkdir, selector);
    if (!candidate) return null;

    const proposals = await this.readProposals(resolvedWorkdir);
    const existing = proposals.find(
      (proposal) =>
        proposal.candidateId === candidate.id ||
        (normalizeAscii(proposal.entry.kind) ===
          normalizeAscii(candidate.kind) &&
          normalizeAscii(proposal.entry.title) ===
            normalizeAscii(candidate.title) &&
          normalizeAscii(proposal.entry.summary) ===
            normalizeAscii(candidate.summary))
    );
    if (existing) {
      return existing;
    }

    const proposal: MemoryWriteProposal = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      workdir: resolvedWorkdir,
      candidateId: candidate.id,
      destination: candidate.destination || "memory",
      entry: {
        id: `mem-${randomUUID()}`,
        createdAt: new Date().toISOString(),
        project: candidate.project,
        scope: candidate.scope,
        kind: candidate.baseKind,
        stage:
          candidate.destination && candidate.destination !== "memory"
            ? "real_skill"
            : "durable_memory",
        title: candidate.title,
        summary: candidate.summary,
        evidence: candidate.evidence,
        tags: [
          ...candidate.tags,
          ...(inferCandidateStage(candidate) === "skill_candidate"
            ? [
                "skill-promoted",
                `skill-destination:${candidate.destination || "review"}`
              ]
            : [])
        ],
        supersedes: [],
        confidence: candidate.confidence,
        source: candidate.source
      },
      reason: candidate.reasoning.join(" "),
      skillDraft: candidate.skillDraft || null
    };

    proposals.unshift(proposal);
    await this.writeProposals(resolvedWorkdir, proposals);
    return proposal;
  }

  async listProposals(workdir: string): Promise<MemoryWriteProposal[]> {
    return this.readProposals(path.resolve(workdir));
  }

  async cancelProposal(
    workdir: string,
    selector: string | number
  ): Promise<MemoryWriteProposal | null> {
    const resolvedWorkdir = path.resolve(workdir);
    const proposals = await this.readProposals(resolvedWorkdir);
    const proposal = await this.resolveProposal(resolvedWorkdir, selector);
    if (!proposal) return null;

    await this.writeProposals(
      resolvedWorkdir,
      proposals.filter((item) => item.id !== proposal.id)
    );
    return proposal;
  }

  async applyPromotion(
    workdir: string,
    selector: string | number
  ): Promise<{
    ok: boolean;
    entry?: MemoryEntry;
    reason?: "missing" | "duplicate" | "invalid";
    destination?: SkillPromotionDestination;
    skillPromotion?: SkillPromotionResult | null;
  }> {
    const resolvedWorkdir = path.resolve(workdir);
    const proposals = await this.readProposals(resolvedWorkdir);
    const proposal = await this.resolveProposal(resolvedWorkdir, selector);
    if (!proposal) {
      return { ok: false, reason: "missing" };
    }

    if (!this.isValidEntry(proposal.entry)) {
      return { ok: false, reason: "invalid" };
    }

    const existing = await this.readLedgerEntries(resolvedWorkdir);
    const duplicate = existing.find(
      (entry) =>
        normalizeAscii(entry.kind) === normalizeAscii(proposal.entry.kind) &&
        normalizeAscii(entry.title) === normalizeAscii(proposal.entry.title) &&
        normalizeAscii(entry.summary) === normalizeAscii(proposal.entry.summary)
    );
    if (duplicate) {
      await this.writeProposals(
        resolvedWorkdir,
        proposals.filter((item) => item.id !== proposal.id)
      );
      return { ok: false, reason: "duplicate", entry: duplicate };
    }

    let skillPromotion: SkillPromotionResult | null = null;
    if (proposal.destination !== "memory" && proposal.skillDraft) {
      skillPromotion = await this.skillPromotionService.promoteSkill(
        proposal.skillDraft
      );
    }

    const ledgerPath = this.ledgerPath(resolvedWorkdir);
    await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
    await fs.appendFile(
      ledgerPath,
      `${JSON.stringify(proposal.entry)}\n`,
      "utf8"
    );
    await this.writeProposals(
      resolvedWorkdir,
      proposals.filter((item) => item.id !== proposal.id)
    );
    await this.discardCandidate(resolvedWorkdir, proposal.candidateId);
    return {
      ok: true,
      entry: proposal.entry,
      destination: proposal.destination,
      skillPromotion
    };
  }

  async getProjectSkillStatus(workdir: string): Promise<ProjectSkillStatus> {
    const resolvedWorkdir = path.resolve(workdir);
    const pendingCandidates = (await this.listCandidates(resolvedWorkdir))
      .filter(
        (candidate) => inferCandidateStage(candidate) === "skill_candidate"
      )
      .map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        destination:
          candidate.destination && candidate.destination !== "memory"
            ? candidate.destination
            : null
      }));

    return this.skillPromotionService.listProjectSkillStatus(
      resolvedWorkdir,
      pendingCandidates
    );
  }

  async captureFinalizedResponse(input: {
    chatId: string | number;
    workdir: string;
    text: string;
    promptText?: string | null;
  }): Promise<FinalizedResponseCaptureResult> {
    const explicitCapture = hasExplicitMemoryCaptureIntent(input.promptText);
    const structuredMemoryLine = extractStructuredMemoryLine(input.text);

    if (!explicitCapture && !structuredMemoryLine) {
      return {
        candidate: null,
        message: null,
        projectSkillStatus: await this.getProjectSkillStatus(input.workdir)
      };
    }

    const candidate = await this.captureCandidate({
      workdir: input.workdir,
      text: explicitCapture ? input.text : structuredMemoryLine!,
      promptText: input.promptText,
      source: {
        type: "runtime",
        detail: "finalized_codex_response"
      },
      evidence: {
        type: "assistant",
        value: `finalized:${path.basename(input.workdir)}`
      }
    });

    if (!candidate) {
      return {
        candidate: null,
        message: null,
        projectSkillStatus: await this.getProjectSkillStatus(input.workdir)
      };
    }

    if (inferCandidateStage(candidate) !== "skill_candidate") {
      return {
        candidate,
        message: null,
        projectSkillStatus: await this.getProjectSkillStatus(input.workdir)
      };
    }

    if (candidate.autoPromote && candidate.skillDraft) {
      const proposal = await this.proposePromotion(input.workdir, candidate.id);
      const applied = proposal
        ? await this.applyPromotion(input.workdir, proposal.id)
        : { ok: false as const };
      const projectSkillStatus = await this.getProjectSkillStatus(
        input.workdir
      );
      if (!applied.ok) {
        return {
          candidate,
          message:
            "Detectei um fluxo repetivel forte, mas a promocao automatica nao conseguiu concluir agora. Use /inbox candidates para revisar.",
          projectSkillStatus
        };
      }

      const promotedLabel =
        applied.destination === "global_skill"
          ? "Promovi isto para skill global e espelhei no repo."
          : "Aprendi um novo procedimento de projeto.";
      const locationLines =
        applied.skillPromotion?.draft.destination === "global_skill"
          ? [
              `skill: ${applied.skillPromotion.draft.name}`,
              `vault: ${applied.skillPromotion.createdPaths[0] || "global skill root"}`,
              `repo: ${applied.skillPromotion.mirrorPaths[0] || "skills/"}`
            ]
          : [
              `skill: ${applied.skillPromotion?.draft.name || candidate.skillDraft.name}`,
              `repo: ${applied.skillPromotion?.createdPaths[0] || "skills/"}`
            ];

      return {
        candidate,
        message: [promotedLabel, ...locationLines].join("\n"),
        promotionResult: applied.skillPromotion,
        projectSkillStatus
      };
    }

    return {
      candidate,
      message: [
        "Isto ainda nao virou skill; ficou como candidate porque o sinal nao foi forte o bastante.",
        `candidate: ${candidate.id}`,
        `destino sugerido: ${candidate.destination || "review"}`,
        "Use /inbox candidates para revisar."
      ].join("\n"),
      projectSkillStatus: await this.getProjectSkillStatus(input.workdir)
    };
  }

  async readOperationalFile(
    workdir: string,
    target: OperationalRecoveryTarget
  ): Promise<string | null> {
    return this.recallEngine.readOperationalFile(workdir, target);
  }
}
