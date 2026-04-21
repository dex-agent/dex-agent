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
      "Primeiro leia ACTIVE.md, depois HANDOFF.md, depois rode npm run healthcheck.",
    promptText: "isso tem que virar skill de projeto",
    evidenceValue: "operator requested skill promotion"
  });

  assert.equal(assessment.destination, "project_skill");
  assert.equal(assessment.shouldSuggestSkill, true);
  assert.equal(assessment.shouldAutoPromote, true);
  assert.match(assessment.rationale.join(" "), /explicitly asked/i);
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
      explicitSignals: ["Operator explicitly asked for reusable skill promotion."],
      structuralSignals: ["The destination is clearly cross-project."],
      shouldSuggestSkill: true,
      shouldAutoPromote: true,
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
  assert.match(relevant[0]?.snippet || "", /ACTIVE\.md/i);
});
