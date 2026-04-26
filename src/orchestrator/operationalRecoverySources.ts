import fs from "node:fs/promises";
import path from "node:path";

export type OperationalRecoveryTarget =
  | "index"
  | "agents"
  | "project"
  | "active"
  | "handoff"
  | "napkin"
  | "sprintsIndex"
  | "estacionamento"
  | "ledger";

export interface OperationalRecoveryPaths {
  indexPath: string;
  agentsPath: string;
  projectPath: string;
  activePath: string;
  handoffPath: string;
  napkinPath: string;
  sprintsIndexPath: string;
  estacionamentoPath: string;
  ledgerPath: string;
}

export interface OperationalRecoverySourceSet {
  paths: OperationalRecoveryPaths;
  sources: string[];
  missingCore: string[];
  hasSprintsIndex: boolean;
  hasActiveParking: boolean;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readIfExists(targetPath: string): Promise<string> {
  if (!(await pathExists(targetPath))) {
    return "";
  }
  return fs.readFile(targetPath, "utf8");
}

function sectionLines(markdown: string, heading: string): string[] {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const target = `## ${heading.trim().toLowerCase()}`;
  const start = lines.findIndex((line) => line.trim().toLowerCase() === target);
  if (start === -1) return [];

  const section: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("## ")) break;
    section.push(line);
  }
  return section;
}

function hasActiveParkingItems(markdown: string): boolean {
  return sectionLines(markdown, "Ativos").some((line) =>
    line.trim().startsWith("- ")
  );
}

export function buildOperationalRecoveryPaths(
  workdir: string
): OperationalRecoveryPaths {
  return {
    indexPath: path.join(workdir, "INDEX.md"),
    agentsPath: path.join(workdir, "AGENTS.md"),
    projectPath: path.join(workdir, ".agents", "PROJECT.md"),
    activePath: path.join(workdir, ".agents", "ACTIVE.md"),
    handoffPath: path.join(workdir, ".agents", "HANDOFF.md"),
    napkinPath: path.join(workdir, ".codex", "napkin.md"),
    sprintsIndexPath: path.join(workdir, ".agents", "sprints", "INDEX.md"),
    estacionamentoPath: path.join(workdir, ".agents", "ESTACIONAMENTO.md"),
    ledgerPath: path.join(workdir, ".agents", "MEMORY.ndjson")
  };
}

export async function resolveOperationalRecoverySources(
  workdir: string
): Promise<OperationalRecoverySourceSet> {
  const paths = buildOperationalRecoveryPaths(workdir);
  const [
    hasIndex,
    hasAgents,
    hasProject,
    hasActive,
    hasHandoff,
    hasNapkin,
    hasSprintsIndex,
    hasEstacionamento,
    hasLedger
  ] = await Promise.all([
    pathExists(paths.indexPath),
    pathExists(paths.agentsPath),
    pathExists(paths.projectPath),
    pathExists(paths.activePath),
    pathExists(paths.handoffPath),
    pathExists(paths.napkinPath),
    pathExists(paths.sprintsIndexPath),
    pathExists(paths.estacionamentoPath),
    pathExists(paths.ledgerPath)
  ]);

  const estacionamentoContent = hasEstacionamento
    ? await readIfExists(paths.estacionamentoPath)
    : "";
  const hasActiveParking = hasActiveParkingItems(estacionamentoContent);

  const sources = [
    ...(hasIndex ? [paths.indexPath] : []),
    ...(hasAgents ? [paths.agentsPath] : []),
    ...(hasProject ? [paths.projectPath] : []),
    ...(hasActive ? [paths.activePath] : []),
    ...(hasHandoff ? [paths.handoffPath] : []),
    ...(hasNapkin ? [paths.napkinPath] : []),
    ...(hasSprintsIndex ? [paths.sprintsIndexPath] : []),
    ...(hasActiveParking ? [paths.estacionamentoPath] : []),
    ...(hasLedger ? [paths.ledgerPath] : [])
  ];

  const missingCore = [
    ...(hasIndex ? [] : ["INDEX.md"]),
    ...(hasAgents ? [] : ["AGENTS.md"]),
    ...(hasActive ? [] : ["ACTIVE.md"]),
    ...(hasHandoff ? [] : ["HANDOFF.md"])
  ];

  return {
    paths,
    sources,
    missingCore,
    hasSprintsIndex,
    hasActiveParking
  };
}

export async function readOperationalRecoveryFile(
  workdir: string,
  target: OperationalRecoveryTarget
): Promise<string | null> {
  const paths = buildOperationalRecoveryPaths(workdir);
  const targetPath =
    target === "index"
      ? paths.indexPath
      : target === "agents"
        ? paths.agentsPath
        : target === "project"
          ? paths.projectPath
          : target === "active"
            ? paths.activePath
            : target === "handoff"
              ? paths.handoffPath
              : target === "napkin"
                ? paths.napkinPath
                : target === "sprintsIndex"
                  ? paths.sprintsIndexPath
                  : target === "estacionamento"
                    ? paths.estacionamentoPath
                    : paths.ledgerPath;

  const content = await readIfExists(targetPath);
  return content || null;
}
