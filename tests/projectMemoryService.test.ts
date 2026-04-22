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
  assert.match((planning?.sources || []).join("\n"), /INDEX\.md/i);
  assert.match((planning?.sources || []).join("\n"), /PROJECT\.md/i);
});

test("readOperationalFile can open index and project surfaces", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService();

  await fs.writeFile(path.join(workdir, "INDEX.md"), "# INDEX\n", "utf8");
  await fs.writeFile(
    path.join(workdir, ".agents", "PROJECT.md"),
    "# PROJECT\n",
    "utf8"
  );

  assert.equal(
    await service.readOperationalFile(workdir, "index"),
    "# INDEX\n"
  );
  assert.equal(
    await service.readOperationalFile(workdir, "project"),
    "# PROJECT\n"
  );
});

test("buildMemoryPacket falls back to the first useful objective bullet when no canonical prefix exists", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService();

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
  const service = new ProjectMemoryService();

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

test("buildMemoryPacket falls back to the last closed residual when no numbered block exists", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService();

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
  const service = new ProjectMemoryService();
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
  assert.match(rendered, /\[durable_memory\|procedure\]/i);
  assert.doesNotMatch(rendered, /evidence:/i);
  assert.doesNotMatch(rendered, /source files:/i);
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
    })
  );

  const candidate = await service.captureCandidate({
    workdir,
    text: "Use este prompt de retomada em uma nova conversa: ```text Projeto: AgendadorConsultasOticas Quero retomar exatamente do estado vivo deste projeto.```",
    promptText: "isso tem que virar skill de projeto",
    source: { type: "operator", detail: "test" },
    evidence: { type: "assistant", value: "finalized:AgendadorConsultasOticas" }
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
  const service = new ProjectMemoryService();

  const weakRecap = await service.captureCandidate({
    workdir,
    text: "Entendi o ponto causal. Nao e a agenda que esta cega para sabado; e a ordenacao do funil depois da unidade.",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:AgendadorConsultasOticas" }
  });
  const warning = await service.captureCandidate({
    workdir,
    text: "[error] Under-development features enabled: memories. Under-development features are incomplete and may behave unpredictably.",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:AgendadorConsultasOticas" }
  });

  assert.equal(weakRecap, null);
  assert.equal(warning, null);
  assert.equal((await service.listCandidates(workdir)).length, 0);
});

test("captureCandidate drops narrated sprint closeout summaries from runtime", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService();

  const closeout = await service.captureCandidate({
    workdir,
    text: "Fechamos a sequencia ate o Sprint 6 com veredito honesto. Nesta passada eu conclui 4, 5 e 6; os 1, 2 e 3 ja vinham fechados do ciclo anterior.",
    promptText: "entao faca direto todas as sprints 1,2,3,4,5 e 6",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:AgendadorConsultasOticas" }
  });

  assert.equal(closeout, null);
  assert.equal((await service.listCandidates(workdir)).length, 0);
});

test("captureCandidate drops runtime meta narration that only describes the assistant next move", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService();

  const summary = await service.captureCandidate({
    workdir,
    text: "Resumo honesto: o backend deste ciclo fechou no vivo, mas o ledger ainda precisa limpeza.",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:AgendadorConsultasOticas" }
  });
  const nextMove = await service.captureCandidate({
    workdir,
    text: "Vou seguir direto sem reabrir coisa ja fechada. Agora vou publicar e repetir a prova viva.",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:AgendadorConsultasOticas" }
  });
  const observation = await service.captureCandidate({
    workdir,
    text: "O que apareceu foi bom sinal: o relatorio antigo ainda mostra riscos historicos, mas o vivo ja desmentiu parte deles.",
    source: { type: "runtime", detail: "finalized_codex_response" },
    evidence: { type: "assistant", value: "finalized:AgendadorConsultasOticas" }
  });

  assert.equal(summary, null);
  assert.equal(nextMove, null);
  assert.equal(observation, null);
  assert.equal((await service.listCandidates(workdir)).length, 0);
});

test("captureCandidate drops runtime wrappers and acknowledgement-style titles before they become skill candidates", async () => {
  const workdir = await createWorkspace();
  const service = new ProjectMemoryService();

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
