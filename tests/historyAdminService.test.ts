import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { HistoryAdminService } from "../src/orchestrator/historyAdminService.js";

async function createWorkspace(): Promise<string> {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-history-admin-")
  );
  await fs.mkdir(path.join(workdir, ".agents"), { recursive: true });
  await fs.mkdir(path.join(workdir, ".codex"), { recursive: true });
  return workdir;
}

test("history admin service lists candidates and proposals with prefixed selectors", async () => {
  const workdir = await createWorkspace();
  const candidatesPath = path.join(
    workdir,
    ".agents",
    "INBOX",
    "candidates.ndjson"
  );
  const proposalsPath = path.join(
    workdir,
    ".agents",
    "INBOX",
    "proposals.ndjson"
  );
  await fs.mkdir(path.dirname(candidatesPath), { recursive: true });
  await fs.writeFile(
    candidatesPath,
    `${JSON.stringify({
      id: "cand-1",
      createdAt: "2026-04-22T22:00:00.000Z",
      workdir,
      project: path.basename(workdir),
      scope: "repo",
      kind: "skill_candidate",
      stage: "skill_candidate",
      baseKind: "procedure",
      title: "Fluxo repetivel",
      summary: "Um fluxo reutilizavel aguardando revisao.",
      evidence: { type: "assistant", value: "finalized:dex-agent" },
      tags: ["fluxo"],
      confidence: 0.8,
      source: { type: "runtime", detail: "test" },
      reasoning: ["Looks reusable."],
      destination: "project_skill",
      autoPromote: false,
      skillAssessment: null,
      skillDraft: null
    })}\n`,
    "utf8"
  );
  await fs.writeFile(
    proposalsPath,
    `${JSON.stringify({
      id: "prop-1",
      createdAt: "2026-04-22T22:05:00.000Z",
      workdir,
      candidateId: "cand-1",
      destination: "project_skill",
      entry: {
        id: "mem-1",
        createdAt: "2026-04-22T22:05:00.000Z",
        project: path.basename(workdir),
        scope: "repo",
        kind: "procedure",
        stage: "real_skill",
        title: "Fluxo repetivel",
        summary: "Um fluxo reutilizavel aguardando revisao.",
        evidence: { type: "assistant", value: "finalized:dex-agent" },
        tags: ["fluxo"],
        supersedes: [],
        confidence: 0.8,
        source: { type: "runtime", detail: "test" }
      },
      reason: "Looks reusable.",
      skillDraft: null
    })}\n`,
    "utf8"
  );

  const service = new HistoryAdminService();
  const state = await service.listHistoryAdminState(workdir);

  assert.equal(state.candidates.length, 1);
  assert.equal(state.candidates[0]?.selector, "candidate:cand-1");
  assert.equal(state.candidates[0]?.destination, "project_skill");

  assert.equal(state.proposals.length, 1);
  assert.equal(state.proposals[0]?.selector, "proposal:prop-1");
  assert.equal(state.proposals[0]?.candidateSelector, "candidate:cand-1");
});

test("history admin service explains, proposes and cancels via admin selectors", async () => {
  const workdir = await createWorkspace();
  const service = new HistoryAdminService();

  const candidatesPath = path.join(
    workdir,
    ".agents",
    "INBOX",
    "candidates.ndjson"
  );
  await fs.mkdir(path.dirname(candidatesPath), { recursive: true });
  await fs.writeFile(
    candidatesPath,
    `${JSON.stringify({
      id: "cand-2",
      createdAt: "2026-04-22T22:10:00.000Z",
      workdir,
      project: path.basename(workdir),
      scope: "repo",
      kind: "task_state",
      stage: "durable_memory",
      baseKind: "task_state",
      title: "Bloco fechado",
      summary: "O bloco atual foi encerrado com veredito honesto.",
      evidence: { type: "assistant", value: "finalized:dex-agent" },
      tags: ["bloco"],
      confidence: 0.8,
      source: { type: "runtime", detail: "test" },
      reasoning: ["Describes active project state."]
    })}\n`,
    "utf8"
  );

  const explanation = await service.explainHistoryCandidate(
    workdir,
    "candidate:cand-2"
  );
  assert.match(explanation || "", /Candidate cand-2/);

  const proposal = await service.proposeHistoryCandidate(
    workdir,
    "candidate:cand-2"
  );
  assert.equal(proposal?.candidateSelector, "candidate:cand-2");
  assert.equal(proposal?.selector.startsWith("proposal:"), true);

  const canceled = await service.cancelHistoryProposal(
    workdir,
    proposal!.selector
  );
  assert.equal(canceled?.id, proposal?.id);
});

test("history admin service discards candidate via prefixed selector and rejects invalid selector", async () => {
  const workdir = await createWorkspace();
  const candidatesPath = path.join(
    workdir,
    ".agents",
    "INBOX",
    "candidates.ndjson"
  );
  await fs.mkdir(path.dirname(candidatesPath), { recursive: true });
  await fs.writeFile(
    candidatesPath,
    `${JSON.stringify({
      id: "cand-3",
      createdAt: "2026-04-22T22:20:00.000Z",
      workdir,
      project: path.basename(workdir),
      scope: "repo",
      kind: "task_state",
      stage: "durable_memory",
      baseKind: "task_state",
      title: "Outro bloco",
      summary: "Outro item de historico.",
      evidence: { type: "assistant", value: "finalized:dex-agent" },
      tags: ["historico"],
      confidence: 0.8,
      source: { type: "runtime", detail: "test" },
      reasoning: ["Describes active project state."]
    })}\n`,
    "utf8"
  );

  const service = new HistoryAdminService();
  const discarded = await service.discardHistoryCandidate(
    workdir,
    "candidate:cand-3"
  );
  assert.equal(discarded?.selector, "candidate:cand-3");

  const state = await service.listHistoryAdminState(workdir);
  assert.equal(state.candidates.length, 0);

  await assert.rejects(
    () => service.discardHistoryCandidate(workdir, "cand-3"),
    /history_admin_selector_invalid/
  );
});
