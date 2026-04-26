import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ProjectStatusSkill,
  buildProjectPromptPresets
} from "../src/orchestrator/skills/projectStatusSkill.js";
import { buildProjectUnderstanding } from "../src/orchestrator/projectIntelligence.js";
import { ProjectMemoryService } from "../src/orchestrator/memoryService.js";
import { ProjectReuseEngine } from "../src/orchestrator/reuseEngine.js";
import { PromptLibraryService } from "../src/orchestrator/promptLibraryService.js";

const DISABLE_GLOBAL_MEMORY = { globalMemoriesRoot: null } as const;

async function createMemoriaVivaWorkspace(): Promise<{
  workdir: string;
  memoryService: ProjectMemoryService;
}> {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "dex-agent-status-"));
  await fs.mkdir(path.join(workdir, ".agents"), { recursive: true });
  await fs.mkdir(path.join(workdir, ".codex"), { recursive: true });
  await fs.writeFile(
    path.join(workdir, "INDEX.md"),
    [
      "# INDEX",
      "",
      "## Agora",
      "- Projeto atual: dex-agent status test.",
      "- Objetivo atual: governanca de retomada.",
      "- Proximo passo indicado: validar motor e superficie."
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, "AGENTS.md"),
    ["# AGENTS", "", "- Sempre leia o contrato local antes da retomada."].join(
      "\n"
    ),
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "PROJECT.md"),
    [
      "# Project",
      "",
      "## Name",
      "dex-agent status test",
      "",
      "## Current focus",
      "- consolidar o motor de retomada."
    ].join("\n"),
    "utf8"
  );

  await fs.writeFile(
    path.join(workdir, ".agents", "ACTIVE.md"),
    [
      "# Active State",
      "",
      "## Current objective",
      "- Frente principal atual: memory runtime hardening.",
      "- Bloco `101-112` fechado como aprovado.",
      "- Proximo bloco elegivel: `113-124`.",
      "",
      "## Open loops",
      "- Expor a origem da memoria em respostas de status."
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
      "- nome: docs e governanca de retomada",
      "- conclusao: 100% concluido",
      "- posicao_no_plano: 1/1",
      "- objetivo_concluido: consolidar governanca",
      "- objetivo_atual: consolidar o motor de retomada",
      "- proximo_passo_indicado: implementar alinhamento do motor",
      "- retrocesso_padrao: reabrir revisao curta e corrigir o contrato",
      "- evidencia:",
      "  - `INDEX.md`",
      "  - `.agents/HANDOFF.md`",
      "",
      "## Latest completed",
      "- Bloco `101-112` fechado e validado.",
      "",
      "## Immediate next step",
      "- Proximo bloco elegivel agora: `113-124`.",
      "",
      "## Suggested commands",
      "- npm run frontend:audit:recurring",
      "- npm run frontend:confidence:report",
      "",
      "## Next queue",
      "- 113-124 -> consolidar runtime da memoria",
      "",
      "## First steps if resuming now",
      "- Ler ACTIVE.md e HANDOFF.md antes de agir."
    ].join("\n"),
    "utf8"
  );

  await fs.writeFile(
    path.join(workdir, ".codex", "napkin.md"),
    [
      "# Runbook",
      "",
      "- Always prefer durable memory proposals over implicit writes.",
      "- Show memory sources when confidence is low."
    ].join("\n"),
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
      "- `docs-governanca` | status: `ativo` | tipo: `sprint` | resumo: alinhar retomada | abre: `docs-governanca.md` | fallback: `.agents/HANDOFF.md`"
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
      "- [est-001] [governanca] Evitar divergencia entre prompt e runtime. | destino: monitorar"
    ].join("\n"),
    "utf8"
  );

  const ledgerEntries = [
    {
      id: "mem-001",
      createdAt: "2026-04-20T10:00:00.000Z",
      project: path.basename(workdir),
      scope: "repo",
      kind: "decision",
      title: "Keep durable memory proposal-first",
      summary:
        "Strong memory writes must be proposed and confirmed before append.",
      evidence: {
        type: "operator",
        value: "user decision"
      },
      tags: ["memory", "proposal", "durable"],
      supersedes: [],
      confidence: 0.95,
      source: {
        type: "operator",
        detail: "manual policy"
      }
    }
  ];

  await fs.writeFile(
    path.join(workdir, ".agents", "MEMORY.ndjson"),
    `${ledgerEntries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf8"
  );

  return {
    workdir,
    memoryService: new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY)
  };
}

test("project status skill reads canonical memoria-viva files and memory ledger", async () => {
  const { workdir, memoryService } = await createMemoriaVivaWorkspace();
  const skill = new ProjectStatusSkill(memoryService);
  const contract = await buildProjectUnderstanding({
    workdir,
    memoryService
  });
  const result = await skill.execute({
    text: "ignored",
    workdir
  });

  assert.equal(result.parseMode, "markdown");
  assert.equal(contract.projectProfile, "memoria-viva-project-profile");
  assert.equal(contract.decisionSource, "hybrid");
  assert.equal(contract.currentStatus.projectName, "dex-agent status test");
  assert.equal(
    contract.currentStatus.latestClosedBlock,
    "docs e governanca de retomada"
  );
  assert.equal(
    contract.currentStatus.nextEligibleBlock,
    "implementar alinhamento do motor"
  );
  assert.equal(
    contract.currentBlockStatus?.name,
    "docs e governanca de retomada"
  );
  assert.equal(
    contract.currentBlockStatus?.nextStep,
    "implementar alinhamento do motor"
  );
  assert.equal(contract.relevantMemory.length, 1);
  assert.equal(contract.memoryConfidence, "medium");
  assert.match(result.text, /\*Status Atual do Projeto\*/i);
  assert.match(result.text, /\*Current block status\*/i);
  assert.match(result.text, /\*Memory used:\*/i);
  assert.match(result.text, /\.agents\/MEMORY\.ndjson/i);
  assert.match(result.text, /INDEX\.md/i);
  assert.match(result.text, /AGENTS\.md/i);
  assert.match(result.text, /\.agents\/PROJECT\.md/i);
  assert.match(result.text, /\.agents\/sprints\/INDEX\.md/i);
  assert.match(result.text, /\.agents\/ESTACIONAMENTO\.md/i);
  assert.doesNotMatch(result.text, /C:\\/i);
});

test("project status and reuse resolve the same primary memory through the shared retrieval policy", async () => {
  const { workdir, memoryService } = await createMemoriaVivaWorkspace();
  const reuseEngine = new ProjectReuseEngine(memoryService);

  const understanding = await buildProjectUnderstanding({
    workdir,
    memoryService,
    variant: "next"
  });
  const prepared = await reuseEngine.preparePrompt({
    workdir,
    prompt: "continue the current memory runtime hardening work",
    intent: "continue"
  });

  assert.ok(understanding.relevantMemory.length >= 1);
  assert.ok(prepared.packet?.relevantMemory.length);
  assert.equal(
    prepared.packet?.relevantMemory[0]?.id,
    understanding.relevantMemory[0]?.id
  );
});

test("project status skill renders explicit variants only", async () => {
  const { workdir, memoryService } = await createMemoriaVivaWorkspace();
  const skill = new ProjectStatusSkill(memoryService);

  const executive = await skill.execute({
    text: "ignored",
    workdir,
    variant: "executive"
  });
  const next = await skill.execute({
    text: "ignored",
    workdir,
    variant: "next"
  });
  const steps = await skill.execute({
    text: "ignored",
    workdir,
    variant: "steps"
  });
  const commands = await skill.execute({
    text: "ignored",
    workdir,
    variant: "commands"
  });
  const prompts = await skill.execute({
    text: "ignored",
    workdir,
    variant: "prompts"
  });
  const queue = await skill.execute({
    text: "ignored",
    workdir,
    variant: "queue"
  });
  const sources = await skill.execute({
    text: "ignored",
    workdir,
    variant: "sources"
  });

  assert.match(executive.text, /\*Panorama Executivo\*/i);
  assert.match(executive.text, /docs e governanca de retomada/i);
  assert.match(next.text, /\*Proximo Bloco\*/i);
  assert.match(next.text, /implementar alinhamento do motor/i);
  assert.match(steps.text, /\*Primeiros Passos\*/i);
  assert.match(commands.text, /\*Comandos Sugeridos\*/i);
  assert.match(prompts.text, /\*Prompts Prontos\*/i);
  assert.match(prompts.text, /\*Execucao\*/i);
  assert.match(queue.text, /\*Fila de Proximos Blocos\*/i);
  assert.match(sources.text, /\*Fontes Canonicas Priorizadas\*/i);
  assert.match(sources.text, /AGENTS\.md/i);
  assert.match(sources.text, /\.agents\/ACTIVE\.md/i);
  assert.match(sources.text, /\.agents\/HANDOFF\.md/i);
  assert.match(sources.text, /\.agents\/sprints\/INDEX\.md/i);
  assert.match(sources.text, /\.agents\/ESTACIONAMENTO\.md/i);
  assert.match(sources.text, /\*Memory ledger used:\*/i);
});

test("project status commands variant keeps clickable preset buttons and compact operational shortcuts", async () => {
  const { workdir, memoryService } = await createMemoriaVivaWorkspace();
  const skill = new ProjectStatusSkill(memoryService);

  const commands = await skill.execute({
    text: "ignored",
    workdir,
    variant: "commands"
  });

  assert.equal(
    commands.buttons?.[0]?.[0]?.callbackData,
    "project_status:command:0"
  );
  assert.deepEqual(
    commands.buttons?.at(-1)?.map((button) => button.callbackData),
    ["inbox:show", "memory:show"]
  );
});

test("project status prompts variant exposes clickable preset prompt buttons", async () => {
  const { workdir, memoryService } = await createMemoriaVivaWorkspace();
  const promptLibraryService = new PromptLibraryService();
  await promptLibraryService.addPrompt(workdir, {
    label: "Sprint implementacao",
    prompt:
      "/plan concordo com voce quero crie os sprint de planejamento de implementacao usando $sprinter",
    intent: "planning"
  });
  const skill = new ProjectStatusSkill(memoryService, promptLibraryService);

  const prompts = await skill.execute({
    text: "ignored",
    workdir,
    variant: "prompts"
  });

  assert.match(prompts.text, /2 blocos seguidos/i);
  assert.match(prompts.text, /\*Custom\*/i);
  assert.match(prompts.text, /Sprint implementacao/i);
  assert.match(prompts.text, /tipo: Planejamento/i);
  const callbackData =
    prompts.buttons?.flat().map((button) => button.callbackData) || [];
  assert.ok(callbackData.includes("project_status:prompt:builtin~0"));
  assert.ok(callbackData.includes("project_status:prompt:builtin~3"));
  assert.equal(
    prompts.buttons?.[0]?.[0]?.callbackData,
    "project_status:prompt:builtin~0"
  );
});

test("project e2e preset stays generic to the current workspace instead of reusing a foreign fixed flow", async () => {
  const { workdir, memoryService } = await createMemoriaVivaWorkspace();
  const contract = await buildProjectUnderstanding({
    workdir,
    memoryService
  });
  const presets = buildProjectPromptPresets(contract);
  const preset = presets.find((entry) => entry.selector === "builtin:19");

  assert.ok(preset);
  assert.equal(preset.label, "Teste ponta a ponta");
  assert.match(preset.prompt, /fluxo principal deste workspace/i);
  assert.doesNotMatch(
    preset.prompt,
    /iniciar,\s*orientar,\s*marcar,\s*confirmar,\s*consultar,\s*remarcar/i
  );
});

test("project understanding handles partial memoria-viva profile without inventing sections", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-partial-")
  );
  await fs.mkdir(path.join(workdir, ".agents"), { recursive: true });
  await fs.writeFile(
    path.join(workdir, ".agents", "ACTIVE.md"),
    [
      "# Active State",
      "",
      "## Current objective",
      "- Frente principal atual: back-end.",
      "- Bloco `101-112` fechado como aprovado.",
      "- Proximo bloco elegivel: `113-124`.",
      "",
      "## Open loops",
      "- Nao abrir o proximo bloco sem veredito honesto."
    ].join("\n"),
    "utf8"
  );

  const contract = await buildProjectUnderstanding({
    workdir,
    memoryService: new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY)
  });

  assert.equal(contract.projectProfile, "memoria-viva-project-profile");
  assert.equal(contract.currentStatus.latestClosedBlock, "101-112");
  assert.equal(contract.currentStatus.nextEligibleBlock, "113-124");
  assert.equal(contract.suggestedCommands.length, 0);
  assert.equal(contract.nextQueue.length, 0);
  assert.equal(contract.usedOperationalState, true);
  assert.match(contract.renderHints.missingSections.join(", "), /HANDOFF\.md/i);
});

test("project status shows quick reuse when skills or skill candidates exist", async () => {
  const { workdir, memoryService } = await createMemoriaVivaWorkspace();
  await fs.mkdir(path.join(workdir, "skills", "retomada-projeto"), {
    recursive: true
  });
  await fs.writeFile(
    path.join(workdir, "skills", "retomada-projeto", "SKILL.md"),
    [
      "---",
      "name: retomada-projeto",
      "description: Use when the operator wants the recovery protocol again.",
      "---",
      "",
      "# Retomada Projeto",
      "",
      "Leia ACTIVE.md e HANDOFF.md antes de agir."
    ].join("\n"),
    "utf8"
  );
  await memoryService.captureCandidate({
    workdir,
    text: "Leia ACTIVE.md, HANDOFF.md e rode npm run healthcheck.",
    promptText: "isso precisa virar skill de projeto",
    source: { type: "operator", detail: "test" },
    evidence: { type: "operator", value: "skill pending" }
  });

  const skill = new ProjectStatusSkill(memoryService);
  const result = await skill.execute({
    text: "ignored",
    workdir
  });

  assert.match(result.text, /\*Reuso Rapido\*/i);
  assert.match(result.text, /retomada\\-projeto/i);
  assert.match(result.text, /Candidates de skill sob revisao/i);
});

test("project understanding returns safe fallback when no canonical profile exists", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-unknown-")
  );
  const contract = await buildProjectUnderstanding({
    workdir,
    memoryService: new ProjectMemoryService(undefined, DISABLE_GLOBAL_MEMORY)
  });

  assert.equal(contract.projectProfile, null);
  assert.equal(contract.decisionSource, "safe_fallback");
  assert.equal(contract.canonicalSources.length, 0);
  assert.equal(contract.memorySources.length, 0);
  assert.equal(contract.relevantMemory.length, 0);
  assert.match(
    contract.renderHints.safeFallbackReason || "",
    /padrao compativel de memoria viva/i
  );
});
