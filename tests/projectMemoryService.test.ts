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

const DISABLE_GLOBAL_MEMORY = { globalMemoriesRoot: null } as const;

async function createWorkspace(): Promise<string> {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "dex-agent-memory-"));
  await fs.mkdir(path.join(workdir, ".agents"), { recursive: true });
  await fs.mkdir(path.join(workdir, ".codex"), { recursive: true });
  return workdir;
}

async function writeLedger(
  workdir: string,
  entries: MemoryEntry[]
): Promise<void> {
  await fs.writeFile(
    path.join(workdir, ".agents", "MEMORY.ndjson"),
    `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf8"
  );
}

async function createGlobalMemoriesRoot(files?: {
  memoryMd?: string;
  summaryMd?: string;
}): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-global-memory-")
  );
  if (files?.memoryMd) {
    await fs.writeFile(path.join(root, "MEMORY.md"), files.memoryMd, "utf8");
  }
  if (files?.summaryMd) {
    await fs.writeFile(
      path.join(root, "memory_summary.md"),
      files.summaryMd,
      "utf8"
    );
  }
  return root;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("queryMemory returns empty result when no ledger exists", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

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
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);
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
      summary:
        "Status and planning prompts must inject a compact project memory packet.",
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

test("queryMemory reads matching global markdown memories and ignores unrelated task groups", async () => {
  const workdir = await createWorkspace();
  const globalRoot = await createGlobalMemoriesRoot({
    memoryMd: [
      "# Task Group: Dex Agent memory routing",
      `scope: keep recall aligned in ${path.basename(workdir)}`,
      `applies_to: cwd=${workdir}; reuse_rule=use for this repo only`,
      "",
      "## Reusable knowledge",
      "- Use global memory as recall context without merging it into the local ledger.",
      "",
      "## Failures and how to do differently",
      "- Symptom: global recall gets copied into project ledger -> fix: keep global recall separate from local durable memory.",
      "",
      "# Task Group: Unrelated repo",
      "scope: ignore this for dex-agent",
      "applies_to: cwd=C:\\OtherRepo; reuse_rule=ignore",
      "",
      "## Reusable knowledge",
      "- This note should never show up for dex-agent prompts."
    ].join("\n"),
    summaryMd: [
      "## User Profile",
      "",
      "The operator expects honest routing and explicit boundaries.",
      "",
      "## User preferences",
      "- Prefer proposal-first durable memory writes.",
      "",
      "## General Tips",
      "- Keep recall adapters separate from durable project writes."
    ].join("\n")
  });
  const service = new ProjectMemoryService(undefined, {
    globalMemoriesRoot: globalRoot
  });

  const result = await service.queryMemory({
    workdir,
    prompt:
      "how should dex-agent keep global memory separate from local ledger",
    intent: "implementation"
  });

  assert.ok(result.entries.length >= 1);
  assert.match(result.entries[0]?.summary || "", /ledger/i);
  assert.ok(
    result.entries.every(
      (entry) => !/never show up for dex-agent/i.test(entry.summary)
    )
  );
  assert.ok(result.sources.some((source) => source.endsWith("MEMORY.md")));
});

test("queryMemory can rank a global memory above a weaker local hit", async () => {
  const workdir = await createWorkspace();
  const globalRoot = await createGlobalMemoriesRoot({
    memoryMd: [
      "# Task Group: Dex Agent global memory adapter",
      "scope: ranking behavior for dex-agent",
      `applies_to: cwd=${path.basename(workdir)}; reuse_rule=use here`,
      "",
      "## Reusable knowledge",
      "- Global markdown memory adapter keeps markdown recall separate and always-on for dex-agent."
    ].join("\n")
  });
  const service = new ProjectMemoryService(undefined, {
    globalMemoriesRoot: globalRoot
  });
  await writeLedger(workdir, [
    {
      id: "mem-local",
      createdAt: "2026-04-20T10:00:00.000Z",
      project: path.basename(workdir),
      scope: "repo",
      kind: "fact",
      title: "Local routing note",
      summary: "Memory exists.",
      evidence: { type: "operator", value: "local note" },
      tags: ["memory"],
      supersedes: [],
      confidence: 0.2,
      source: { type: "operator", detail: "local" }
    }
  ]);

  const result = await service.queryMemory({
    workdir,
    prompt: "global markdown memory adapter separate always-on dex-agent",
    intent: "implementation"
  });

  assert.ok(result.entries.length >= 1);
  assert.match(
    result.entries[0]?.title || "",
    /Dex Agent global memory adapter/i
  );
});

test("appendGlobalMemoryPointer writes a concise global pointer without touching local ledger", async () => {
  const workdir = await createWorkspace();
  const globalRoot = await createGlobalMemoriesRoot();
  const service = new ProjectMemoryService(undefined, {
    globalMemoriesRoot: globalRoot
  });

  const result = await service.appendGlobalMemoryPointer({
    trigger: "global memory pointer indexing",
    source:
      "C:\\Users\\TestUser\\Projetos\\dex-memoria\\.harness\\contracts\\specs\\normalize-global-memory-write-policy.yaml",
    lookup:
      "Memory-worthy records should create a short global pointer to the full dex-memoria layer.",
    conflictWinner:
      "The current source of truth wins over stale restrictive wording.",
    doNotUseWhen:
      "The candidate is large, secret-bearing, obsolete, or only noise.",
    reviewAfter: "After the linked spec or runtime memory contract changes.",
    note: "Pointer only; full operational content stays in project memory."
  });

  assert.equal(result.ok, true);
  assert.equal(result.path, path.join(globalRoot, "MEMORY.md"));
  assert.match(result.entry || "", /global memory pointer indexing/i);

  const memoryMd = await fs.readFile(
    path.join(globalRoot, "MEMORY.md"),
    "utf8"
  );
  assert.match(memoryMd, /short global pointer/i);
  await assert.rejects(
    fs.stat(path.join(workdir, ".agents", "MEMORY.ndjson")),
    /ENOENT/
  );
});

test("appendGlobalMemoryPointer rejects large or sensitive global pointer payloads", async () => {
  const globalRoot = await createGlobalMemoriesRoot();
  const service = new ProjectMemoryService(undefined, {
    globalMemoriesRoot: globalRoot
  });

  const tooLarge = await service.appendGlobalMemoryPointer({
    trigger: "x".repeat(321),
    source: "C:\\Users\\TestUser\\Projetos\\dex-memoria\\README.md",
    lookup: "pointer",
    conflictWinner: "user request",
    doNotUseWhen: "large content",
    reviewAfter: "later"
  });
  assert.deepEqual(tooLarge, { ok: false, reason: "too_large" });

  const sensitive = await service.appendGlobalMemoryPointer({
    trigger: "secret-bearing request",
    source: "C:\\Users\\TestUser\\Projetos\\dex-memoria\\README.md",
    lookup: "token=abc123 should never be stored globally",
    conflictWinner: "secret hygiene",
    doNotUseWhen: "contains secrets",
    reviewAfter: "never"
  });
  assert.deepEqual(sensitive, { ok: false, reason: "sensitive" });
});

test("applyPromotion writes local durable memory and a global recall pointer", async () => {
  const workdir = await createWorkspace();
  const globalRoot = await createGlobalMemoriesRoot();
  const service = new ProjectMemoryService(undefined, {
    globalMemoriesRoot: globalRoot
  });

  await service.captureCandidate({
    workdir,
    text: "Decision: global memory pointers index concise recall and point to the local full context.",
    source: { type: "operator", detail: "test" },
    evidence: { type: "operator", value: "memory-worthy rule" }
  });

  const proposal = await service.proposePromotion(workdir, 0);
  assert.ok(proposal);

  const result = await service.applyPromotion(workdir, proposal!.id);
  assert.equal(result.ok, true);
  assert.equal(result.globalMemoryPointer?.ok, true);

  const ledger = await fs.readFile(
    path.join(workdir, ".agents", "MEMORY.ndjson"),
    "utf8"
  );
  assert.match(ledger, /global memory pointers index concise recall/i);

  const memoryMd = await fs.readFile(
    path.join(globalRoot, "MEMORY.md"),
    "utf8"
  );
  assert.match(memoryMd, /Source of truth:/i);
  assert.match(memoryMd, /\.agents[\\/]MEMORY\.ndjson#/i);
  assert.match(memoryMd, /global memory pointers index concise recall/i);
});

test("applyPromotion appends valid durable memory and avoids duplicates", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

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
  const firstService = new ProjectMemoryService(
    undefined,
    DISABLE_GLOBAL_MEMORY
  );

  const candidate = await firstService.captureCandidate({
    workdir,
    text: "Decision: candidates and proposals must be file-backed in the inbox layer.",
    source: { type: "operator", detail: "restart test" },
    evidence: { type: "operator", value: "restart assertion" }
  });
  assert.ok(candidate);

  const proposal = await firstService.proposePromotion(workdir, candidate!.id);
  assert.ok(proposal);

  const secondService = new ProjectMemoryService(
    undefined,
    DISABLE_GLOBAL_MEMORY
  );
  const candidates = await secondService.listCandidates(workdir);
  const proposals = await secondService.listProposals(workdir);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.id, candidate?.id);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0]?.id, proposal?.id);
});

test("buildMemoryPacket skips trivial prompts and includes operational state for planning", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

  await fs.writeFile(
    path.join(workdir, "INDEX.md"),
    [
      "# INDEX",
      "",
      "## Agora",
      "- Objetivo atual: recover status quickly.",
      "- Proximo passo indicado: consolidar camada 2."
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, "AGENTS.md"),
    ["# Agents", "", "- Follow local repo instructions before resuming."].join(
      "\n"
    ),
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "PROJECT.md"),
    [
      "# Project",
      "",
      "## Current focus",
      "- tighten recovery governance."
    ].join("\n"),
    "utf8"
  );
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
    path.join(workdir, ".agents", "HANDOFF.md"),
    [
      "# Handoff",
      "",
      "## Current block status",
      "- tipo: sprint",
      "- nome: camada 2",
      "- objetivo_atual: harden recovery governance",
      "- proximo_passo_indicado: alinhar o motor ao contrato"
    ].join("\n"),
    "utf8"
  );

  await fs.writeFile(
    path.join(workdir, ".codex", "napkin.md"),
    ["# Runbook", "", "- Prefer compact packets over raw file dumps."].join(
      "\n"
    ),
    "utf8"
  );
  await fs.mkdir(path.join(workdir, ".agents", "sprints"), {
    recursive: true
  });
  await fs.writeFile(
    path.join(workdir, ".agents", "sprints", "INDEX.md"),
    [
      "# Sprints Index",
      "",
      "## Catalogo",
      "- `camada-2` | status: `ativo` | tipo: `sprint` | resumo: alinhar motor | abre: `camada-2.md` | fallback: `.agents/HANDOFF.md`"
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "ESTACIONAMENTO.md"),
    [
      "# Estacionamento",
      "",
      "## Ativos",
      "",
      "- [est-001] [governanca] Confirmar que protocolo humano e runtime nao divergem. | destino: monitorar"
    ].join("\n"),
    "utf8"
  );
  await writeLedger(workdir, []);

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
  assert.equal(planning?.currentObjective, "harden recovery governance");
  assert.equal(planning?.latestClosedBlock, "301-312");
  assert.equal(planning?.nextEligibleBlock, "alinhar o motor ao contrato");
  assert.equal(planning?.usedOperationalState, true);
  const sources = (planning?.sources || []).join("\n");
  assert.match(sources, /INDEX\.md/i);
  assert.match(sources, /AGENTS\.md/i);
  assert.match(sources, /PROJECT\.md/i);
  assert.match(sources, /ACTIVE\.md/i);
  assert.match(sources, /HANDOFF\.md/i);
  assert.match(sources, /napkin\.md/i);
  assert.match(sources, /\.agents[\\/]sprints[\\/]INDEX\.md/i);
  assert.match(sources, /ESTACIONAMENTO\.md/i);
  assert.match(sources, /MEMORY\.ndjson/i);
});

test("readOperationalFile can open canonical recovery surfaces", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

  await fs.writeFile(path.join(workdir, "INDEX.md"), "# INDEX\n", "utf8");
  await fs.writeFile(path.join(workdir, "AGENTS.md"), "# AGENTS\n", "utf8");
  await fs.writeFile(
    path.join(workdir, ".agents", "PROJECT.md"),
    "# PROJECT\n",
    "utf8"
  );
  await fs.mkdir(path.join(workdir, ".agents", "sprints"), {
    recursive: true
  });
  await fs.writeFile(
    path.join(workdir, ".agents", "sprints", "INDEX.md"),
    "# SPRINTS\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "ESTACIONAMENTO.md"),
    "# ESTACIONAMENTO\n",
    "utf8"
  );

  assert.equal(
    await service.readOperationalFile(workdir, "index"),
    "# INDEX\n"
  );
  assert.equal(
    await service.readOperationalFile(workdir, "agents"),
    "# AGENTS\n"
  );
  assert.equal(
    await service.readOperationalFile(workdir, "project"),
    "# PROJECT\n"
  );
  assert.equal(
    await service.readOperationalFile(workdir, "sprintsIndex"),
    "# SPRINTS\n"
  );
  assert.equal(
    await service.readOperationalFile(workdir, "estacionamento"),
    "# ESTACIONAMENTO\n"
  );
});

test("buildMemoryPacket falls back to the first useful objective bullet when no canonical prefix exists", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

  await fs.writeFile(
    path.join(workdir, ".agents", "ACTIVE.md"),
    [
      "# Active State",
      "",
      "## Current objective",
      "- BLOQUEIO OPERACIONAL segue ativo desde `2026-04-20`.",
      "- Nao retomar `777-788` nem qualquer frente de front-end sem autorizacao explicita.",
      "- Frente backend deste ciclo foi fechada com veredito unico e honesto em `2026-04-21`."
    ].join("\n"),
    "utf8"
  );

  const packet = await service.buildMemoryPacket({
    workdir,
    prompt: "continue do ponto certo",
    intent: "continue"
  });

  assert.ok(packet);
  assert.equal(
    packet?.currentObjective,
    "BLOQUEIO OPERACIONAL segue ativo desde `2026-04-20`."
  );
});

test("buildMemoryPacket reads the next eligible slot from the human ACTIVE format", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

  await fs.writeFile(
    path.join(workdir, ".agents", "ACTIVE.md"),
    [
      "# Active State",
      "",
      "## Current objective",
      "- Frente ativa: acompanhar a bateria viva `33`.",
      "",
      "## Product boundary",
      "- Frente historica de front-end continua estacionada.",
      "- Proximo slot elegivel no historico de front-end: `777-788`."
    ].join("\n"),
    "utf8"
  );

  const packet = await service.buildMemoryPacket({
    workdir,
    prompt: "continue do ponto certo",
    intent: "continue"
  });

  assert.ok(packet);
  assert.equal(packet?.nextEligibleBlock, "777-788");
});

test("buildMemoryPacket uses completed Current block status as the latest closed block", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

  await fs.writeFile(
    path.join(workdir, ".agents", "ACTIVE.md"),
    [
      "# Active State",
      "",
      "## Current objective",
      "- Operar a UX final do Telegram."
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "HANDOFF.md"),
    [
      "# Session Handoff",
      "",
      "## Current block status",
      "- tipo: `bloco`",
      "- nome: `final actions - prompt sugerido, botoes dinamicos e piloto x3`",
      "- conclusao: `100% concluido`",
      "- objetivo_atual: `validar a proxima resposta final real no Telegram`",
      "- proximo_passo_indicado: `monitorar proxima resposta final`"
    ].join("\n"),
    "utf8"
  );

  const packet = await service.buildMemoryPacket({
    workdir,
    prompt: "continue do ponto certo",
    intent: "continue"
  });

  assert.ok(packet);
  assert.equal(
    packet?.latestClosedBlock,
    "final actions - prompt sugerido, botoes dinamicos e piloto x3"
  );
  assert.equal(
    packet?.currentObjective,
    "validar a proxima resposta final real no Telegram"
  );
});

test("buildMemoryPacket uses bloco_atual Current block status as the latest closed block", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

  await fs.writeFile(
    path.join(workdir, ".agents", "ACTIVE.md"),
    [
      "# Active State",
      "",
      "## Current objective",
      "- Operar o backend deste ciclo como fechado."
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "HANDOFF.md"),
    [
      "# Session Handoff",
      "",
      "## Current block status",
      "- bloco_atual: `estabilizacao_repo_status_checkpoint`",
      "- status: `fechado`",
      "- veredito: `Sprint concluido: diff classificado.`",
      "- proximo_passo_seguro: `manter backend fechado; novo trabalho somente com corte explicito`"
    ].join("\n"),
    "utf8"
  );

  const packet = await service.buildMemoryPacket({
    workdir,
    prompt: "continue do ponto certo",
    intent: "continue"
  });

  assert.ok(packet);
  assert.equal(
    packet?.latestClosedBlock,
    "estabilizacao_repo_status_checkpoint"
  );
  assert.equal(
    packet?.nextEligibleBlock,
    "manter backend fechado; novo trabalho somente com corte explicito"
  );
});

test("buildMemoryPacket falls back to the last closed residual when no numbered block exists", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

  await fs.writeFile(
    path.join(workdir, ".agents", "ACTIVE.md"),
    [
      "# Active State",
      "",
      "## Current objective",
      "- Frente ativa: acompanhar a bateria viva `33`.",
      "",
      "## Last closed residual",
      "- Residual fechado no vivo: `guided_help_plus_schedule`",
      "- Residual fechado no vivo: `explicit_saturday_offer_priority`"
    ].join("\n"),
    "utf8"
  );

  const packet = await service.buildMemoryPacket({
    workdir,
    prompt: "continue do ponto certo",
    intent: "continue"
  });

  assert.ok(packet);
  assert.equal(packet?.latestClosedBlock, "explicit_saturday_offer_priority");
});

test("renderMemoryPacket keeps the injected packet compact and omits raw evidence lines", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);
  await writeLedger(workdir, [
    {
      id: "mem-1",
      createdAt: "2026-04-20T10:00:00.000Z",
      project: path.basename(workdir),
      scope: "repo",
      kind: "procedure",
      stage: "durable_memory",
      title: "Use active handoff healthcheck",
      summary: "Leia ACTIVE.md, leia HANDOFF.md e rode npm run healthcheck.",
      evidence: { type: "operator", value: "explicit procedure" },
      tags: ["active", "handoff", "healthcheck"],
      supersedes: [],
      confidence: 0.95,
      source: { type: "operator", detail: "test" }
    }
  ]);
  await fs.writeFile(
    path.join(workdir, ".agents", "ACTIVE.md"),
    ["## Current objective", "- improve memory retrieval"].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "HANDOFF.md"),
    [
      "## Latest completed",
      "- bloco `301-312` fechado",
      "Proximo bloco elegivel: `313-324`"
    ].join("\n"),
    "utf8"
  );

  const packet = await service.buildMemoryPacket({
    workdir,
    prompt: "continue do ponto certo",
    intent: "continue"
  });

  assert.ok(packet);
  const rendered = service.renderMemoryPacket(
    packet!,
    "continue do ponto certo"
  );
  assert.match(rendered, /Authoritative project memory packet:/i);
  assert.match(rendered, /\[workspace\|durable_memory\|procedure\]/i);
  assert.doesNotMatch(rendered, /evidence:/i);
  assert.doesNotMatch(rendered, /source files:/i);
});

test("buildMemoryPacket and source disclosure include workspace-relative and global-absolute sources", async () => {
  const workdir = await createWorkspace();
  const globalRoot = await createGlobalMemoriesRoot({
    summaryMd: [
      "## User Profile",
      "",
      "The operator uses dex-agent as a long-lived operational workspace.",
      "",
      "## User preferences",
      "- Always disclose when memory came from a global source.",
      "",
      "## General Tips",
      "- Keep memory source paths explicit."
    ].join("\n")
  });
  const service = new ProjectMemoryService(undefined, {
    globalMemoriesRoot: globalRoot
  });
  await writeLedger(workdir, [
    {
      id: "mem-local",
      createdAt: "2026-04-20T10:00:00.000Z",
      project: path.basename(workdir),
      scope: "repo",
      kind: "rule",
      stage: "durable_memory",
      title: "Show memory sources",
      summary:
        "Always disclose where memory came from in dex-agent status flows.",
      evidence: { type: "operator", value: "local rule" },
      tags: ["memory", "sources", "dex-agent"],
      supersedes: [],
      confidence: 0.95,
      source: { type: "operator", detail: "local" }
    }
  ]);

  const packet = await service.buildMemoryPacket({
    workdir,
    prompt: "show memory sources for dex-agent",
    intent: "status"
  });

  assert.ok(packet);
  const disclosure = service.buildSourceDisclosure(packet!);
  assert.match(disclosure || "", /\.agents[\\/]MEMORY\.ndjson/i);
  assert.match(disclosure || "", /memory_summary\.md/i);
  assert.match(disclosure || "", new RegExp(escapeRegex(globalRoot)));

  const rendered = service.renderMemoryPacket(packet!, "show memory sources");
  assert.match(rendered, /\[workspace\|durable_memory\|rule\]/i);
  assert.match(rendered, /\[global\|durable_memory\|(rule|procedure|fact)\]/i);
});

test("captureCandidate upgrades strong repeated workflow into skill candidate metadata", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(
    new SkillPromotionService({
      globalSkillsRoot: path.join(workdir, "global-skills")
    }),
    DISABLE_GLOBAL_MEMORY
  );

  const candidate = await service.captureCandidate({
    workdir,
    text: "Metodo padrao: primeiro leia ACTIVE.md, depois HANDOFF.md, depois rode npm run healthcheck para validar a retomada. Contrato: ACTIVE e HANDOFF sao a fonte de verdade. Vamos usar isso de novo sempre que retomarmos este projeto.",
    promptText: "isso tem que virar skill de projeto",
    source: { type: "operator", detail: "test" },
    evidence: { type: "operator", value: "explicit skill request" }
  });

  assert.ok(candidate);
  assert.equal(candidate?.kind, "skill_candidate");
  assert.equal(candidate?.stage, "skill_candidate");
  assert.equal(candidate?.destination, "project_skill");
  assert.equal(candidate?.autoPromote, true);
  assert.ok(candidate?.skillDraft);
});

test("captureCandidate keeps manual-review items as base kind without forcing skill_candidate stage", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(
    new SkillPromotionService({
      globalSkillsRoot: path.join(workdir, "global-skills")
    }),
    DISABLE_GLOBAL_MEMORY
  );

  const candidate = await service.captureCandidate({
    workdir,
    text: "Use este prompt de retomada em uma nova conversa: ```text Projeto: ProjetoAlphaTeste Quero retomar exatamente do estado vivo deste projeto.```",
    promptText: "isso tem que virar skill de projeto",
    source: { type: "operator", detail: "test" },
    evidence: { type: "assistant", value: "finalized:ProjetoAlphaTeste" }
  });

  assert.ok(candidate);
  assert.notEqual(candidate?.kind, "skill_candidate");
  assert.equal(candidate?.kind, "fact");
  assert.equal(candidate?.stage, "durable_memory");
  assert.equal(candidate?.destination, "project_skill");
  assert.equal(candidate?.skillDraft, null);
});

test("captureCandidate drops weak runtime recap titles and warnings", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

  const weakRecap = await service.captureCandidate({
    workdir,
    text: "Entendi o ponto causal. Nao e a fila que esta cega para sabado; e a ordenacao do funil depois da unidade.",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:ProjetoAlphaTeste" }
  });
  const warning = await service.captureCandidate({
    workdir,
    text: "[error] Under-development features enabled: memories. Under-development features are incomplete and may behave unpredictably.",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:ProjetoAlphaTeste" }
  });

  assert.equal(weakRecap, null);
  assert.equal(warning, null);
  assert.equal((await service.listCandidates(workdir)).length, 0);
});

test("captureCandidate drops narrated sprint closeout summaries from runtime", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

  const closeout = await service.captureCandidate({
    workdir,
    text: "Fechamos a sequencia ate o Sprint 6 com veredito honesto. Nesta passada eu conclui 4, 5 e 6; os 1, 2 e 3 ja vinham fechados do ciclo anterior.",
    promptText: "entao faca direto todas as sprints 1,2,3,4,5 e 6",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:ProjetoAlphaTeste" }
  });

  assert.equal(closeout, null);
  assert.equal((await service.listCandidates(workdir)).length, 0);
});

test("captureCandidate drops runtime meta narration that only describes the assistant next move", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

  const summary = await service.captureCandidate({
    workdir,
    text: "Resumo honesto: o backend deste ciclo fechou no vivo, mas o ledger ainda precisa limpeza.",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:ProjetoAlphaTeste" }
  });
  const nextMove = await service.captureCandidate({
    workdir,
    text: "Vou seguir direto sem reabrir coisa ja fechada. Agora vou publicar e repetir a prova viva.",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:ProjetoAlphaTeste" }
  });
  const observation = await service.captureCandidate({
    workdir,
    text: "O que apareceu foi bom sinal: o relatorio antigo ainda mostra riscos historicos, mas o vivo ja desmentiu parte deles.",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:ProjetoAlphaTeste" }
  });

  assert.equal(summary, null);
  assert.equal(nextMove, null);
  assert.equal(observation, null);
  assert.equal((await service.listCandidates(workdir)).length, 0);
});

test("captureCandidate drops runtime wrappers and acknowledgement-style titles before they become skill candidates", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

  const acknowledgement = await service.captureCandidate({
    workdir,
    text: "Nao por completo. O estado real hoje e este: a superficie nova foi implantada, mas a migracao retroativa ainda nao.",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:dex-agent" }
  });
  const focusWrapper = await service.captureCandidate({
    workdir,
    text: "**Foco atual** Planejar a implementacao do alinhamento do motor do dex-agent ao contrato novo de retomada.",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:dex-agent" }
  });
  const verdictWrapper = await service.captureCandidate({
    workdir,
    text: "**Veredito** O PROMPT_AGENTE_CODEX_CONTEXTO.md tem utilidade real e deve existir.",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:dex-agent" }
  });
  const sessionState = await service.captureCandidate({
    workdir,
    text: "[Construir | mapeador-implementacao] Adicionei os especialistas sugeridos para a sessao e usei os dois no proximo passo real do sprint.",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:dex-agent" }
  });
  const organizerWrapper = await service.captureCandidate({
    workdir,
    text: "[Organizar | organizador-ao-vivo] Fechei o proximo passo e adicionei os especialistas da sessao no corte certo.",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:dex-agent" }
  });

  assert.equal(acknowledgement, null);
  assert.equal(focusWrapper, null);
  assert.equal(verdictWrapper, null);
  assert.equal(sessionState, null);
  assert.equal(organizerWrapper, null);
  assert.equal((await service.listCandidates(workdir)).length, 0);
});

test("listCandidates ignores BOM-prefixed mojibake recent-context entries", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);
  const inboxDir = path.join(workdir, ".agents", "INBOX");
  await fs.mkdir(inboxDir, { recursive: true });
  const corrupted = {
    id: "bad-1",
    createdAt: new Date().toISOString(),
    workdir,
    project: path.basename(workdir),
    scope: "repo",
    kind: "task_state",
    stage: "recent_context",
    baseKind: "task_state",
    title:
      "**Foco agora** A mesa convergiu que a prioridade dominante nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©",
    summary:
      "Combinado, e jÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ deixei isso persistido como regra de trabalho.",
    evidence: { type: "assistant", value: "finalized:dex-agent" },
    tags: ["foco", "agora"],
    confidence: 0.8,
    source: { type: "runtime", detail: "finalized_codex_response" },
    reasoning: ["Describes active project state."]
  };
  const healthy = {
    id: "good-1",
    createdAt: new Date().toISOString(),
    workdir,
    project: path.basename(workdir),
    scope: "repo",
    kind: "task_state",
    stage: "recent_context",
    baseKind: "task_state",
    title: "Bloco de docs alinhado ao baseline publicado.",
    summary: "O repo ficou limpo e a retomada foi sincronizada.",
    evidence: { type: "assistant", value: "finalized:dex-agent" },
    tags: ["docs", "baseline"],
    confidence: 0.8,
    source: { type: "runtime", detail: "finalized_codex_response" },
    reasoning: ["Describes active project state."]
  };
  await fs.writeFile(
    path.join(inboxDir, "candidates.ndjson"),
    `\uFEFF${JSON.stringify(corrupted)}\n${JSON.stringify(healthy)}\n`,
    "utf8"
  );

  const candidates = await service.listCandidates(workdir);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.id, "good-1");
});

test("captureCandidate drops severe mojibake before writing to candidates", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

  const candidate = await service.captureCandidate({
    workdir,
    text: "Combinado, e jÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ deixei isso persistido como regra de trabalho.",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:dex-agent" }
  });

  assert.equal(candidate, null);
  assert.equal((await service.listCandidates(workdir)).length, 0);
});

test("captureFinalizedResponse ignores generic finalized text without explicit memory intent", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

  const result = await service.captureFinalizedResponse({
    chatId: "1",
    workdir,
    promptText: "continue do ponto certo",
    text: "Resumo honesto: o runtime ja voltou, mas ainda preciso revisar os detalhes antes de fechar."
  });

  assert.equal(result.candidate, null);
  assert.equal(result.message, null);
  assert.equal((await service.listCandidates(workdir)).length, 0);
});

test("captureFinalizedResponse accepts structured memory lines even without explicit remember intent", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

  const result = await service.captureFinalizedResponse({
    chatId: "1",
    workdir,
    promptText: "continue do ponto certo",
    text: [
      "Analise concluida.",
      "Decision: use a single retrieval query builder for project status and reuse.",
      "Seguimos com a implementacao."
    ].join("\n")
  });

  assert.ok(result.candidate);
  assert.equal(result.candidate?.kind, "decision");
  assert.match(
    result.candidate?.summary || "",
    /single retrieval query builder/i
  );
});

test("queryMemory prefers repo memory over transversal summary guidance when both are relevant", async () => {
  const workdir = await createWorkspace();
  const globalRoot = await createGlobalMemoriesRoot({
    memoryMd: [
      "# Task Group: Dex Agent source disclosure",
      `scope: disclosure rules for ${path.basename(workdir)}`,
      `applies_to: cwd=${workdir}; reuse_rule=use here`,
      "",
      "## Reusable knowledge",
      "- Dex Agent status flows must disclose workspace and global memory sources explicitly."
    ].join("\n"),
    summaryMd: [
      "## User Profile",
      "",
      "The operator expects explicit boundaries.",
      "",
      "## User preferences",
      "- Keep memory source paths explicit.",
      "",
      "## General Tips",
      "- Prefer separated recall adapters."
    ].join("\n")
  });
  const service = new ProjectMemoryService(undefined, {
    globalMemoriesRoot: globalRoot
  });

  const result = await service.queryMemory({
    workdir,
    prompt: "show memory sources",
    intent: "status",
    operationalContext: {
      projectName: path.basename(workdir),
      currentObjective: "show memory sources in dex-agent status flows",
      nextEligibleBlock: "expose memory sources in project status",
      latestClosedBlock: null
    }
  });

  assert.ok(result.entries.length >= 2);
  assert.match(result.entries[0]?.title || "", /Dex Agent source disclosure/i);
});

test("queryMemory boosts recent task_state when it matches the active continuation objective", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY);

  await writeLedger(workdir, [
    {
      id: "mem-decision",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
      project: path.basename(workdir),
      scope: "repo",
      kind: "decision",
      title: "Keep queue recovery visible",
      summary: "Queue recovery should stay visible during restart handling.",
      evidence: { type: "operator", value: "older decision" },
      tags: ["queue", "recovery", "restart"],
      supersedes: [],
      confidence: 0.95,
      source: { type: "operator", detail: "old decision" }
    },
    {
      id: "mem-task-state",
      createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      project: path.basename(workdir),
      scope: "task",
      kind: "task_state",
      title: "Queue recovery remains the active objective",
      summary:
        "Current objective: continue queue recovery after restart with source disclosure preserved.",
      evidence: { type: "assistant", value: "recent status" },
      tags: ["queue", "recovery", "restart", "disclosure"],
      supersedes: [],
      confidence: 0.75,
      source: { type: "runtime", detail: "recent_status" }
    }
  ]);

  const result = await service.queryMemory({
    workdir,
    prompt: "continue queue recovery",
    intent: "continue",
    operationalContext: {
      projectName: path.basename(workdir),
      currentObjective: "continue queue recovery after restart",
      nextEligibleBlock: "keep memory source disclosure visible",
      latestClosedBlock: null
    }
  });

  assert.equal(result.entries[0]?.id, "mem-task-state");
});

test("global markdown cache reuses parsed content until the source mtime changes", async () => {
  const workdir = await createWorkspace();
  const globalRoot = await createGlobalMemoriesRoot({
    memoryMd: [
      "# Task Group: Dex Agent cache test",
      `scope: cache behavior for ${path.basename(workdir)}`,
      `applies_to: cwd=${workdir}; reuse_rule=use here`,
      "",
      "## Reusable knowledge",
      "- First cache version stays active while mtime is unchanged."
    ].join("\n")
  });
  const service = new ProjectMemoryService(undefined, {
    globalMemoriesRoot: globalRoot
  });
  const memoryPath = path.join(globalRoot, "MEMORY.md");
  const fixedCachedTime = new Date("2026-04-20T10:00:00.000Z");
  await fs.utimes(memoryPath, fixedCachedTime, fixedCachedTime);

  const first = await service.queryMemory({
    workdir,
    prompt: "first cache version",
    intent: "implementation"
  });
  assert.match(first.entries[0]?.summary || "", /First cache version/i);

  await fs.writeFile(
    memoryPath,
    [
      "# Task Group: Dex Agent cache test",
      `scope: cache behavior for ${path.basename(workdir)}`,
      `applies_to: cwd=${workdir}; reuse_rule=use here`,
      "",
      "## Reusable knowledge",
      "- Second cache version should only appear after mtime changes."
    ].join("\n"),
    "utf8"
  );
  await fs.utimes(memoryPath, fixedCachedTime, fixedCachedTime);

  const cached = await service.queryMemory({
    workdir,
    prompt: "cache version",
    intent: "implementation"
  });
  assert.match(cached.entries[0]?.summary || "", /First cache version/i);

  const refreshedTime = new Date("2026-04-20T10:00:05.000Z");
  await fs.utimes(memoryPath, refreshedTime, refreshedTime);

  const refreshed = await service.queryMemory({
    workdir,
    prompt: "cache version",
    intent: "implementation"
  });
  assert.match(refreshed.entries[0]?.summary || "", /Second cache version/i);
});

test("captureFinalizedResponse auto-promotes strong project skill workflows", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService(
    new SkillPromotionService({
      globalSkillsRoot: path.join(workdir, "global-skills")
    }),
    DISABLE_GLOBAL_MEMORY
  );

  const result = await service.captureFinalizedResponse({
    chatId: "1",
    workdir,
    promptText: "isso tem que virar skill de projeto",
    text: "Metodo padrao: primeiro leia ACTIVE.md, depois HANDOFF.md, depois rode npm run healthcheck para validar a retomada. Contrato: ACTIVE e HANDOFF sao a fonte de verdade. Vamos usar isso de novo sempre que retomarmos este projeto."
  });

  assert.ok(result.candidate);
  assert.match(
    result.message || "",
    /Aprendi um novo procedimento de projeto/i
  );

  const createdSkillPath = result.promotionResult?.createdPaths.find(
    (createdPath) => createdPath.endsWith(`${path.sep}SKILL.md`)
  );
  assert.ok(createdSkillPath);
  assert.match(
    createdSkillPath || "",
    /(\.agents|skills)[\\/].+[\\/]SKILL\.md$/i
  );

  const ledger = await fs.readFile(
    path.join(workdir, ".agents", "MEMORY.ndjson"),
    "utf8"
  );
  assert.match(ledger, /skill-promoted/i);
});
