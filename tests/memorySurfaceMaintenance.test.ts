import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  auditMemorySurfaces,
  migrateLegacyMemoryRecord,
  normalizeMemorySurfaces
} from "../src/orchestrator/memorySurfaceMaintenance.js";

const REPLACEMENT_CHAR = "\uFFFD";

async function createRepoRoot(name: string): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
  await fs.mkdir(path.join(repoRoot, ".agents"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".codex"), { recursive: true });
  await fs.writeFile(
    path.join(repoRoot, ".agents", "PROJECT.md"),
    [
      "# Project Identity",
      "",
      "## Name",
      "- Test repo",
      "",
      "## Purpose",
      "- Exercise memory audit."
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(repoRoot, ".agents", "ACTIVE.md"),
    [
      "# Active State",
      "",
      "## Current objective",
      "- Keep memory surfaces aligned."
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(repoRoot, ".agents", "HANDOFF.md"),
    [
      "# Session Handoff",
      "",
      "## Restart protocol now",
      "- Read ACTIVE first."
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(repoRoot, ".codex", "napkin.md"),
    [
      "# Napkin do Projeto",
      "",
      "## Regras de Curadoria",
      "- Keep runtime files readable."
    ].join("\n"),
    "utf8"
  );
  return repoRoot;
}

async function createGlobalRoot(): Promise<string> {
  const globalRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-global-memory-")
  );
  await fs.writeFile(
    path.join(globalRoot, "memory_summary.md"),
    [
      "## User Profile",
      "",
      "The operator uses file-based memory.",
      "",
      "## User preferences",
      "- Keep proposal-first writes explicit.",
      "",
      "## General Tips",
      "- Use the live repo files before acting."
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(globalRoot, "MEMORY.md"),
    [
      "# Task Group: Test memory surface",
      "",
      "## Reusable knowledge",
      `- when the user asked about a GitHub button, map the UI directly even if the text says op${REPLACEMENT_CHAR}${REPLACEMENT_CHAR}o.`
    ].join("\n"),
    "utf8"
  );
  return globalRoot;
}

async function writeLedger(repoRoot: string, lines: string[]): Promise<void> {
  await fs.writeFile(
    path.join(repoRoot, ".agents", "MEMORY.ndjson"),
    `${lines.join("\n")}\n`,
    "utf8"
  );
}

function structuredEntry(repoRoot: string, id: string): string {
  return JSON.stringify({
    id,
    createdAt: "2026-04-21T10:00:00.000Z",
    project: path.basename(repoRoot),
    scope: "repo",
    kind: "decision",
    stage: "durable_memory",
    title: "Use explicit memory packets",
    summary: "Use explicit memory packets during project continuation.",
    evidence: { type: "operator", value: "accepted rule" },
    tags: ["memory", "packet"],
    supersedes: [],
    confidence: 0.9,
    source: { type: "operator", detail: "structured test entry" }
  });
}

test("auditMemorySurfaces flags mixed schema, legacy schema, and real mojibake without false positives", async () => {
  const mixedRepo = await createRepoRoot("memory-audit-mixed");
  const legacyRepo = await createRepoRoot("memory-audit-legacy");
  const structuredRepo = await createRepoRoot("memory-audit-structured");
  const globalRoot = await createGlobalRoot();

  await writeLedger(mixedRepo, [
    structuredEntry(mixedRepo, "mem-structured"),
    JSON.stringify({
      who: "operator",
      what: "Current objective: keep the ledger structured.",
      when: "2026-04-22",
      context: "audit sprint"
    })
  ]);
  await writeLedger(legacyRepo, [
    JSON.stringify({
      who: "assistant",
      what: "Decision: explain the memory state before normalizing.",
      when: "2026-04-21",
      context: "voice note"
    })
  ]);
  await writeLedger(structuredRepo, [
    structuredEntry(structuredRepo, "mem-only")
  ]);

  const report = await auditMemorySurfaces({
    repoRoots: [mixedRepo, legacyRepo, structuredRepo],
    globalMemoryRoot: globalRoot
  });

  assert.ok(
    report.findings.some(
      (finding) =>
        finding.code === "mixed_ledger_schema" && finding.repoRoot === mixedRepo
    )
  );
  assert.ok(
    report.findings.some(
      (finding) =>
        finding.code === "legacy_ledger_schema" &&
        finding.repoRoot === legacyRepo
    )
  );
  assert.ok(
    report.findings.some(
      (finding) =>
        finding.code === "mojibake_runtime_surface" &&
        finding.filePath.endsWith("MEMORY.md")
    )
  );
  assert.equal(
    report.findings.some(
      (finding) =>
        finding.code === "mojibake_runtime_surface" &&
        finding.filePath.endsWith("memory_summary.md")
    ),
    false
  );
  assert.equal(
    report.repoReports.find((repo) => repo.repoRoot === mixedRepo)?.ledger
      .legacy,
    1
  );
  assert.equal(
    report.repoReports.find((repo) => repo.repoRoot === structuredRepo)
      ?.findings.length,
    0
  );
});

test("normalizeMemorySurfaces migrates legacy ledger lines, preserves structured lines, and repairs global markdown", async () => {
  const repoRoot = await createRepoRoot("memory-normalize-repo");
  const globalRoot = await createGlobalRoot();
  const legacyLine = JSON.stringify({
    who: "assistant",
    what: "Decision: keep proposal-first writes.",
    when: "2026-04-21",
    context: "memory sprint"
  });
  const preservedStructuredLine = structuredEntry(repoRoot, "mem-preserved");
  const ledgerPath = path.join(repoRoot, ".agents", "MEMORY.ndjson");
  await writeLedger(repoRoot, [preservedStructuredLine, legacyLine]);

  const dryRun = await normalizeMemorySurfaces({
    repoRoots: [repoRoot],
    globalMemoryRoot: globalRoot,
    write: false,
    now: new Date("2026-04-22T12:00:00.000Z")
  });
  assert.equal(dryRun.repoResults[0]?.migratedEntries, 1);
  assert.ok(dryRun.changedFiles.includes(ledgerPath));
  assert.ok(
    dryRun.changedFiles.some((filePath) => filePath.endsWith("MEMORY.md"))
  );

  const result = await normalizeMemorySurfaces({
    repoRoots: [repoRoot],
    globalMemoryRoot: globalRoot,
    write: true,
    now: new Date("2026-04-22T12:00:00.000Z")
  });

  const ledgerLines = (await fs.readFile(ledgerPath, "utf8"))
    .trim()
    .split("\n");
  assert.equal(ledgerLines.length, 2);
  assert.equal(ledgerLines[0], preservedStructuredLine);

  const migrated = JSON.parse(ledgerLines[1]);
  assert.deepEqual(
    migrated,
    migrateLegacyMemoryRecord(repoRoot, {
      who: "assistant",
      what: "Decision: keep proposal-first writes.",
      when: "2026-04-21",
      context: "memory sprint"
    })
  );
  assert.equal(migrated.createdAt, "2026-04-21T12:00:00.000Z");
  assert.equal(
    migrated.source.detail,
    "legacy_memory_ndjson :: assistant :: context"
  );

  const backupPath = path.join(
    repoRoot,
    ".agents",
    "archive",
    "2026-04-22-memory-ledger-backup.ndjson"
  );
  assert.equal(
    await fs.readFile(backupPath, "utf8"),
    `${preservedStructuredLine}\n${legacyLine}\n`
  );

  const memoryMd = await fs.readFile(
    path.join(globalRoot, "MEMORY.md"),
    "utf8"
  );
  assert.match(memoryMd, /opção/i);
  assert.doesNotMatch(memoryMd, /\uFFFD/u);
  assert.ok(result.changedFiles.includes(ledgerPath));
  assert.ok(
    result.changedFiles.some((filePath) => filePath.endsWith("MEMORY.md"))
  );
});

test("auditMemorySurfaces ignores repeated nested bullets when they belong to different parent contexts", async () => {
  const repoRoot = await createRepoRoot("memory-audit-contextual-duplicates");
  const globalRoot = await createGlobalRoot();

  await fs.writeFile(
    path.join(repoRoot, ".agents", "ACTIVE.md"),
    [
      "# Active State",
      "",
      "## Current objective",
      "- Keep runtime memory readable.",
      "",
      "## Open loops",
      "- Context A",
      "  - `estado_fluxo = faq`",
      "  - `llm_used = false`",
      "- Context B",
      "  - `estado_fluxo = faq`",
      "  - `llm_used = false`"
    ].join("\n"),
    "utf8"
  );

  await writeLedger(repoRoot, [structuredEntry(repoRoot, "mem-context")]);

  const report = await auditMemorySurfaces({
    repoRoots: [repoRoot],
    globalMemoryRoot: globalRoot
  });

  assert.equal(
    report.findings.some((finding) => finding.code === "duplicate_bullet"),
    false
  );
  assert.equal(
    report.findings.some(
      (finding) => finding.code === "cross_context_repeated_bullet"
    ),
    false
  );
});

test("auditMemorySurfaces still flags exact sibling duplicates in the same context", async () => {
  const repoRoot = await createRepoRoot("memory-audit-real-duplicates");
  const globalRoot = await createGlobalRoot();

  await fs.writeFile(
    path.join(repoRoot, ".agents", "HANDOFF.md"),
    [
      "# Session Handoff",
      "",
      "## Restart protocol now",
      "- Read ACTIVE first.",
      "",
      "## Suggested commands",
      "- npm run lint",
      "- npm run lint"
    ].join("\n"),
    "utf8"
  );

  await writeLedger(repoRoot, [structuredEntry(repoRoot, "mem-duplicate")]);

  const report = await auditMemorySurfaces({
    repoRoots: [repoRoot],
    globalMemoryRoot: globalRoot
  });

  assert.ok(
    report.findings.some(
      (finding) =>
        finding.code === "duplicate_bullet" &&
        finding.filePath.endsWith("HANDOFF.md")
    )
  );
});

test("auditMemorySurfaces can emit a low signal for bullets repeated across many contexts", async () => {
  const repoRoot = await createRepoRoot("memory-audit-low-repeated-bullets");
  const globalRoot = await createGlobalRoot();

  await fs.writeFile(
    path.join(repoRoot, ".agents", "ACTIVE.md"),
    [
      "# Active State",
      "",
      "## Current objective",
      "- Context A",
      "  - `llm_used = false`",
      "- Context B",
      "  - `llm_used = false`",
      "- Context C",
      "  - `llm_used = false`"
    ].join("\n"),
    "utf8"
  );

  await writeLedger(repoRoot, [structuredEntry(repoRoot, "mem-low-signal")]);

  const report = await auditMemorySurfaces({
    repoRoots: [repoRoot],
    globalMemoryRoot: globalRoot
  });

  assert.ok(
    report.findings.some(
      (finding) =>
        finding.code === "cross_context_repeated_bullet" &&
        finding.severity === "low" &&
        finding.filePath.endsWith("ACTIVE.md")
    )
  );
});
