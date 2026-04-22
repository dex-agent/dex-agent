import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  SkillPromotionService,
  type ProjectSkillStatus,
  type SkillAssessment,
  type SkillDraft,
  type SkillPromotionDestination,
  type SkillPromotionResult
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

export interface MemoryQuery {
  workdir: string;
  prompt: string;
  intent?: MemoryIntent;
  maxEntries?: number;
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

function compactPacketText(value: string, maxLength = 88): string {
  const compact = normalizeWhitespace(value).replace(/\s+/g, " ");
  if (!compact) return "";
  return compact.length <= maxLength
    ? compact
    : `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}

function compactSectionLines(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("## "));
}

function extractSectionLines(markdown: string, heading: string): string[] {
  const normalized = normalizeWhitespace(markdown);
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const target = heading.trim().toLowerCase();
  const startIndex = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${target}`
  );
  if (startIndex === -1) {
    return [];
  }

  const section: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("## ")) {
      break;
    }
    section.push(line);
  }

  return section;
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

function scoreKind(kind: MemoryKind, intent: MemoryIntent): number {
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

function scoreRecency(createdAt: string): number {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return 0;
  const ageHours = Math.max(0, (Date.now() - created) / (1000 * 60 * 60));
  if (ageHours < 24) return 12;
  if (ageHours < 24 * 7) return 8;
  if (ageHours < 24 * 30) return 4;
  return 1;
}

function scoreEntry(
  entry: MemoryEntry,
  queryTokens: string[],
  intent: MemoryIntent
): number {
  if (entry.kind === "noise") return Number.NEGATIVE_INFINITY;

  const combined = `${entry.title} ${entry.summary} ${entry.tags.join(" ")}`;
  const entryTokens = tokenize(combined);
  const overlap = queryTokens.filter((token) => entryTokens.includes(token));
  const titleMatch = queryTokens.filter((token) =>
    tokenize(entry.title).includes(token)
  ).length;

  return (
    scoreKind(entry.kind, intent) +
    scoreRecency(entry.createdAt) +
    overlap.length * 10 +
    titleMatch * 6 +
    Math.round((entry.confidence || 0) * 10)
  );
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

function confidenceFromScore(score: number): MemoryConfidence {
  if (score <= 0) return "none";
  if (score < 20) return "low";
  if (score < 40) return "medium";
  return "high";
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

  constructor(
    private readonly skillPromotionService = new SkillPromotionService()
  ) {}

  getSkillPromotionService(): SkillPromotionService {
    return this.skillPromotionService;
  }

  private ledgerPath(workdir: string): string {
    return path.join(workdir, ".agents", "MEMORY.ndjson");
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

  private activePath(workdir: string): string {
    return path.join(workdir, ".agents", "ACTIVE.md");
  }

  private indexPath(workdir: string): string {
    return path.join(workdir, "INDEX.md");
  }

  private projectPath(workdir: string): string {
    return path.join(workdir, ".agents", "PROJECT.md");
  }

  private handoffPath(workdir: string): string {
    return path.join(workdir, ".agents", "HANDOFF.md");
  }

  private napkinPath(workdir: string): string {
    return path.join(workdir, ".codex", "napkin.md");
  }

  private async readOperationalContext(workdir: string): Promise<{
    currentObjective: string | null;
    latestClosedBlock: string | null;
    nextEligibleBlock: string | null;
    tacticalNotes: string[];
    sources: string[];
    usedOperationalState: boolean;
  }> {
    const indexPath = this.indexPath(workdir);
    const projectPath = this.projectPath(workdir);
    const activePath = this.activePath(workdir);
    const handoffPath = this.handoffPath(workdir);
    const napkinPath = this.napkinPath(workdir);

    const hasIndex = await pathExists(indexPath);
    const hasProject = await pathExists(projectPath);
    const hasActive = await pathExists(activePath);
    const hasHandoff = await pathExists(handoffPath);
    const hasNapkin = await pathExists(napkinPath);

    const indexContent = hasIndex ? await fs.readFile(indexPath, "utf8") : "";
    const projectContent = hasProject
      ? await fs.readFile(projectPath, "utf8")
      : "";
    const activeContent = hasActive
      ? await fs.readFile(activePath, "utf8")
      : "";
    const handoffContent = hasHandoff
      ? await fs.readFile(handoffPath, "utf8")
      : "";
    const napkinContent = hasNapkin
      ? await fs.readFile(napkinPath, "utf8")
      : "";

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
    const sources = [
      ...(hasIndex ? [indexPath] : []),
      ...(hasProject ? [projectPath] : []),
      ...(hasActive ? [activePath] : []),
      ...(hasHandoff ? [handoffPath] : []),
      ...(hasNapkin ? [napkinPath] : [])
    ];

    return {
      currentObjective,
      latestClosedBlock,
      nextEligibleBlock,
      tacticalNotes,
      sources,
      usedOperationalState: sources.length > 0
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
        const parsed = JSON.parse(trimmed) as unknown;
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
    return entries.map((entry) => this.normalizeCandidate(entry));
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
      this.readLedgerEntries(workdir)
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
    if (intent === "repo_control" || intent === "trivial") {
      return false;
    }

    if (intent !== "auto") {
      return true;
    }

    const normalized = normalizeAscii(prompt);
    if (!normalized) return false;
    if (
      /^(ls|dir|pwd|whoami|which|list files|show files|help|menu|status)$/i.test(
        normalized
      )
    ) {
      return false;
    }

    return true;
  }

  async queryMemory({
    workdir,
    prompt,
    intent = "auto",
    maxEntries = 5
  }: MemoryQuery): Promise<MemoryQueryResult> {
    const resolvedWorkdir = path.resolve(workdir);
    const queryTokens = tokenize(prompt);
    const entries = await this.readLedgerEntries(resolvedWorkdir);
    const scored = entries
      .map((entry) => ({
        entry,
        score: scoreEntry(entry, queryTokens, intent)
      }))
      .filter((item) => Number.isFinite(item.score) && item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, maxEntries));

    return {
      entries: scored.map((item) => item.entry),
      sources: scored.length ? [this.ledgerPath(resolvedWorkdir)] : [],
      confidence: confidenceFromScore(scored[0]?.score || 0)
    };
  }

  async buildMemoryPacket({
    workdir,
    prompt,
    intent = "auto",
    maxEntries = 5
  }: MemoryQuery): Promise<MemoryPacket | null> {
    const resolvedWorkdir = path.resolve(workdir);
    if (!this.shouldUseMemory(prompt, intent)) {
      return null;
    }

    const operational = await this.readOperationalContext(resolvedWorkdir);
    const queryResult = await this.queryMemory({
      workdir: resolvedWorkdir,
      prompt,
      intent,
      maxEntries
    });

    if (!operational.usedOperationalState && !queryResult.entries.length) {
      return null;
    }

    return {
      workdir: resolvedWorkdir,
      currentObjective: operational.currentObjective,
      latestClosedBlock: operational.latestClosedBlock,
      nextEligibleBlock: operational.nextEligibleBlock,
      tacticalNotes: operational.tacticalNotes,
      relevantMemory: queryResult.entries,
      sources: [...operational.sources, ...queryResult.sources],
      confidence: queryResult.confidence,
      usedOperationalState: operational.usedOperationalState
    };
  }

  renderMemoryPacket(packet: MemoryPacket, prompt: string): string {
    const lines: string[] = [
      "Authoritative project memory packet:",
      packet.currentObjective
        ? `- current objective: ${packet.currentObjective}`
        : "- current objective: not recorded",
      packet.latestClosedBlock
        ? `- latest closed block: ${packet.latestClosedBlock}`
        : "- latest closed block: not recorded",
      packet.nextEligibleBlock
        ? `- next eligible block: ${packet.nextEligibleBlock}`
        : "- next eligible block: not recorded"
    ];

    if (packet.tacticalNotes.length) {
      lines.push("- tactical notes:");
      lines.push(
        ...packet.tacticalNotes
          .slice(0, 2)
          .map((line) => `  - ${line.replace(/^- /, "")}`)
      );
    }

    if (packet.relevantMemory.length) {
      lines.push("- durable memory:");
      lines.push(
        ...packet.relevantMemory
          .slice(0, 3)
          .map(
            (entry) =>
              `  - [${entry.stage || inferEntryStage(entry)}|${entry.kind}] ${compactPacketText(entry.title || entry.summary, 88)}`
          )
      );
    }
    lines.push(
      "",
      "Use this project memory only when it is relevant. If the request conflicts with this memory, say so explicitly.",
      "If this compact packet is insufficient, inspect the underlying project files before acting.",
      "",
      "User request:",
      prompt
    );

    return lines.join("\n");
  }

  buildSourceDisclosure(packet: MemoryPacket): string | null {
    if (!packet.sources.length) return null;
    return `Using project memory from: ${packet.sources
      .slice(0, 3)
      .map(
        (source) =>
          path.relative(packet.workdir, source) || path.basename(source)
      )
      .join(", ")}`;
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
    const candidate = await this.captureCandidate({
      workdir: input.workdir,
      text: input.text,
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
    target: "index" | "project" | "active" | "handoff" | "napkin" | "ledger"
  ): Promise<string | null> {
    const resolvedWorkdir = path.resolve(workdir);
    const targetPath =
      target === "index"
        ? this.indexPath(resolvedWorkdir)
        : target === "project"
          ? this.projectPath(resolvedWorkdir)
          : target === "active"
            ? this.activePath(resolvedWorkdir)
            : target === "handoff"
              ? this.handoffPath(resolvedWorkdir)
              : target === "napkin"
                ? this.napkinPath(resolvedWorkdir)
                : this.ledgerPath(resolvedWorkdir);

    if (!(await pathExists(targetPath))) {
      return null;
    }

    return fs.readFile(targetPath, "utf8");
  }
}
