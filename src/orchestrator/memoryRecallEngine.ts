import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildRetrievalQuery,
  compactPacketText,
  confidenceFromScore,
  createDeterministicId,
  extractSourcePath,
  firstSentence,
  inferEntryStage,
  inferTags,
  isPathInside,
  normalizeAscii,
  normalizeWhitespace,
  scoreEntry,
  type DurableMemoryKind,
  type MemoryEntry,
  type MemoryPacket,
  type MemoryQuery,
  type MemoryQueryResult,
  type ProjectMemoryServiceOptions,
  type RetrievalOperationalContext
} from "./memoryContracts.js";
import {
  readOperationalRecoveryFile,
  resolveOperationalRecoverySources,
  type OperationalRecoveryTarget
} from "./operationalRecoverySources.js";

interface OperationalCurrentBlockStatus {
  name: string | null;
  status: string | null;
  conclusion: string | null;
  currentObjective: string | null;
  nextStep: string | null;
}

interface OperationalContextSnapshot extends RetrievalOperationalContext {
  tacticalNotes: string[];
  sources: string[];
  usedOperationalState: boolean;
}

interface ParsedSummaryRecord {
  section: string;
  index: number;
  kind: DurableMemoryKind;
  text: string;
  confidence: number;
}

interface ParsedRegistrySection {
  name: string;
  kind: DurableMemoryKind;
  items: string[];
}

interface ParsedRegistryGroup {
  title: string;
  scope: string;
  appliesTo: string;
  keywords: string;
  sections: ParsedRegistrySection[];
}

type ParsedGlobalMemorySource =
  | {
      kind: "summary";
      records: ParsedSummaryRecord[];
    }
  | {
      kind: "registry";
      groups: ParsedRegistryGroup[];
    };

interface GlobalMemoryCacheEntry {
  mtimeMs: number;
  parsed: ParsedGlobalMemorySource;
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
    name: unwrapInlineCodeValue(
      extractBulletValue(lines, ["nome:", "bloco_atual:"])
    ),
    status: unwrapInlineCodeValue(extractBulletValue(lines, "status:")),
    conclusion: unwrapInlineCodeValue(
      extractBulletValue(lines, ["conclusao:", "veredito:"])
    ),
    currentObjective: unwrapInlineCodeValue(
      extractBulletValue(lines, "objetivo_atual:")
    ),
    nextStep: unwrapInlineCodeValue(
      extractBulletValue(lines, [
        "proximo_passo_indicado:",
        "proximo_passo_seguro:"
      ])
    )
  };
}

function unwrapInlineCodeValue(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^`(.+)`$/);
  return match?.[1]?.trim() || trimmed;
}

function isCompletedCurrentBlockStatus(
  status: OperationalCurrentBlockStatus | null
): boolean {
  const statusText = normalizeAscii(
    [status?.status, status?.conclusion].filter(Boolean).join(" ")
  );
  return /\b(100%|concluido|complete|completed|done|closed|fechado)\b/i.test(
    statusText
  );
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export class MemoryRecallEngine {
  private readonly globalMemoryCache = new Map<
    string,
    GlobalMemoryCacheEntry
  >();

  constructor(private readonly options: ProjectMemoryServiceOptions = {}) {}

  buildRetrievalQuery(input: {
    prompt: string;
    intent?: MemoryQuery["intent"];
    operationalContext?: RetrievalOperationalContext | null;
  }): string {
    return buildRetrievalQuery(input);
  }

  shouldUseMemory(
    prompt: string,
    intent: MemoryQuery["intent"] = "auto"
  ): boolean {
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
    createdAt: string;
  }): MemoryEntry {
    const sourceDetail = `${input.sourcePath} :: ${input.sourceLabel} :: ${input.section}`;
    return {
      id: `global-${createDeterministicId(
        input.sourcePath,
        input.section,
        String(input.index),
        input.summary
      )}`,
      createdAt: input.createdAt,
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

  async readOperationalContext(
    workdir: string
  ): Promise<OperationalContextSnapshot> {
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
    const latestClosedBlock =
      currentBlockStatus?.name &&
      isCompletedCurrentBlockStatus(currentBlockStatus)
        ? currentBlockStatus.name
        : extractLatestClosedBlock(activeContent, handoffContent);
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
      projectName:
        extractFirstUsefulLine(extractSectionLines(projectContent, "Name")) ||
        path.basename(workdir),
      currentObjective,
      latestClosedBlock,
      nextEligibleBlock,
      tacticalNotes,
      sources: recoverySources.sources,
      usedOperationalState: recoverySources.sources.length > 0
    };
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

  private async readNdjson(
    targetPath: string,
    validator: (value: unknown) => value is MemoryEntry
  ): Promise<MemoryEntry[]> {
    if (!(await pathExists(targetPath))) {
      return [];
    }

    const raw = await fs.readFile(targetPath, "utf8");
    const entries: MemoryEntry[] = [];

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

  async readLedgerEntries(workdir: string): Promise<MemoryEntry[]> {
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

  private parseSummarySource(markdown: string): ParsedSummaryRecord[] {
    const profile = extractParagraphItems(
      extractSectionLines(markdown, "User Profile")
    ).map((text, index) => ({
      section: "User Profile",
      index,
      kind: "fact" as const,
      text,
      confidence: 0.78
    }));
    const preferences = extractBulletItems(
      extractSectionLines(markdown, "User preferences")
    ).map((text, index) => ({
      section: "User preferences",
      index,
      kind: "rule" as const,
      text,
      confidence: 0.74
    }));
    const tips = extractBulletItems(
      extractSectionLines(markdown, "General Tips")
    ).map((text, index) => ({
      section: "General Tips",
      index,
      kind: "procedure" as const,
      text,
      confidence: 0.74
    }));

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

  private parseRegistrySource(markdown: string): ParsedRegistryGroup[] {
    const groups = extractTaskGroups(markdown);
    return groups.map((group) => {
      const scope = group.content.match(/^scope:\s*(.+)$/im)?.[1]?.trim() || "";
      const appliesTo =
        group.content.match(/^applies_to:\s*(.+)$/im)?.[1]?.trim() || "";
      const keywords = collectSubheadingBulletItems(
        group.content,
        "keywords"
      ).join(" ");
      const sections: ParsedRegistrySection[] = [
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

      return {
        title: group.title,
        scope,
        appliesTo,
        keywords,
        sections
      };
    });
  }

  private async loadParsedGlobalSource(
    sourcePath: string
  ): Promise<GlobalMemoryCacheEntry | null> {
    if (!(await pathExists(sourcePath))) {
      return null;
    }

    const stats = await fs.stat(sourcePath);
    const cached = this.globalMemoryCache.get(sourcePath);
    if (cached && cached.mtimeMs === stats.mtimeMs) {
      return cached;
    }

    const content = await fs.readFile(sourcePath, "utf8");
    const parsed: ParsedGlobalMemorySource =
      path.basename(sourcePath).toLowerCase() === "memory_summary.md"
        ? { kind: "summary", records: this.parseSummarySource(content) }
        : { kind: "registry", groups: this.parseRegistrySource(content) };
    const entry = {
      mtimeMs: stats.mtimeMs,
      parsed
    } satisfies GlobalMemoryCacheEntry;
    this.globalMemoryCache.set(sourcePath, entry);
    return entry;
  }

  async readGlobalMemoryEntries(workdir: string): Promise<MemoryEntry[]> {
    const registryPath = this.globalMemoryRegistryPath();
    const summaryPath = this.globalMemorySummaryPath();
    const entries: MemoryEntry[] = [];

    for (const sourcePath of [registryPath, summaryPath].filter(
      (value): value is string => Boolean(value)
    )) {
      const cached = await this.loadParsedGlobalSource(sourcePath);
      if (!cached) {
        continue;
      }
      const createdAt = new Date(cached.mtimeMs).toISOString();

      if (cached.parsed.kind === "summary") {
        for (const record of cached.parsed.records) {
          entries.push(
            this.buildGlobalMemoryEntry({
              sourcePath,
              sourceLabel: "global",
              section: record.section,
              index: record.index,
              workdir,
              title: firstSentence(record.text),
              summary: record.text,
              kind: record.kind,
              confidence: record.confidence,
              context: record.section,
              createdAt
            })
          );
        }
        continue;
      }

      for (const group of cached.parsed.groups) {
        if (!this.taskGroupAppliesToWorkdir(workdir, group.appliesTo)) {
          continue;
        }
        const context = [
          group.title,
          group.scope,
          group.appliesTo,
          group.keywords
        ]
          .filter(Boolean)
          .join(" ");
        for (const section of group.sections) {
          section.items.forEach((text, index) => {
            entries.push(
              this.buildGlobalMemoryEntry({
                sourcePath,
                sourceLabel: "global",
                section: `${group.title} / ${section.name}`,
                index,
                workdir,
                title: `${group.title}: ${firstSentence(text, 72)}`,
                summary: text,
                kind: section.kind,
                confidence: 0.88,
                context,
                createdAt
              })
            );
          });
        }
      }
    }

    return entries;
  }

  async queryMemory({
    workdir,
    prompt,
    intent = "auto",
    maxEntries = 5,
    operationalContext = null
  }: MemoryQuery): Promise<MemoryQueryResult> {
    const resolvedWorkdir = path.resolve(workdir);
    const queryTokens = normalizeWhitespace(prompt)
      ? this.buildRetrievalQuery({
          prompt,
          intent,
          operationalContext
        })
      : "";
    const retrievalTokens = queryTokens ? inferTags(queryTokens, 64) : [];
    const [localEntries, globalEntries] = await Promise.all([
      this.readLedgerEntries(resolvedWorkdir),
      this.readGlobalMemoryEntries(resolvedWorkdir)
    ]);
    const localIds = new Set(localEntries.map((entry) => entry.id));
    const scored = [...localEntries, ...globalEntries]
      .map((entry) => ({
        entry,
        score: scoreEntry(entry, {
          queryTokens: retrievalTokens,
          intent,
          operationalContext
        })
      }))
      .filter((item) => Number.isFinite(item.score) && item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, maxEntries));

    const sources = Array.from(
      new Set(
        scored.flatMap(({ entry }) => {
          if (localIds.has(entry.id)) {
            return [this.ledgerPath(resolvedWorkdir)];
          }
          const sourcePath = extractSourcePath(entry.source?.detail || "");
          return sourcePath ? [sourcePath] : [];
        })
      )
    );

    return {
      entries: scored.map((item) => item.entry),
      sources,
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
      maxEntries,
      operationalContext: {
        projectName: operational.projectName || path.basename(resolvedWorkdir),
        currentObjective: operational.currentObjective,
        nextEligibleBlock: operational.nextEligibleBlock,
        latestClosedBlock: operational.latestClosedBlock
      }
    });

    if (!operational.usedOperationalState && !queryResult.entries.length) {
      return null;
    }

    return {
      workdir: resolvedWorkdir,
      currentObjective: operational.currentObjective || null,
      latestClosedBlock: operational.latestClosedBlock || null,
      nextEligibleBlock: operational.nextEligibleBlock || null,
      tacticalNotes: operational.tacticalNotes,
      relevantMemory: queryResult.entries,
      sources: [...operational.sources, ...queryResult.sources],
      confidence: queryResult.confidence,
      usedOperationalState: operational.usedOperationalState
    };
  }

  renderMemoryPacket(packet: MemoryPacket, prompt: string): string {
    const describeEntryOrigin = (
      entry: MemoryEntry
    ): "workspace" | "global" => {
      return entry.id.startsWith("global-") ? "global" : "workspace";
    };

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
              `  - [${describeEntryOrigin(entry)}|${entry.stage || inferEntryStage(entry)}|${entry.kind}] ${compactPacketText(entry.title || entry.summary, 88)}`
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
      .map((source) =>
        isPathInside(packet.workdir, source)
          ? path.relative(packet.workdir, source) || path.basename(source)
          : source
      )
      .join(", ")}`;
  }

  async readOperationalFile(
    workdir: string,
    target: OperationalRecoveryTarget
  ): Promise<string | null> {
    const resolvedWorkdir = path.resolve(workdir);
    return readOperationalRecoveryFile(resolvedWorkdir, target);
  }
}
