import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  SkillPromotionService,
  type SkillDraft
} from "../src/orchestrator/skillPromotionService.js";

async function createWorkspace(): Promise<string> {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "dex-agent-skill-"));
  await fs.mkdir(path.join(workdir, "skills"), { recursive: true });
  return workdir;
}

test("assessCandidate detects explicit reusable-skill intent", async () => {
  const workdir = await createWorkspace();
  const service = new SkillPromotionService({
    globalSkillsRoot: path.join(workdir, "global-skills")
  });

  const assessment = service.assessCandidate({
    workdir,
    projectName: path.basename(workdir),
    title: "Pipeline de retomada do projeto",
    summary:
      "Metodo padrao: primeiro leia ACTIVE.md, depois HANDOFF.md, depois rode npm run healthcheck. Contrato: ACTIVE e HANDOFF sao a fonte de verdade. Vamos usar isso de novo sempre que retomarmos este projeto.",
    promptText: "isso tem que virar skill de projeto",
    evidenceValue: "operator requested skill promotion"
  });

  assert.equal(assessment.destination, "project_skill");
  assert.equal(assessment.shouldSuggestSkill, true);
  assert.equal(assessment.shouldAutoPromote, true);
  assert.ok(assessment.score > 0);
  assert.match(assessment.rationale.join(" "), /explicitly asked/i);
});

test("assessCandidate does not infer project skill only from finalized repo evidence", async () => {
  const workdir = await createWorkspace();
  const service = new SkillPromotionService({
    globalSkillsRoot: path.join(workdir, "global-skills")
  });

  const assessment = service.assessCandidate({
    workdir,
    projectName: "AgendadorConsultasOticas",
    title: "Diagnostico curto",
    summary: "A mesa fechou numa leitura simples e objetiva.",
    promptText: "",
    evidenceValue: "finalized:AgendadorConsultasOticas"
  });

  assert.equal(assessment.destination, "memory");
  assert.equal(assessment.shouldSuggestSkill, false);
  assert.equal(assessment.shouldAutoPromote, false);
});

test("assessCandidate keeps explicit project-skill request under manual review without repeat evidence", async () => {
  const workdir = await createWorkspace();
  const service = new SkillPromotionService({
    globalSkillsRoot: path.join(workdir, "global-skills")
  });

  const assessment = service.assessCandidate({
    workdir,
    projectName: path.basename(workdir),
    title: "Restart invisivel do Dex Agent",
    summary:
      "Usar o launcher oficial para reiniciar o bot oculto com o state correto.",
    promptText: "isso tem que virar skill de projeto",
    evidenceValue: "operator requested skill promotion"
  });

  assert.equal(assessment.destination, "project_skill");
  assert.equal(assessment.shouldSuggestSkill, true);
  assert.equal(assessment.shouldAutoPromote, false);
  assert.match(assessment.rationale.join(" "), /repeat\/reuse signal/i);
});

test("assessCandidate blocks auto promotion without explicit method and contract signals", async () => {
  const workdir = await createWorkspace();
  const service = new SkillPromotionService({
    globalSkillsRoot: path.join(workdir, "global-skills")
  });

  const assessment = service.assessCandidate({
    workdir,
    projectName: path.basename(workdir),
    title: "Retomada do projeto",
    summary:
      "Primeiro leia ACTIVE.md, depois HANDOFF.md e depois rode npm run healthcheck. Vamos usar isso de novo sempre que retomarmos este projeto.",
    promptText: "isso tem que virar skill de projeto",
    evidenceValue: "operator requested skill promotion"
  });

  assert.equal(assessment.destination, "project_skill");
  assert.equal(assessment.shouldSuggestSkill, true);
  assert.equal(assessment.shouldAutoPromote, false);
  assert.match(assessment.rationale.join(" "), /explicit method signal/i);
  assert.match(assessment.rationale.join(" "), /explicit contract signal/i);
});

test("promoteSkill writes global canonical copy and repo mirror", async () => {
  const workdir = await createWorkspace();
  const globalRoot = path.join(workdir, "global-skills");
  const service = new SkillPromotionService({
    globalSkillsRoot: globalRoot
  });

  const draft = service.buildDraft({
    workdir,
    projectName: path.basename(workdir),
    title: "Promocao de fluxo reutilizavel",
    summary:
      "Fluxo usado em varios projetos para promover memoria repetida para skill.",
    promptText: "isso ja merece promocao para skill global",
    evidenceValue: "cross-project workflow",
    sourceDetail: "test",
    tags: ["memory", "skill", "global"],
    assessment: {
      destination: "global_skill",
      explicitSignals: [
        "Operator explicitly asked for reusable skill promotion."
      ],
      structuralSignals: ["The destination is clearly cross-project."],
      shouldSuggestSkill: true,
      shouldAutoPromote: true,
      score: 90,
      rationale: ["Strong reusable workflow."]
    }
  }) as SkillDraft;

  const result = await service.promoteSkill(draft);

  assert.equal(result.status, "created");
  await fs.access(path.join(globalRoot, draft.slug, "SKILL.md"));
  await fs.access(path.join(workdir, "skills", draft.slug, "SKILL.md"));
  const mirrored = await fs.readFile(
    path.join(workdir, "skills", draft.slug, "SKILL.md"),
    "utf8"
  );
  assert.match(mirrored, /Promocao de fluxo reutilizavel/i);
});

test("findRelevantSkills returns reusable skill matches for prompt reuse", async () => {
  const workdir = await createWorkspace();
  const service = new SkillPromotionService({
    globalSkillsRoot: path.join(workdir, "global-skills")
  });
  const folder = path.join(workdir, "skills", "retomada-projeto");
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(
    path.join(folder, "SKILL.md"),
    [
      "---",
      "name: retomada-projeto",
      "description: Use when the operator wants to resume the project quickly.",
      "---",
      "",
      "# Retomada de Projeto",
      "",
      "Leia ACTIVE.md, HANDOFF.md e depois rode npm run healthcheck."
    ].join("\n"),
    "utf8"
  );

  const relevant = await service.findRelevantSkills(
    workdir,
    "retomar o projeto lendo ACTIVE.md e HANDOFF.md"
  );

  assert.equal(relevant.length, 1);
  assert.equal(relevant[0]?.name, "retomada-projeto");
  assert.match(relevant[0]?.snippet || "", /resume the project quickly/i);
});

test("project skill root prefers authoritative .agents/skills inventory when present", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-skill-root-")
  );
  await fs.mkdir(path.join(workdir, ".agents", "skills", "skill-real"), {
    recursive: true
  });
  await fs.writeFile(
    path.join(workdir, ".agents", "skills", "README.md"),
    ["# Skills", "", "- `skill-real`"].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "skills", "skill-real", "SKILL.md"),
    [
      "---",
      "name: skill-real",
      "description: Skill real da pasta .agents/skills.",
      "---",
      "",
      "# Skill real",
      "",
      "Use quando precisar retomar a bateria viva do projeto."
    ].join("\n"),
    "utf8"
  );

  await fs.mkdir(path.join(workdir, "skills", "pseudo-skill"), {
    recursive: true
  });
  await fs.writeFile(
    path.join(workdir, "skills", "pseudo-skill", "SKILL.md"),
    [
      "---",
      "name: pseudo-skill",
      "description: Nao deveria ser priorizada.",
      "---",
      "",
      "# Pseudo"
    ].join("\n"),
    "utf8"
  );

  const service = new SkillPromotionService({
    globalSkillsRoot: path.join(workdir, "global-skills")
  });

  const relevant = await service.findRelevantSkills(
    workdir,
    "retomar bateria viva do projeto"
  );

  assert.equal(relevant.length, 1);
  assert.equal(relevant[0]?.name, "skill-real");
  assert.match(
    relevant[0]?.relativeSkillPath || "",
    /\.agents\/skills\/skill-real\//i
  );
});

test("findRelevantSkills uses authoritative README aliases and triggers for discovery", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-skill-alias-")
  );
  await fs.mkdir(
    path.join(workdir, ".agents", "skills", "agendador-runtime-live-battery"),
    {
      recursive: true
    }
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "skills", "README.md"),
    [
      "# Skills",
      "",
      "- `agendador-runtime-live-battery` aliases: bateria viva, bateria real | gatilhos: whatsapp autenticado, navegador real"
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(
      workdir,
      ".agents",
      "skills",
      "agendador-runtime-live-battery",
      "SKILL.md"
    ),
    [
      "---",
      "name: agendador-runtime-live-battery",
      "description: Use when the operator wants the authenticated real visual battery again.",
      "---",
      "",
      "# Bateria viva",
      "",
      "Use quando precisar rodar a bateria visual real."
    ].join("\n"),
    "utf8"
  );

  const service = new SkillPromotionService({
    globalSkillsRoot: path.join(workdir, "global-skills")
  });

  const relevant = await service.findRelevantSkills(
    workdir,
    "quero rodar de novo a bateria viva com whatsapp autenticado no navegador real"
  );

  assert.equal(relevant.length, 1);
  assert.equal(relevant[0]?.name, "agendador-runtime-live-battery");
});

test("findRelevantSkills ignores obviously invalid legacy skill folders even when authoritative README lists them", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-ignore-legacy-")
  );
  await fs.mkdir(path.join(workdir, ".agents", "skills", "skill-real"), {
    recursive: true
  });
  await fs.mkdir(path.join(workdir, ".agents", "skills", "sim"), {
    recursive: true
  });
  await fs.writeFile(
    path.join(workdir, ".agents", "skills", "README.md"),
    [
      "# Skills",
      "",
      "- `skill-real` aliases: bateria real | gatilhos: whatsapp autenticado",
      "- `sim` aliases: atendimento visao"
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "skills", "skill-real", "SKILL.md"),
    [
      "---",
      "name: skill-real",
      "description: Skill real e reaproveitavel do projeto.",
      "---",
      "",
      "# Skill real"
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "skills", "sim", "SKILL.md"),
    [
      "---",
      "name: sim",
      "description: Pseudo-skill ruim herdada de promocao antiga.",
      "---",
      "",
      "# Sim"
    ].join("\n"),
    "utf8"
  );

  const service = new SkillPromotionService({
    globalSkillsRoot: path.join(workdir, "global-skills")
  });

  const relevant = await service.findRelevantSkills(
    workdir,
    "quero rodar a bateria real com whatsapp autenticado"
  );

  assert.equal(relevant.length, 1);
  assert.equal(relevant[0]?.name, "skill-real");
  assert.doesNotMatch(relevant[0]?.relativeSkillPath || "", /\/sim\//i);
});

test("listProjectSkillStatus hides invalid legacy skills from recent reusable skills", async () => {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-status-legacy-")
  );
  await fs.mkdir(
    path.join(workdir, ".agents", "skills", "dex-agent-windows-restart"),
    {
      recursive: true
    }
  );
  await fs.mkdir(path.join(workdir, ".agents", "skills", "sim"), {
    recursive: true
  });
  await fs.writeFile(
    path.join(workdir, ".agents", "skills", "README.md"),
    [
      "# Skills",
      "",
      "- `dex-agent-windows-restart` aliases: restart oculto",
      "- `sim` aliases: atendimento visao"
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(
      workdir,
      ".agents",
      "skills",
      "dex-agent-windows-restart",
      "SKILL.md"
    ),
    [
      "---",
      "name: dex-agent-windows-restart",
      "description: Reinicio oculto com launcher oficial.",
      "---",
      "",
      "# Restart"
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "skills", "sim", "SKILL.md"),
    ["---", "name: sim", "description: Lixo legado.", "---", "", "# Sim"].join(
      "\n"
    ),
    "utf8"
  );

  const service = new SkillPromotionService({
    globalSkillsRoot: path.join(workdir, "global-skills")
  });

  const status = await service.listProjectSkillStatus(workdir);

  assert.equal(status.recentSkills.length, 1);
  assert.equal(status.recentSkills[0]?.name, "dex-agent-windows-restart");
});

test("assessCandidate blocks auto promotion when the title is not canonical enough", async () => {
  const workdir = await createWorkspace();
  const service = new SkillPromotionService({
    globalSkillsRoot: path.join(workdir, "global-skills")
  });

  const assessment = service.assessCandidate({
    workdir,
    projectName: path.basename(workdir),
    title:
      "Use este prompt de retomada em uma nova conversa para continuar exatamente do estado vivo do projeto com todos os detalhes",
    summary:
      "Primeiro leia ACTIVE.md, depois HANDOFF.md, depois rode npm run healthcheck.",
    promptText: "isso tem que virar skill de projeto",
    evidenceValue: "operator requested skill promotion"
  });

  assert.equal(assessment.destination, "project_skill");
  assert.equal(assessment.shouldSuggestSkill, true);
  assert.equal(assessment.shouldAutoPromote, false);
  assert.match(assessment.rationale.join(" "), /short canonical name/i);
});

test("assessCandidate blocks acknowledgement-style titles like Sim.", async () => {
  const workdir = await createWorkspace();
  const service = new SkillPromotionService({
    globalSkillsRoot: path.join(workdir, "global-skills")
  });

  const assessment = service.assessCandidate({
    workdir,
    projectName: path.basename(workdir),
    title: "Sim.",
    summary:
      "Usei o WhatsApp Web autenticado e confirmei que o alvo real foi a conversa certa.",
    promptText: "isso tem que virar skill de projeto",
    evidenceValue: "operator requested skill promotion"
  });

  assert.equal(assessment.shouldSuggestSkill, true);
  assert.equal(assessment.shouldAutoPromote, false);
});

test("buildDraft returns null for acknowledgement and meta titles", async () => {
  const workdir = await createWorkspace();
  const service = new SkillPromotionService({
    globalSkillsRoot: path.join(workdir, "global-skills")
  });

  const assessment = service.assessCandidate({
    workdir,
    projectName: path.basename(workdir),
    title: "Base suficiente: sim.",
    summary:
      "Confirmei o estado real no workspace e alinhei o proximo corte operacional.",
    promptText: "isso tem que virar skill de projeto",
    evidenceValue: "operator requested skill promotion"
  });

  const draft = service.buildDraft({
    workdir,
    projectName: path.basename(workdir),
    title: "Base suficiente: sim.",
    summary:
      "Confirmei o estado real no workspace e alinhei o proximo corte operacional.",
    promptText: "isso tem que virar skill de projeto",
    evidenceValue: "operator requested skill promotion",
    sourceDetail: "test",
    tags: ["memory", "skill"],
    assessment
  });

  assert.equal(draft, null);
});
