import fs from "node:fs/promises";
import path from "node:path";
import {
  ProjectMemoryService,
  type MemoryConfidence,
  type MemoryEntry
} from "./memoryService.js";

export type ProjectDecisionSource =
  | "profile_only"
  | "memory_ledger"
  | "hybrid"
  | "safe_fallback";

export type ProjectStatusVariant =
  | "default"
  | "executive"
  | "next"
  | "sources"
  | "steps"
  | "commands"
  | "queue"
  | "prompts";

export interface ProjectCurrentStatus {
  projectName: string;
  primaryFocus: string | null;
  latestClosedBlock: string | null;
  nextEligibleBlock: string | null;
  executionFormal: string | null;
  liveEvidence: string | null;
  publicEvidence: string | null;
}

export interface ProjectRenderHints {
  variant: ProjectStatusVariant;
  safeFallbackReason?: string;
  missingSections: string[];
}

export interface ProjectUnderstandingContract {
  projectProfile: string | null;
  decisionSource: ProjectDecisionSource;
  canonicalSources: string[];
  memorySources: string[];
  currentStatus: ProjectCurrentStatus;
  progressSummary: string[];
  nextStepSummary: string[];
  nextQueue: string[];
  suggestedCommands: string[];
  openRisks: string[];
  relevantMemory: MemoryEntry[];
  memoryConfidence: MemoryConfidence;
  usedOperationalState: boolean;
  renderHints: ProjectRenderHints;
}

export interface BuildProjectUnderstandingInput {
  workdir: string;
  variant?: ProjectStatusVariant;
  memoryService?: ProjectMemoryService;
}

interface CanonicalFileSet {
  activePath: string;
  handoffPath: string;
  memoryPath: string;
  napkinPath: string;
}

interface MemoriaVivaProfileData {
  currentStatus: ProjectCurrentStatus;
  progressSummary: string[];
  nextStepSummary: string[];
  nextQueue: string[];
  suggestedCommands: string[];
  openRisks: string[];
  canonicalSources: string[];
  missingSections: string[];
  usedOperationalState: boolean;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r/g, "").trim();
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

function compactSectionLines(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("## "));
}

function normalizeAscii(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function extractBulletValue(lines: string[], prefix: string): string | null {
  const normalizedPrefix = normalizeAscii(prefix.trim());
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) continue;
    const body = trimmed.slice(2).trim();
    if (!normalizeAscii(body).startsWith(normalizedPrefix)) continue;
    return body.slice(prefix.length).trim().replace(/\.$/, "") || null;
  }
  return null;
}

function extractBlocksFromLines(lines: string[]): string[] {
  const blocks: string[] = [];

  for (const line of lines) {
    if (!/fechad/i.test(line)) {
      continue;
    }

    const matches = line.matchAll(/`(\d{2,4}-\d{2,4})`/g);
    for (const match of matches) {
      if (match[1]) {
        blocks.push(match[1]);
      }
    }
  }

  return blocks;
}

function extractLatestClosedBlock(
  activeContent: string,
  handoffContent: string
): string | null {
  const activeObjective = extractSectionLines(activeContent, "Current objective");
  const latestCompleted = extractSectionLines(handoffContent, "Latest completed");
  const currentProof = extractSectionLines(activeContent, "Current proof");
  const blocks = [
    ...extractBlocksFromLines(activeObjective),
    ...extractBlocksFromLines(latestCompleted),
    ...extractBlocksFromLines(currentProof)
  ];

  return blocks.at(-1) || null;
}

function extractNextEligibleBlock(markdown: string): string | null {
  const directMatch = markdown.match(/Proximo bloco elegivel:\s*`([^`]+)`/i);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  const handoffMatch = markdown.match(
    /Proximo bloco elegivel agora:\s*-?\s*`([^`]+)`/i
  );
  if (handoffMatch?.[1]) {
    return handoffMatch[1];
  }

  return null;
}

function extractEvidenceLine(lines: string[], patterns: RegExp[]): string | null {
  for (const line of lines) {
    const trimmed = line.trim().replace(/^- /, "");
    if (patterns.some((pattern) => pattern.test(trimmed))) {
      return trimmed;
    }
  }
  return null;
}

function extractProgressSnapshot(markdown: string): string[] {
  return compactSectionLines(extractSectionLines(markdown, "Progress snapshot"))
    .map((line) => line.replace(/^- /, "").trim())
    .filter((line) => /:\s*\d{1,3}%/i.test(line))
    .slice(0, 4);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function buildCanonicalPaths(workdir: string): CanonicalFileSet {
  return {
    activePath: path.join(workdir, ".agents", "ACTIVE.md"),
    handoffPath: path.join(workdir, ".agents", "HANDOFF.md"),
    memoryPath: path.join(workdir, ".agents", "MEMORY.ndjson"),
    napkinPath: path.join(workdir, ".codex", "napkin.md")
  };
}

async function pickLatestMemoryFiles(workdir: string): Promise<string[]> {
  const memoryDir = path.join(workdir, "MEMORY");
  try {
    const entries = await fs.readdir(memoryDir, {
      withFileTypes: true
    });
    const candidates = await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isFile() && /^(SPRINT_|PLANO_|RUNBOOK_).+\.md$/i.test(entry.name)
        )
        .map(async (entry) => {
          const absolutePath = path.join(memoryDir, entry.name);
          const stats = await fs.stat(absolutePath);
          return {
            absolutePath,
            mtimeMs: stats.mtimeMs
          };
        })
    );

    return candidates
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(0, 3)
      .map((entry) => entry.absolutePath);
  } catch {
    return [];
  }
}

async function readMemoriaVivaProfile(
  workdir: string
): Promise<MemoriaVivaProfileData | null> {
  const paths = buildCanonicalPaths(workdir);
  const hasActive = await pathExists(paths.activePath);
  const hasHandoff = await pathExists(paths.handoffPath);
  const hasMemory = await pathExists(paths.memoryPath);
  const hasNapkin = await pathExists(paths.napkinPath);

  if (!hasActive && !hasHandoff && !hasMemory && !hasNapkin) {
    return null;
  }

  const activeContent = hasActive
    ? await fs.readFile(paths.activePath, "utf8")
    : "";
  const handoffContent = hasHandoff
    ? await fs.readFile(paths.handoffPath, "utf8")
    : "";

  const currentObjective = extractSectionLines(activeContent, "Current objective");
  const currentState = extractSectionLines(activeContent, "Current state");
  const currentProof = extractSectionLines(activeContent, "Current proof");
  const openLoops = compactSectionLines(
    extractSectionLines(activeContent, "Open loops")
  )
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
  const restartProtocol = compactSectionLines(
    extractSectionLines(handoffContent, "Restart protocol now")
  );
  const suggestedCommands = compactSectionLines(
    extractSectionLines(handoffContent, "Suggested commands")
  );
  const nextQueue = compactSectionLines(
    extractSectionLines(handoffContent, "Next queue")
  );
  const firstSteps = compactSectionLines(
    extractSectionLines(handoffContent, "First steps if resuming now")
  );
  const progressSummary = extractProgressSnapshot(handoffContent);
  const latestMemoryFiles = await pickLatestMemoryFiles(workdir);
  const canonicalSources = [
    ...(hasActive ? [paths.activePath] : []),
    ...(hasHandoff ? [paths.handoffPath] : []),
    ...(hasMemory ? [paths.memoryPath] : []),
    ...(hasNapkin ? [paths.napkinPath] : []),
    ...latestMemoryFiles
  ];
  const missingSections = [
    ...(hasActive ? [] : ["ACTIVE.md"]),
    ...(hasHandoff ? [] : ["HANDOFF.md"]),
    ...(progressSummary.length ? [] : ["Progress snapshot"]),
    ...(suggestedCommands.length ? [] : ["Suggested commands"]),
    ...(nextQueue.length ? [] : ["Next queue"]),
    ...(firstSteps.length || restartProtocol.length
      ? []
      : ["Restart protocol now"])
  ];

  const latestClosedBlock = extractLatestClosedBlock(activeContent, handoffContent);
  const nextEligibleBlock =
    extractNextEligibleBlock(activeContent) ||
    extractNextEligibleBlock(handoffContent);
  const executionFormal = nextEligibleBlock
    ? `Nao encontrei abertura formal do bloco ${nextEligibleBlock}`
    : "Nao confirmado";

  return {
    currentStatus: {
      projectName: path.basename(workdir),
      primaryFocus: extractBulletValue(
        currentObjective,
        "Frente principal atual:"
      ),
      latestClosedBlock,
      nextEligibleBlock,
      executionFormal,
      liveEvidence: extractEvidenceLine(
        [...currentState, ...currentProof],
        [
          /frontend:live:visual-battery/i,
          /12\/12/i,
          /frontend-live-battery/i,
          /live visual/i
        ]
      ),
      publicEvidence: extractEvidenceLine(
        [...currentState, ...currentProof],
        [
          /frontend:public:status:battery/i,
          /status:battery/i,
          /cadeia publica de status/i,
          /publico/i
        ]
      )
    },
    progressSummary,
    nextStepSummary: (firstSteps.length ? firstSteps : restartProtocol).slice(0, 6),
    nextQueue: nextQueue.slice(0, 8),
    suggestedCommands: suggestedCommands.slice(0, 8),
    openRisks: openLoops.slice(0, 5),
    canonicalSources,
    missingSections,
    usedOperationalState: canonicalSources.length > 0
  };
}

function createSafeFallbackContract(
  workdir: string,
  variant: ProjectStatusVariant
): ProjectUnderstandingContract {
  return {
    projectProfile: null,
    decisionSource: "safe_fallback",
    canonicalSources: [],
    memorySources: [],
    currentStatus: {
      projectName: path.basename(workdir),
      primaryFocus: null,
      latestClosedBlock: null,
      nextEligibleBlock: null,
      executionFormal: null,
      liveEvidence: null,
      publicEvidence: null
    },
    progressSummary: [],
    nextStepSummary: [],
    nextQueue: [],
    suggestedCommands: [],
    openRisks: [],
    relevantMemory: [],
    memoryConfidence: "none",
    usedOperationalState: false,
    renderHints: {
      variant,
      safeFallbackReason:
        "Nao encontrei um padrao compativel de memoria viva neste projeto.",
      missingSections: ["ACTIVE.md", "HANDOFF.md"]
    }
  };
}

export async function buildProjectUnderstanding({
  workdir,
  variant = "default",
  memoryService = new ProjectMemoryService()
}: BuildProjectUnderstandingInput): Promise<ProjectUnderstandingContract> {
  const resolvedWorkdir = path.resolve(workdir);
  const profileData = await readMemoriaVivaProfile(resolvedWorkdir);

  if (!profileData) {
    return createSafeFallbackContract(resolvedWorkdir, variant);
  }

  const memoryQueryText = [
    profileData.currentStatus.projectName,
    profileData.currentStatus.primaryFocus || "",
    profileData.currentStatus.nextEligibleBlock || "",
    profileData.currentStatus.latestClosedBlock || "",
    variant,
    "project status sprint progress risks commands handoff next block"
  ].join(" ");
  const memoryQuery = await memoryService.queryMemory({
    workdir: resolvedWorkdir,
    prompt: memoryQueryText,
    intent:
      variant === "commands"
        ? "implementation"
        : variant === "queue" || variant === "next"
          ? "continue"
          : "status",
    maxEntries: 5
  });

  const decisionSource: ProjectDecisionSource = profileData.usedOperationalState
    ? memoryQuery.entries.length
      ? "hybrid"
      : "profile_only"
    : memoryQuery.entries.length
      ? "memory_ledger"
      : "profile_only";

  return {
    projectProfile: "memoria-viva-project-profile",
    decisionSource,
    canonicalSources: profileData.canonicalSources,
    memorySources: memoryQuery.sources,
    currentStatus: profileData.currentStatus,
    progressSummary: profileData.progressSummary,
    nextStepSummary: profileData.nextStepSummary,
    nextQueue: profileData.nextQueue,
    suggestedCommands: profileData.suggestedCommands,
    openRisks: profileData.openRisks,
    relevantMemory: memoryQuery.entries,
    memoryConfidence: memoryQuery.confidence,
    usedOperationalState: profileData.usedOperationalState,
    renderHints: {
      variant,
      missingSections: profileData.missingSections
    }
  };
}
