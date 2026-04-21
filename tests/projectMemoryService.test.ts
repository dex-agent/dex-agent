import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ProjectMemoryService,
  type MemoryEntry
} from "../src/orchestrator/memoryService.js";
import { SkillPromotionService } from "../src/orchestrator/skillPromotionService.js";

async function createWorkspace(): Promise<string> {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "dex-agent-memory-"));
  await fs.mkdir(path.join(workdir, ".agents"), { recursive: true });
  await fs.mkdir(path.join(workdir, ".codex"), { recursive: true });
  return workdir;
}

async function writeLedger(workdir: string, entries: MemoryEntry[]): Promise<void> {
  await fs.writeFile(
    path.join(workdir, ".agents", "MEMORY.ndjson"),
    `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf8"
  );
}

test("queryMemory returns empty result when no ledger exists", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService();

  const result = await service.queryMemory({
    workdir,
    prompt: "status do projeto",
    intent: "status"
  });

  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.sources, []);
  assert.equal(result.confidence, "none");
});

test("queryMemory prefers repo-scoped relevant entries and ignores superseded ones", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService();
  const now = "2026-04-20T10:00:00.000Z";

  await writeLedger(workdir, [
    {
      id: "mem-old",
      createdAt: "2026-04-10T10:00:00.000Z",
      project: path.basename(workdir),
      scope: "repo",
      kind: "decision",
      title: "Use old routing flow",
      summary: "Legacy routing guidance.",
      evidence: { type: "operator", value: "legacy note" },
      tags: ["routing", "legacy"],
      supersedes: [],
      confidence: 0.5,
      source: { type: "operator", detail: "old" }
    },
    {
      id: "mem-new",
      createdAt: now,
      project: path.basename(workdir),
      scope: "repo",
      kind: "decision",
      title: "Use project memory packet for status and planning",
      summary: "Status and planning prompts must inject a compact project memory packet.",
      evidence: { type: "operator", value: "accepted plan" },
      tags: ["memory", "status", "planning"],
      supersedes: ["mem-old"],
      confidence: 0.95,
      source: { type: "operator", detail: "accepted plan" }
    },
    {
      id: "mem-noise",
      createdAt: now,
      project: path.basename(workdir),
      scope: "task",
      kind: "noise",
      title: "Temporary chatter",
      summary: "This should never be retrieved.",
      evidence: { type: "assistant", value: "chat" },
      tags: ["temporary"],
      supersedes: [],
      confidence: 0.2,
      source: { type: "runtime", detail: "chat" }
    }
  ]);

  const result = await service.queryMemory({
    workdir,
    prompt: "status and planning memory",
    intent: "planning"
  });

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]?.id, "mem-new");
  assert.equal(result.confidence, "high");
});

test("applyPromotion appends valid durable memory and avoids duplicates", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService();

  await service.captureCandidate({
    workdir,
    text: "Decision: durable memory writes require operator confirmation.",
    source: { type: "operator", detail: "test" },
    evidence: { type: "operator", value: "explicit rule" }
  });

  const proposal = await service.proposePromotion(workdir, 0);
  assert.ok(proposal);

  const first = await service.applyPromotion(workdir, proposal!.id);
  assert.equal(first.ok, true);

  const ledgerPath = path.join(workdir, ".agents", "MEMORY.ndjson");
  const ledgerAfterFirst = await fs.readFile(ledgerPath, "utf8");
  assert.match(ledgerAfterFirst, /operator confirmation/i);

  await service.captureCandidate({
    workdir,
    text: "Decision: durable memory writes require operator confirmation.",
    source: { type: "operator", detail: "test" },
    evidence: { type: "operator", value: "explicit rule" }
  });
  const duplicateProposal = await service.proposePromotion(workdir, 0);
  assert.ok(duplicateProposal);

  const second = await service.applyPromotion(workdir, duplicateProposal!.id);
  assert.equal(second.ok, false);
  assert.equal(second.reason, "duplicate");
});

test("candidates and proposals survive service restart through the inbox files", async () => {
  const workdir = await createWorkspace();
  const firstService = new ProjectMemoryService();

  const candidate = await firstService.captureCandidate({
    workdir,
    text: "Decision: candidates and proposals must be file-backed in the inbox layer.",
    source: { type: "operator", detail: "restart test" },
    evidence: { type: "operator", value: "restart assertion" }
  });
  assert.ok(candidate);

  const proposal = await firstService.proposePromotion(workdir, candidate!.id);
  assert.ok(proposal);

  const secondService = new ProjectMemoryService();
  const candidates = await secondService.listCandidates(workdir);
  const proposals = await secondService.listProposals(workdir);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.id, candidate?.id);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0]?.id, proposal?.id);
});

test("buildMemoryPacket skips trivial prompts and includes operational state for planning", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService();

  await fs.writeFile(
    path.join(workdir, ".agents", "ACTIVE.md"),
    [
      "# Active State",
      "",
      "## Current objective",
      "- Frente principal atual: improve memory retrieval.",
      "- Bloco `301-312` fechado como aprovado.",
      "- Proximo bloco elegivel: `313-324`."
    ].join("\n"),
    "utf8"
  );

  await fs.writeFile(
    path.join(workdir, ".codex", "napkin.md"),
    [
      "# Runbook",
      "",
      "- Prefer compact packets over raw file dumps."
    ].join("\n"),
    "utf8"
  );

  const trivial = await service.buildMemoryPacket({
    workdir,
    prompt: "ls",
    intent: "trivial"
  });
  assert.equal(trivial, null);

  const planning = await service.buildMemoryPacket({
    workdir,
    prompt: "plan next sprint",
    intent: "planning"
  });
  assert.ok(planning);
  assert.equal(planning?.currentObjective, "improve memory retrieval");
  assert.equal(planning?.latestClosedBlock, "301-312");
  assert.equal(planning?.nextEligibleBlock, "313-324");
  assert.equal(planning?.usedOperationalState, true);
});

test("captureCandidate upgrades strong repeated workflow into skill candidate metadata", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(
    new SkillPromotionService({
      globalSkillsRoot: path.join(workdir, "global-skills")
    })
  );

  const candidate = await service.captureCandidate({
    workdir,
    text:
      "Primeiro leia ACTIVE.md, depois HANDOFF.md, depois rode npm run healthcheck para validar a retomada.",
    promptText: "isso tem que virar skill de projeto",
    source: { type: "operator", detail: "test" },
    evidence: { type: "operator", value: "explicit skill request" }
  });

  assert.ok(candidate);
  assert.equal(candidate?.kind, "skill_candidate");
  assert.equal(candidate?.destination, "project_skill");
  assert.equal(candidate?.autoPromote, true);
  assert.ok(candidate?.skillDraft);
});

test("captureFinalizedResponse auto-promotes strong project skill workflows", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(
    new SkillPromotionService({
      globalSkillsRoot: path.join(workdir, "global-skills")
    })
  );

  const result = await service.captureFinalizedResponse({
    chatId: "1",
    workdir,
    promptText: "isso tem que virar skill de projeto",
    text:
      "Primeiro leia ACTIVE.md, depois HANDOFF.md, depois rode npm run healthcheck para validar a retomada."
  });

  assert.ok(result.candidate);
  assert.match(result.message || "", /Aprendi um novo procedimento de projeto/i);

  const skillFolders = await fs.readdir(path.join(workdir, "skills"));
  assert.equal(skillFolders.length, 1);

  const ledger = await fs.readFile(
    path.join(workdir, ".agents", "MEMORY.ndjson"),
    "utf8"
  );
  assert.match(ledger, /skill-promoted/i);
});
