import path from "node:path";
import {
  formatNormalizationReportMarkdown,
  normalizeMemorySurfaces
} from "../src/orchestrator/memorySurfaceMaintenance.js";

interface NormalizeCliOptions {
  repoRoots: string[];
  globalMemoryRoot: string;
  write: boolean;
}

function parseArgs(argv: string[]): NormalizeCliOptions {
  const repoRoots: string[] = [];
  let globalMemoryRoot = "";
  let write = false;

  const readValue = (index: number, flag: string): string => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Provide a value for ${flag}.`);
    }
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--repo-root") {
      repoRoots.push(path.resolve(readValue(index, token)));
      index += 1;
      continue;
    }
    if (token === "--global-memory-root") {
      globalMemoryRoot = path.resolve(readValue(index, token));
      index += 1;
      continue;
    }
    if (token === "--write") {
      write = true;
    }
  }

  if (!repoRoots.length) {
    throw new Error("Provide at least one --repo-root <path>.");
  }
  if (!globalMemoryRoot) {
    throw new Error("Provide --global-memory-root <path>.");
  }

  return {
    repoRoots,
    globalMemoryRoot,
    write
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await normalizeMemorySurfaces(options);
  process.stdout.write(formatNormalizationReportMarkdown(result));
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Unknown normalization failure."
  );
  process.exitCode = 1;
});
