import fs from "node:fs/promises";
import path from "node:path";
import {
  createDeterministicId,
  firstSentence,
  inferMemoryKind,
  inferTags,
  normalizeWhitespace,
  type DurableMemoryKind,
  type MemoryEntry,
  type MemoryKind,
  type MemoryReference,
  type MemoryScope,
  type MemorySourceDescriptor
} from "./memoryContracts.js";

export type MemorySurfaceSeverity = "high" | "medium" | "low";

export interface MemorySurfaceFinding {
  severity: MemorySurfaceSeverity;
  code: string;
  message: string;
  filePath: string;
  line?: number;
  repoRoot?: string | null;
}

export interface MemoryLedgerAuditSummary {
  total: number;
  structured: number;
  legacy: number;
  invalid: number;
}

export interface RepoSurfaceAuditReport {
  repoRoot: string;
  findings: MemorySurfaceFinding[];
  ledger: MemoryLedgerAuditSummary;
}

export interface GlobalMemoryAuditReport {
  globalMemoryRoot: string;
  findings: MemorySurfaceFinding[];
}

export interface MemorySurfaceAuditReport {
  repoReports: RepoSurfaceAuditReport[];
  globalReport: GlobalMemoryAuditReport;
  findings: MemorySurfaceFinding[];
  counts: Record<MemorySurfaceSeverity, number>;
}

export interface AuditMemorySurfacesOptions {
  repoRoots: string[];
  globalMemoryRoot: string;
}

export interface MemorySurfaceNormalizationResult {
  write: boolean;
  repoResults: RepoSurfaceNormalizationResult[];
  globalResults: GlobalSurfaceNormalizationResult[];
  sprintArchiveResults: SprintArchiveResult[];
  changedFiles: string[];
}

export interface NormalizeMemorySurfacesOptions extends AuditMemorySurfacesOptions {
  write?: boolean;
  now?: Date;
}

export interface ArchiveCompletedSprintSurfacesOptions {
  repoRoots: string[];
  write?: boolean;
}

export interface RepoSurfaceNormalizationResult {
  repoRoot: string;
  changedFiles: string[];
  backups: string[];
  migratedEntries: number;
  preservedStructuredEntries: number;
  totalEntries: number;
}

export interface GlobalSurfaceNormalizationResult {
  filePath: string;
  changed: boolean;
}

export interface SprintArchiveMove {
  from: string;
  to: string;
}

export interface SprintArchiveResult {
  repoRoot: string;
  changedFiles: string[];
  movedFiles: SprintArchiveMove[];
  archivedEntries: number;
}

interface SprintIndexEntry {
  line: string;
  lineNumber: number;
  id: string;
  status: string;
  openPath: string;
}

interface MarkdownRule {
  relativePath: string;
  requiredPatterns: Array<{
    label: string;
    pattern: RegExp;
  }>;
}

interface LegacyMemoryRecord {
  who: string;
  what: string;
  when: string;
  context?: string;
}

interface ParsedLedgerLine {
  raw: string;
  lineNumber: number;
  kind: "structured" | "legacy" | "invalid";
  entry?: MemoryEntry;
  legacy?: LegacyMemoryRecord;
}

const REPO_MARKDOWN_RULES: MarkdownRule[] = [
  {
    relativePath: path.join(".agents", "PROJECT.md"),
    requiredPatterns: [
      { label: "# Project Identity", pattern: /^# Project Identity$/m },
      { label: "## Name", pattern: /^## Name$/m },
      { label: "## Purpose", pattern: /^## Purpose$/m }
    ]
  },
  {
    relativePath: path.join(".agents", "ACTIVE.md"),
    requiredPatterns: [
      { label: "# Active State", pattern: /^# Active State$/m },
      { label: "## Current objective", pattern: /^## Current objective$/m }
    ]
  },
  {
    relativePath: path.join(".agents", "HANDOFF.md"),
    requiredPatterns: [
      { label: "# Session Handoff", pattern: /^# Session Handoff$/m },
      {
        label: "## Restart protocol now",
        pattern: /^## Restart protocol now$/m
      }
    ]
  },
  {
    relativePath: path.join(".codex", "napkin.md"),
    requiredPatterns: [
      { label: "# Napkin do Projeto", pattern: /^# Napkin do Projeto$/m },
      {
        label: "## Regras de Curadoria",
        pattern: /^## Regras de Curadoria$/m
      }
    ]
  }
];

const GLOBAL_MARKDOWN_RULES: MarkdownRule[] = [
  {
    relativePath: "memory_summary.md",
    requiredPatterns: [
      { label: "## User Profile", pattern: /^## User Profile$/m },
      { label: "## User preferences", pattern: /^## User preferences$/m },
      { label: "## General Tips", pattern: /^## General Tips$/m }
    ]
  },
  {
    relativePath: "MEMORY.md",
    requiredPatterns: [
      { label: "# Task Group", pattern: /^# Task Group:/m },
      { label: "## Reusable knowledge", pattern: /^## Reusable knowledge$/m }
    ]
  }
];

const REPLACEMENT_CHAR = "\uFFFD";
const TARGETED_MOJIBAKE_REPLACEMENTS = new Map<string, string>([
  ["op��o", "opção"],
  ["resoluÃ§Ã£o", "resolução"],
  ["nÃ£o", "não"],
  ["sustentÃ¡vel", "sustentável"],
  ["reuniÃ£o", "reunião"],
  ["reutilizaÃ§Ã£o", "reutilização"],
  ["sessÃ£o", "sessão"],
  ["sessÃµes", "sessões"],
  ["faÃ§a", "faça"],
  ["aÃ§Ã£o", "ação"],
  ["AÃ§Ã£o", "Ação"],
  ["mÃ©todo", "método"],
  ["MÃ©todo", "Método"]
]);

function emptyLedgerSummary(): MemoryLedgerAuditSummary {
  return {
    total: 0,
    structured: 0,
    legacy: 0,
    invalid: 0
  };
}

function countBySeverity(
  findings: MemorySurfaceFinding[]
): Record<MemorySurfaceSeverity, number> {
  return findings.reduce(
    (accumulator, finding) => {
      accumulator[finding.severity] += 1;
      return accumulator;
    },
    { high: 0, medium: 0, low: 0 } satisfies Record<
      MemorySurfaceSeverity,
      number
    >
  );
}

function createFinding(
  severity: MemorySurfaceSeverity,
  code: string,
  message: string,
  filePath: string,
  extra: {
    line?: number;
    repoRoot?: string | null;
  } = {}
): MemorySurfaceFinding {
  return {
    severity,
    code,
    message,
    filePath,
    ...extra
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

function containsSuspiciousMojibake(value: string): boolean {
  return (
    value.includes(REPLACEMENT_CHAR) ||
    /Ã[\u0080-\u00BF]/u.test(value) ||
    /Â[\u0080-\u00BF]/u.test(value) ||
    /â[\u0080-\u00BF]/u.test(value)
  );
}

function mojibakeScore(value: string): number {
  return [
    value.includes(REPLACEMENT_CHAR)
      ? value.split(REPLACEMENT_CHAR).length - 1
      : 0,
    (value.match(/Ã[\u0080-\u00BF]/gu) || []).length,
    (value.match(/Â[\u0080-\u00BF]/gu) || []).length,
    (value.match(/â[\u0080-\u00BF]/gu) || []).length
  ].reduce((total, next) => total + next, 0);
}

function tryLatin1MojibakeRepair(value: string): string {
  if (!/[ÃÂâ]/u.test(value)) {
    return value;
  }

  const repaired = Buffer.from(value, "latin1").toString("utf8");
  return mojibakeScore(repaired) < mojibakeScore(value) ? repaired : value;
}

function repairReplacementCharMojibake(value: string): string {
  let repaired = value;
  for (const [from, to] of TARGETED_MOJIBAKE_REPLACEMENTS.entries()) {
    repaired = repaired.split(from).join(to);
  }
  return repaired;
}

export function repairMojibakeText(value: string): string {
  return repairReplacementCharMojibake(tryLatin1MojibakeRepair(value));
}

function findMojibakeLines(content: string): Array<{
  lineNumber: number;
  original: string;
  repaired: string;
}> {
  const findings: Array<{
    lineNumber: number;
    original: string;
    repaired: string;
  }> = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!containsSuspiciousMojibake(line)) {
      return;
    }
    const repaired = repairMojibakeText(line);
    if (repaired !== line) {
      findings.push({
        lineNumber: index + 1,
        original: line,
        repaired
      });
    }
  });
  return findings;
}

interface BulletOccurrence {
  value: string;
  line: number;
  contextKey: string;
}

function collectBulletOccurrences(content: string): BulletOccurrence[] {
  const occurrences: BulletOccurrence[] = [];
  const headingStack: string[] = [];
  const bulletStack: Array<{ indent: number; text: string }> = [];

  content.split(/\r?\n/).forEach((line, index) => {
    const headingMatch = line.match(/^(\s*)(#{1,6})\s+(.*?)\s*$/);
    if (headingMatch) {
      const level = headingMatch[2].length;
      headingStack.splice(level - 1);
      headingStack[level - 1] = headingMatch[3].trim();
      bulletStack.length = 0;
      return;
    }

    const bulletMatch = line.match(/^(\s*)-\s+(.*?)\s*$/);
    if (!bulletMatch) {
      return;
    }

    const indent = bulletMatch[1].length;
    const text = `- ${bulletMatch[2].trim()}`;

    while (
      bulletStack.length &&
      bulletStack[bulletStack.length - 1]!.indent >= indent
    ) {
      bulletStack.pop();
    }

    occurrences.push({
      value: text,
      line: index + 1,
      contextKey: [
        headingStack.join(" > "),
        ...bulletStack.map((entry) => entry.text)
      ]
        .filter(Boolean)
        .join(" | ")
    });

    bulletStack.push({ indent, text });
  });

  return occurrences;
}

function findDuplicateBulletLines(content: string): Array<{
  value: string;
  lines: number[];
}> {
  const occurrences = new Map<string, { value: string; lines: number[] }>();
  collectBulletOccurrences(content).forEach((occurrence) => {
    const key = `${occurrence.contextKey} || ${occurrence.value}`;
    const bucket = occurrences.get(key) || {
      value: occurrence.value,
      lines: []
    };
    bucket.lines.push(occurrence.line);
    occurrences.set(key, bucket);
  });

  return Array.from(occurrences.values()).filter(
    (entry) => entry.lines.length > 1
  );
}

function findCrossContextRepeatedBullets(
  content: string,
  minimumContexts = 3
): Array<{
  value: string;
  lines: number[];
  contextCount: number;
}> {
  const grouped = new Map<
    string,
    {
      value: string;
      lines: number[];
      contexts: Set<string>;
    }
  >();

  collectBulletOccurrences(content).forEach((occurrence) => {
    const bucket = grouped.get(occurrence.value) || {
      value: occurrence.value,
      lines: [],
      contexts: new Set<string>()
    };
    bucket.lines.push(occurrence.line);
    bucket.contexts.add(occurrence.contextKey || "__root__");
    grouped.set(occurrence.value, bucket);
  });

  return Array.from(grouped.values())
    .filter((entry) => entry.contexts.size >= minimumContexts)
    .map((entry) => ({
      value: entry.value,
      lines: entry.lines,
      contextCount: entry.contexts.size
    }));
}

function normalizeMarkdownLineStructure(line: string): string {
  const trimmedEnd = line.replace(/[ \t]+$/g, "");
  if (/^\s*#{1,6}\s*/.test(trimmedEnd)) {
    const match = trimmedEnd.match(/^(\s*#{1,6})\s*(.*?)\s*$/);
    if (match) {
      return `${match[1].trim()} ${match[2].trim()}`.trimEnd();
    }
  }
  if (/^\s*-\s+/.test(trimmedEnd)) {
    const match = trimmedEnd.match(/^\s*-\s*(.*?)\s*$/);
    if (match) {
      return `- ${match[1].trim()}`;
    }
  }
  return trimmedEnd;
}

export function normalizeGlobalMarkdownContent(content: string): string {
  const normalized = content
    .split(/\r?\n/)
    .map((line) =>
      normalizeMarkdownLineStructure(repairMojibakeText(line)).replace(
        /\uFEFF/g,
        ""
      )
    )
    .join("\n")
    .replace(/\s+$/g, "");

  return `${normalized}\n`;
}

function isArrayOfStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isValidMemoryReference(value: unknown): value is MemoryReference {
  if (!value || typeof value !== "object") {
    return false;
  }
  const probe = value as MemoryReference;
  return typeof probe.type === "string" && typeof probe.value === "string";
}

function isValidMemorySourceDescriptor(
  value: unknown
): value is MemorySourceDescriptor {
  if (!value || typeof value !== "object") {
    return false;
  }
  const probe = value as MemorySourceDescriptor;
  return typeof probe.type === "string" && typeof probe.detail === "string";
}

function isValidMemoryScope(value: unknown): value is MemoryScope {
  return value === "repo" || value === "subsystem" || value === "task";
}

function isValidMemoryKind(value: unknown): value is MemoryKind {
  return (
    value === "decision" ||
    value === "rule" ||
    value === "procedure" ||
    value === "exception" ||
    value === "fact" ||
    value === "task_state" ||
    value === "skill_candidate" ||
    value === "noise"
  );
}

export function isStructuredMemoryEntry(value: unknown): value is MemoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const probe = value as MemoryEntry;
  return Boolean(
    typeof probe.id === "string" &&
    typeof probe.createdAt === "string" &&
    typeof probe.project === "string" &&
    isValidMemoryScope(probe.scope) &&
    isValidMemoryKind(probe.kind) &&
    typeof probe.title === "string" &&
    typeof probe.summary === "string" &&
    isValidMemoryReference(probe.evidence) &&
    isArrayOfStrings(probe.tags) &&
    isArrayOfStrings(probe.supersedes) &&
    typeof probe.confidence === "number" &&
    isValidMemorySourceDescriptor(probe.source)
  );
}

export function isLegacyMemoryRecord(
  value: unknown
): value is LegacyMemoryRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const probe = value as LegacyMemoryRecord;
  return (
    typeof probe.who === "string" &&
    typeof probe.what === "string" &&
    typeof probe.when === "string" &&
    (typeof probe.context === "string" || typeof probe.context === "undefined")
  );
}

function normalizeLegacyCreatedAt(value: string): string {
  const trimmed = normalizeWhitespace(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T12:00:00.000Z`;
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }

  return `${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`;
}

function toDurableKind(kind: DurableMemoryKind | "noise"): DurableMemoryKind {
  return kind === "noise" ? "fact" : kind;
}

export function migrateLegacyMemoryRecord(
  repoRoot: string,
  record: LegacyMemoryRecord
): MemoryEntry {
  const normalizedContext = normalizeWhitespace(record.context || "");
  const inferred = inferMemoryKind(record.what);
  const durableKind = toDurableKind(inferred.kind);
  const who = normalizeWhitespace(record.who || "").toLowerCase();
  const evidenceType: MemoryReference["type"] =
    who === "assistant" ? "assistant" : "operator";
  const sourceType: MemorySourceDescriptor["type"] =
    who === "assistant" ? "runtime" : "operator";

  return {
    id: createDeterministicId(
      repoRoot,
      record.when,
      record.what,
      normalizedContext
    ),
    createdAt: normalizeLegacyCreatedAt(record.when),
    project: path.basename(repoRoot),
    scope: "repo",
    kind: durableKind,
    stage: durableKind === "task_state" ? "recent_context" : "durable_memory",
    title: firstSentence(record.what),
    summary: normalizeWhitespace(record.what),
    evidence: {
      type: evidenceType,
      value: normalizedContext || normalizeWhitespace(record.what)
    },
    tags: inferTags(`${record.what} ${normalizedContext}`),
    supersedes: [],
    confidence: who === "assistant" ? 0.7 : 0.8,
    source: {
      type: sourceType,
      detail: `legacy_memory_ndjson :: ${who || "operator"} :: ${normalizedContext ? "context" : "no-context"}`
    }
  };
}

function parseLedgerLines(content: string): ParsedLedgerLine[] {
  const lines = content.split(/\r?\n/);
  const parsed: ParsedLedgerLine[] = [];

  lines.forEach((line, index) => {
    const raw = line.replace(/^\uFEFF/, "");
    const trimmed = raw.trim();
    if (!trimmed) {
      return;
    }

    try {
      const record = JSON.parse(trimmed) as unknown;
      if (isStructuredMemoryEntry(record)) {
        parsed.push({
          raw: trimmed,
          lineNumber: index + 1,
          kind: "structured",
          entry: record
        });
        return;
      }
      if (isLegacyMemoryRecord(record)) {
        parsed.push({
          raw: trimmed,
          lineNumber: index + 1,
          kind: "legacy",
          legacy: record
        });
        return;
      }
      parsed.push({
        raw: trimmed,
        lineNumber: index + 1,
        kind: "invalid"
      });
    } catch {
      parsed.push({
        raw: trimmed,
        lineNumber: index + 1,
        kind: "invalid"
      });
    }
  });

  return parsed;
}

async function auditMarkdownFile(
  filePath: string,
  rule: MarkdownRule,
  repoRoot?: string | null
): Promise<MemorySurfaceFinding[]> {
  if (!(await pathExists(filePath))) {
    return [
      createFinding(
        "medium",
        "missing_surface",
        `Missing runtime memory surface ${path.basename(filePath)}.`,
        filePath,
        { repoRoot }
      )
    ];
  }

  const content = await fs.readFile(filePath, "utf8");
  const findings: MemorySurfaceFinding[] = [];
  const duplicateBullets = findDuplicateBulletLines(content);
  const duplicateBulletValues = new Set(
    duplicateBullets.map((duplicate) => duplicate.value)
  );

  findMojibakeLines(content).forEach((finding) => {
    findings.push(
      createFinding(
        "high",
        "mojibake_runtime_surface",
        `Detected real mojibake in ${path.basename(filePath)}.`,
        filePath,
        {
          line: finding.lineNumber,
          repoRoot
        }
      )
    );
  });

  rule.requiredPatterns.forEach((expected) => {
    if (!expected.pattern.test(content)) {
      findings.push(
        createFinding(
          "medium",
          "missing_expected_section",
          `Missing expected section ${expected.label} in ${path.basename(filePath)}.`,
          filePath,
          { repoRoot }
        )
      );
    }
  });

  duplicateBullets.forEach((duplicate) => {
    findings.push(
      createFinding(
        "medium",
        "duplicate_bullet",
        `Found exact duplicate bullet in ${path.basename(filePath)}: ${duplicate.value}`,
        filePath,
        {
          line: duplicate.lines[1],
          repoRoot
        }
      )
    );
  });

  findCrossContextRepeatedBullets(content)
    .filter((duplicate) => !duplicateBulletValues.has(duplicate.value))
    .forEach((duplicate) => {
      findings.push(
        createFinding(
          "low",
          "cross_context_repeated_bullet",
          `Bullet repeats across ${duplicate.contextCount} contexts in ${path.basename(filePath)}: ${duplicate.value}`,
          filePath,
          {
            line: duplicate.lines[1] || duplicate.lines[0],
            repoRoot
          }
        )
      );
    });

  return findings;
}

async function auditRepoLedger(repoRoot: string): Promise<{
  findings: MemorySurfaceFinding[];
  ledger: MemoryLedgerAuditSummary;
}> {
  const ledgerPath = path.join(repoRoot, ".agents", "MEMORY.ndjson");
  if (!(await pathExists(ledgerPath))) {
    return {
      findings: [
        createFinding(
          "medium",
          "missing_surface",
          "Missing runtime memory surface MEMORY.ndjson.",
          ledgerPath,
          { repoRoot }
        )
      ],
      ledger: emptyLedgerSummary()
    };
  }

  const content = await fs.readFile(ledgerPath, "utf8");
  const parsed = parseLedgerLines(content);
  const findings: MemorySurfaceFinding[] = [];
  const summary = parsed.reduce(
    (accumulator, line) => {
      accumulator.total += 1;
      accumulator[line.kind] += 1;
      return accumulator;
    },
    {
      total: 0,
      structured: 0,
      legacy: 0,
      invalid: 0
    } satisfies MemoryLedgerAuditSummary
  );

  parsed
    .filter((line) => line.kind === "invalid")
    .forEach((line) => {
      findings.push(
        createFinding(
          "high",
          "invalid_memory_entry",
          "Found invalid memory ledger line that is neither structured nor legacy schema.",
          ledgerPath,
          {
            line: line.lineNumber,
            repoRoot
          }
        )
      );
    });

  if (summary.legacy > 0 && summary.structured > 0) {
    findings.push(
      createFinding(
        "high",
        "mixed_ledger_schema",
        "Repo ledger mixes legacy who/what/when/context entries with structured MemoryEntry lines.",
        ledgerPath,
        { repoRoot }
      )
    );
  } else if (summary.legacy > 0) {
    findings.push(
      createFinding(
        "high",
        "legacy_ledger_schema",
        "Repo ledger still uses legacy who/what/when/context entries and needs structured migration.",
        ledgerPath,
        { repoRoot }
      )
    );
  }

  return {
    findings,
    ledger: summary
  };
}

function stripMarkdownTicks(value: string): string {
  return value.trim().replace(/^`|`$/g, "").trim();
}

function normalizeStatusValue(value: string): string {
  return stripMarkdownTicks(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function isCompletedSprintStatus(status: string): boolean {
  const normalized = normalizeStatusValue(status);
  return (
    normalized.includes("fechado") ||
    normalized.includes("concluido") ||
    normalized.includes("finalizado") ||
    normalized === "closed" ||
    normalized === "done"
  );
}

function isArchivedSprintStatus(status: string): boolean {
  return normalizeStatusValue(status).includes("arquivado");
}

function isArchivedSprintPath(openPath: string): boolean {
  return /(^|[\\/])\.agents[\\/]ARQUIVADO[\\/]/i.test(openPath);
}

function parseSprintIndexEntry(
  line: string,
  lineNumber: number
): SprintIndexEntry | null {
  const match = line.match(/^\s*-\s*`([^`]+)`\s*\|\s*(.+)$/);
  if (!match) {
    return null;
  }

  const fields = match[2].split("|").map((field) => field.trim());
  const statusField = fields.find((field) => /^status\s*:/i.test(field));
  const openField = fields.find((field) => /^abre\s*:/i.test(field));
  if (!statusField || !openField) {
    return null;
  }

  return {
    line,
    lineNumber,
    id: match[1],
    status: stripMarkdownTicks(statusField.replace(/^status\s*:/i, "")),
    openPath: stripMarkdownTicks(openField.replace(/^abre\s*:/i, ""))
  };
}

function parseSprintIndexEntries(content: string): SprintIndexEntry[] {
  return content
    .split(/\r?\n/)
    .map((line, index) => parseSprintIndexEntry(line, index + 1))
    .filter((entry): entry is SprintIndexEntry => Boolean(entry));
}

function toSafeRepoRelativePath(value: string): string | null {
  const normalized = stripMarkdownTicks(value).replace(/\\/g, "/");
  if (!normalized || path.isAbsolute(normalized)) {
    return null;
  }
  const relativePath = path.normalize(normalized);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }
  return relativePath;
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    Boolean(relative) &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

function toArchiveRelativePath(sprintRelativePath: string): string {
  const normalized = sprintRelativePath.replace(/\\/g, "/");
  const prefix = ".agents/sprints/";
  const suffix = normalized.toLowerCase().startsWith(prefix)
    ? normalized.slice(prefix.length)
    : path.basename(normalized);
  return path.join(".agents", "ARQUIVADO", "sprints", suffix);
}

async function listSprintSidecarPaths(sourcePath: string): Promise<string[]> {
  const parent = path.dirname(sourcePath);
  const parsed = path.parse(sourcePath);
  const entries = await fs
    .readdir(parent, { withFileTypes: true })
    .catch(() => []);
  const sidecars = entries
    .filter((entry) => entry.name !== parsed.base)
    .filter(
      (entry) =>
        entry.name === parsed.name || entry.name.startsWith(`${parsed.name}.`)
    )
    .map((entry) => path.join(parent, entry.name));
  return [sourcePath, ...sidecars];
}

async function nextAvailableArchivePath(targetPath: string): Promise<string> {
  if (!(await pathExists(targetPath))) {
    return targetPath;
  }

  const parsed = path.parse(targetPath);
  for (let index = 2; index < 1000; index += 1) {
    const candidate = path.join(
      parsed.dir,
      `${parsed.name}-${index}${parsed.ext}`
    );
    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }

  throw new Error(`Could not find available archive path for ${targetPath}`);
}

function updateSprintIndexLine(line: string, archivedOpenPath: string): string {
  return line
    .replace(/status:\s*`[^`]+`/i, "status: `arquivado`")
    .replace(
      /abre:\s*`[^`]+`/i,
      `abre: \`${archivedOpenPath.replace(/\\/g, "/")}\``
    );
}

async function auditRepoCompletedSprints(
  repoRoot: string
): Promise<MemorySurfaceFinding[]> {
  const indexPath = path.join(repoRoot, ".agents", "sprints", "INDEX.md");
  if (!(await pathExists(indexPath))) {
    return [];
  }

  const content = await fs.readFile(indexPath, "utf8");
  return parseSprintIndexEntries(content)
    .filter((entry) => isCompletedSprintStatus(entry.status))
    .filter((entry) => !isArchivedSprintStatus(entry.status))
    .filter((entry) => !isArchivedSprintPath(entry.openPath))
    .map((entry) =>
      createFinding(
        "medium",
        "completed_sprint_not_archived",
        `Completed sprint ${entry.id} is still indexed outside .agents/ARQUIVADO.`,
        indexPath,
        {
          line: entry.lineNumber,
          repoRoot
        }
      )
    );
}

async function archiveCompletedSprints(
  repoRoot: string,
  write: boolean
): Promise<SprintArchiveResult> {
  const resolvedRoot = path.resolve(repoRoot);
  const sprintsDir = path.join(resolvedRoot, ".agents", "sprints");
  const indexPath = path.join(sprintsDir, "INDEX.md");
  if (!(await pathExists(indexPath))) {
    return {
      repoRoot: resolvedRoot,
      changedFiles: [],
      movedFiles: [],
      archivedEntries: 0
    };
  }

  const content = await fs.readFile(indexPath, "utf8");
  const lines = content.split(/\r?\n/);
  const entries = parseSprintIndexEntries(content).filter(
    (entry) =>
      isCompletedSprintStatus(entry.status) &&
      !isArchivedSprintStatus(entry.status) &&
      !isArchivedSprintPath(entry.openPath)
  );
  const movedFiles: SprintArchiveMove[] = [];
  let archivedEntries = 0;

  for (const entry of entries) {
    const relativeOpenPath = toSafeRepoRelativePath(entry.openPath);
    if (!relativeOpenPath) {
      continue;
    }
    const sourcePath = path.resolve(resolvedRoot, relativeOpenPath);
    if (!isPathInside(sprintsDir, sourcePath) || sourcePath === indexPath) {
      continue;
    }

    const archiveRelativePath = toArchiveRelativePath(relativeOpenPath);
    const archivePath = path.resolve(resolvedRoot, archiveRelativePath);
    const archivedOpenPath = path.relative(resolvedRoot, archivePath);
    lines[entry.lineNumber - 1] = updateSprintIndexLine(
      entry.line,
      archivedOpenPath
    );
    archivedEntries += 1;

    const pathsToMove = await listSprintSidecarPaths(sourcePath);
    for (const filePath of pathsToMove) {
      if (!(await pathExists(filePath))) {
        continue;
      }
      const archiveItemPath = await nextAvailableArchivePath(
        path.join(
          path.dirname(archivePath),
          path.relative(path.dirname(sourcePath), filePath)
        )
      );
      movedFiles.push({
        from: filePath,
        to: archiveItemPath
      });
      if (write) {
        await fs.mkdir(path.dirname(archiveItemPath), { recursive: true });
        await fs.rename(filePath, archiveItemPath);
      }
    }
  }

  const nextContent = `${lines.join("\n").replace(/\s+$/g, "")}\n`;
  const indexChanged = nextContent !== content;
  if (write && indexChanged) {
    await fs.writeFile(indexPath, nextContent, "utf8");
  }

  return {
    repoRoot: resolvedRoot,
    changedFiles: indexChanged ? [indexPath] : [],
    movedFiles,
    archivedEntries
  };
}

export async function archiveCompletedSprintSurfaces(
  options: ArchiveCompletedSprintSurfacesOptions
): Promise<SprintArchiveResult[]> {
  const write = Boolean(options.write);
  return Promise.all(
    options.repoRoots.map((repoRoot) =>
      archiveCompletedSprints(repoRoot, write)
    )
  );
}

async function auditRepoRoot(
  repoRoot: string
): Promise<RepoSurfaceAuditReport> {
  const resolvedRoot = path.resolve(repoRoot);
  const markdownFindings = (
    await Promise.all(
      REPO_MARKDOWN_RULES.map((rule) =>
        auditMarkdownFile(
          path.join(resolvedRoot, rule.relativePath),
          rule,
          resolvedRoot
        )
      )
    )
  ).flat();
  const ledgerAudit = await auditRepoLedger(resolvedRoot);
  const sprintFindings = await auditRepoCompletedSprints(resolvedRoot);

  return {
    repoRoot: resolvedRoot,
    findings: [...ledgerAudit.findings, ...markdownFindings, ...sprintFindings],
    ledger: ledgerAudit.ledger
  };
}

async function auditGlobalRoot(
  globalMemoryRoot: string
): Promise<GlobalMemoryAuditReport> {
  const resolvedRoot = path.resolve(globalMemoryRoot);
  const findings = (
    await Promise.all(
      GLOBAL_MARKDOWN_RULES.map((rule) =>
        auditMarkdownFile(path.join(resolvedRoot, rule.relativePath), rule)
      )
    )
  ).flat();

  return {
    globalMemoryRoot: resolvedRoot,
    findings
  };
}

export async function auditMemorySurfaces(
  options: AuditMemorySurfacesOptions
): Promise<MemorySurfaceAuditReport> {
  const repoReports = await Promise.all(
    options.repoRoots.map((repoRoot) => auditRepoRoot(repoRoot))
  );
  const globalReport = await auditGlobalRoot(options.globalMemoryRoot);
  const findings = [
    ...repoReports.flatMap((report) => report.findings),
    ...globalReport.findings
  ];

  return {
    repoReports,
    globalReport,
    findings,
    counts: countBySeverity(findings)
  };
}

function formatMarkdownAuditLine(finding: MemorySurfaceFinding): string {
  const location = finding.line
    ? `${finding.filePath}:${finding.line}`
    : finding.filePath;
  return `- [${finding.severity}] ${finding.code}: ${finding.message} (${location})`;
}

export function formatAuditReportMarkdown(
  report: MemorySurfaceAuditReport
): string {
  const lines = [
    "# Memory Surface Audit",
    "",
    `- high: ${report.counts.high}`,
    `- medium: ${report.counts.medium}`,
    `- low: ${report.counts.low}`,
    ""
  ];

  report.repoReports.forEach((repoReport) => {
    lines.push(`## Repo: ${repoReport.repoRoot}`);
    lines.push(
      `- ledger: total=${repoReport.ledger.total}, structured=${repoReport.ledger.structured}, legacy=${repoReport.ledger.legacy}, invalid=${repoReport.ledger.invalid}`
    );
    if (!repoReport.findings.length) {
      lines.push("- findings: none");
    } else {
      repoReport.findings.forEach((finding) => {
        lines.push(formatMarkdownAuditLine(finding));
      });
    }
    lines.push("");
  });

  lines.push(`## Global memory: ${report.globalReport.globalMemoryRoot}`);
  if (!report.globalReport.findings.length) {
    lines.push("- findings: none");
  } else {
    report.globalReport.findings.forEach((finding) => {
      lines.push(formatMarkdownAuditLine(finding));
    });
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

async function writeFileIfChanged(
  filePath: string,
  nextContent: string,
  write: boolean
): Promise<boolean> {
  const previous = (await pathExists(filePath))
    ? await fs.readFile(filePath, "utf8")
    : null;
  if (previous === nextContent) {
    return false;
  }
  if (write) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, nextContent, "utf8");
  }
  return true;
}

function backupFileName(now: Date): string {
  return `${now.toISOString().slice(0, 10)}-memory-ledger-backup.ndjson`;
}

async function normalizeRepoLedger(
  repoRoot: string,
  write: boolean,
  now: Date
): Promise<RepoSurfaceNormalizationResult> {
  const resolvedRoot = path.resolve(repoRoot);
  const ledgerPath = path.join(resolvedRoot, ".agents", "MEMORY.ndjson");
  if (!(await pathExists(ledgerPath))) {
    return {
      repoRoot: resolvedRoot,
      changedFiles: [],
      backups: [],
      migratedEntries: 0,
      preservedStructuredEntries: 0,
      totalEntries: 0
    };
  }

  const content = await fs.readFile(ledgerPath, "utf8");
  const parsed = parseLedgerLines(content);
  const legacyLines = parsed.filter((line) => line.kind === "legacy");
  const structuredLines = parsed.filter((line) => line.kind === "structured");

  if (!legacyLines.length) {
    return {
      repoRoot: resolvedRoot,
      changedFiles: [],
      backups: [],
      migratedEntries: 0,
      preservedStructuredEntries: structuredLines.length,
      totalEntries: parsed.length
    };
  }

  const nextLines = parsed.map((line) => {
    if (line.kind === "structured") {
      return line.raw;
    }
    if (line.kind === "legacy" && line.legacy) {
      return JSON.stringify(
        migrateLegacyMemoryRecord(resolvedRoot, line.legacy)
      );
    }
    throw new Error(
      `Cannot normalize invalid ledger line ${line.lineNumber} in ${ledgerPath}`
    );
  });
  const nextContent = `${nextLines.join("\n")}\n`;
  const backupPath = path.join(
    resolvedRoot,
    ".agents",
    "archive",
    backupFileName(now)
  );
  const changed = content !== nextContent;
  if (write && changed) {
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.writeFile(backupPath, content, "utf8");
    await fs.writeFile(ledgerPath, nextContent, "utf8");
  }

  return {
    repoRoot: resolvedRoot,
    changedFiles: changed ? [ledgerPath] : [],
    backups: changed ? [backupPath] : [],
    migratedEntries: legacyLines.length,
    preservedStructuredEntries: structuredLines.length,
    totalEntries: parsed.length
  };
}

async function normalizeGlobalMarkdownFile(
  globalMemoryRoot: string,
  relativePath: string,
  write: boolean
): Promise<GlobalSurfaceNormalizationResult> {
  const filePath = path.join(path.resolve(globalMemoryRoot), relativePath);
  if (!(await pathExists(filePath))) {
    return {
      filePath,
      changed: false
    };
  }

  const content = await fs.readFile(filePath, "utf8");
  const normalized =
    relativePath.toLowerCase() === "memory_summary.md" ||
    relativePath.toLowerCase() === "memory.md"
      ? normalizeGlobalMarkdownContent(content)
      : content;

  const changed = await writeFileIfChanged(filePath, normalized, write);
  return {
    filePath,
    changed
  };
}

export async function normalizeMemorySurfaces(
  options: NormalizeMemorySurfacesOptions
): Promise<MemorySurfaceNormalizationResult> {
  const write = Boolean(options.write);
  const now = options.now || new Date();
  const repoResults = await Promise.all(
    options.repoRoots.map((repoRoot) =>
      normalizeRepoLedger(repoRoot, write, now)
    )
  );
  const sprintArchiveResults = await Promise.all(
    options.repoRoots.map((repoRoot) =>
      archiveCompletedSprints(repoRoot, write)
    )
  );
  const globalResults = await Promise.all(
    ["MEMORY.md", "memory_summary.md"].map((relativePath) =>
      normalizeGlobalMarkdownFile(options.globalMemoryRoot, relativePath, write)
    )
  );

  return {
    write,
    repoResults,
    globalResults,
    sprintArchiveResults,
    changedFiles: [
      ...repoResults.flatMap((result) => result.changedFiles),
      ...sprintArchiveResults.flatMap((result) => [
        ...result.changedFiles,
        ...result.movedFiles.map((move) => move.to)
      ]),
      ...globalResults
        .filter((result) => result.changed)
        .map((result) => result.filePath)
    ]
  };
}

export function formatNormalizationReportMarkdown(
  result: MemorySurfaceNormalizationResult
): string {
  const lines = [
    "# Memory Surface Normalization",
    "",
    `- mode: ${result.write ? "write" : "dry-run"}`,
    `- changed files: ${result.changedFiles.length}`,
    ""
  ];

  result.repoResults.forEach((repoResult) => {
    lines.push(`## Repo: ${repoResult.repoRoot}`);
    lines.push(`- total entries: ${repoResult.totalEntries}`);
    lines.push(`- migrated legacy entries: ${repoResult.migratedEntries}`);
    lines.push(
      `- preserved structured entries: ${repoResult.preservedStructuredEntries}`
    );
    if (repoResult.changedFiles.length) {
      lines.push(`- rewritten ledger: ${repoResult.changedFiles.join(", ")}`);
    } else {
      lines.push("- rewritten ledger: none");
    }
    if (repoResult.backups.length) {
      lines.push(`- backups: ${repoResult.backups.join(", ")}`);
    }
    const sprintArchive = result.sprintArchiveResults.find(
      (archiveResult) => archiveResult.repoRoot === repoResult.repoRoot
    );
    if (sprintArchive) {
      lines.push(`- archived sprint entries: ${sprintArchive.archivedEntries}`);
      lines.push(`- moved sprint files: ${sprintArchive.movedFiles.length}`);
    }
    lines.push("");
  });

  lines.push("## Global memory");
  result.globalResults.forEach((globalResult) => {
    lines.push(
      `- ${globalResult.changed ? "updated" : "kept"}: ${globalResult.filePath}`
    );
  });

  return `${lines.join("\n").trimEnd()}\n`;
}
