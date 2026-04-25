import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DashboardAdminService } from "../src/orchestrator/dashboardAdminService.js";

async function createWorkspace(): Promise<string> {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-dashboard-admin-")
  );
  await fs.mkdir(path.join(workdir, ".agents", "INBOX"), { recursive: true });
  await fs.mkdir(path.join(workdir, ".codex"), { recursive: true });
  await fs.writeFile(
    path.join(workdir, "INDEX.md"),
    "# INDEX\n\n## Agora\n- Dashboard admin interno.\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "PROJECT.md"),
    "# Project\n\n## Name\ndashboard admin test\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "ACTIVE.md"),
    "# Active State\n\n## Current objective\n- Abrir o dashboard admin com contrato seguro.\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "HANDOFF.md"),
    [
      "# Handoff",
      "",
      "## Current block status",
      "- tipo: bloco",
      "- nome: dashboard admin - sprint 1",
      "- objetivo_atual: abrir a primeira superficie interna",
      "- proximo_passo_indicado: prompts + historico"
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".codex", "napkin.md"),
    "# Runbook\n",
    "utf8"
  );
  return workdir;
}

test("dashboard admin service exposes prompts and history as the enabled v1 surface", async () => {
  const workdir = await createWorkspace();
  await fs.writeFile(
    path.join(workdir, ".agents", "PROMPTS.json"),
    `${JSON.stringify(
      [
        {
          id: "custom-001",
          createdAt: "2026-04-22T23:00:00.000Z",
          label: "Continuar bloco",
          prompt: "Continue o bloco atual.",
          intent: "continue"
        }
      ],
      null,
      2
    )}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "INBOX", "candidates.ndjson"),
    `${JSON.stringify({
      id: "cand-001",
      createdAt: "2026-04-22T23:05:00.000Z",
      workdir,
      project: path.basename(workdir),
      scope: "repo",
      kind: "task_state",
      stage: "durable_memory",
      baseKind: "task_state",
      title: "Bloco validado",
      summary: "O bloco atual ficou validado.",
      evidence: { type: "assistant", value: "finalized:dex-agent" },
      tags: ["bloco"],
      confidence: 0.8,
      source: { type: "runtime", detail: "test" },
      reasoning: ["Describes active project state."]
    })}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "INBOX", "proposals.ndjson"),
    `${JSON.stringify({
      id: "prop-001",
      createdAt: "2026-04-22T23:06:00.000Z",
      workdir,
      candidateId: "cand-001",
      destination: "memory",
      entry: {
        id: "mem-001",
        createdAt: "2026-04-22T23:06:00.000Z",
        project: path.basename(workdir),
        scope: "repo",
        kind: "task_state",
        stage: "durable_memory",
        title: "Bloco validado",
        summary: "O bloco atual ficou validado.",
        evidence: { type: "assistant", value: "finalized:dex-agent" },
        tags: ["bloco"],
        supersedes: [],
        confidence: 0.8,
        source: { type: "runtime", detail: "test" }
      },
      reason: "Describes active project state.",
      skillDraft: null
    })}\n`,
    "utf8"
  );

  const service = new DashboardAdminService();
  const snapshot = await service.inspect(workdir);

  assert.equal(snapshot.modules[0]?.key, "prompts");
  assert.equal(snapshot.modules[0]?.status, "enabled");
  assert.equal(snapshot.modules[1]?.key, "history");
  assert.equal(snapshot.modules[1]?.status, "enabled");
  assert.equal(snapshot.modules[2]?.key, "operation");
  assert.equal(snapshot.modules[2]?.status, "planned");
  assert.match(snapshot.modules[2]?.reason || "", /mutacoes de fila/i);
  assert.equal(snapshot.modules[3]?.key, "settings");
  assert.equal(snapshot.modules[3]?.status, "planned");

  assert.ok(
    snapshot.prompts.items.some((item) => item.selector === "builtin:0")
  );
  assert.ok(
    snapshot.prompts.items.some((item) => item.selector === "custom:custom-001")
  );
  assert.deepEqual(snapshot.prompts.capabilities, [
    "listBuiltins",
    "listCustom",
    "createCustom",
    "removeCustom"
  ]);

  assert.equal(snapshot.history.candidates[0]?.selector, "candidate:cand-001");
  assert.equal(snapshot.history.proposals[0]?.selector, "proposal:prop-001");
  assert.deepEqual(snapshot.history.capabilities, [
    "listCandidates",
    "listProposals",
    "explainCandidate",
    "discardCandidate",
    "proposePromotion",
    "cancelProposal"
  ]);

  assert.equal(snapshot.operation.enabled, false);
  assert.equal(snapshot.settings.enabled, false);
});
