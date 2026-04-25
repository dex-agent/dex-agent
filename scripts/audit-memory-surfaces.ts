import path from "node:path";
import {
  auditMemorySurfaces,
  formatAuditReportMarkdown,
  type MemorySurfaceSeverity
} from "../src/orchestrator/memorySurfaceMaintenance.js";

interface AuditCliOptions {
  repoRoots: string[];
  globalMemoryRoot: string;
  format: "markdown" | "json";
  failOn: MemorySurfaceSeverity | "off";
}

function parseArgs(argv: string[]): AuditCliOptions {
  const repoRoots: string[] = [];
  let globalMemoryRoot = "";
  let format: AuditCliOptions["format"] = "markdown";
  let failOn: AuditCliOptions["failOn"] = "off";

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
    if (token === "--format") {
      const value = argv[index + 1];
      if (value === "markdown" || value === "json") {
        format = value;
      }
      index += 1;
      continue;
    }
    if (token === "--fail-on") {
      const value = argv[index + 1];
      if (value === "high" || value === "medium" || value === "low") {
        failOn = value;
      } else if (value === "off") {
        failOn = "off";
      }
      index += 1;
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
    format,
    failOn
  };
}

function shouldFail(
  counts: Record<MemorySurfaceSeverity, number>,
  failOn: AuditCliOptions["failOn"]
): boolean {
  if (failOn === "off") {
    return false;
  }
  if (failOn === "high") {
    return counts.high > 0;
  }
  if (failOn === "medium") {
    return counts.high > 0 || counts.medium > 0;
  }
  return counts.high > 0 || counts.medium > 0 || counts.low > 0;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = await auditMemorySurfaces(options);

  if (options.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    process.stdout.write(formatAuditReportMarkdown(report));
  }

  if (shouldFail(report.counts, options.failOn)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Unknown audit failure."
  );
  process.exitCode = 1;
});
