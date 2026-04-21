import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProjectMemoryService } from "../src/orchestrator/memoryService.js";
import { ProjectReuseEngine } from "../src/orchestrator/reuseEngine.js";

async function createWorkdir(name: string): Promise<string> {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
  await fs.mkdir(path.join(workdir, ".agents"), { recursive: true });
  await fs.mkdir(path.join(workdir, ".codex"), { recursive: true });
  await fs.writeFile(
    path.join(workdir, ".agents", "ACTIVE.md"),
    "## Current objective\n- keep reuse stable\n",
    "utf8"
  );
  return workdir;
}

test("reuse engine prepares prompt packets with relevant skill context", async () => {
  const workdir = await createWorkdir("reuse-engine-prompt");
  const memoryService = new ProjectMemoryService();
  const engine = new ProjectReuseEngine(memoryService);

  const draft = memoryService.getSkillPromotionService().buildDraft({
    workdir,
    projectName: path.basename(workdir),
    title: "Restart Dex Agent hidden on Windows",
    summary: "Use the hidden Windows launcher and inspect restart logs.",
    promptText:
      "When restart fails on Windows, relaunch using the hidden launcher and inspect restart logs.",
    evidenceValue: "scripts/restart-dex-agent-hidden.vbs",
    sourceDetail: "promoted reusable restart workflow",
    tags: ["restart", "windows", "dex-agent"],
    assessment: {
      destination: "project_skill",
      explicitSignals: ["Operator explicitly asked for reusable skill promotion."],
      structuralSignals: [
        "The workflow contains three or more explicit steps.",
        "The workflow references commands, files, or contracts that are likely reusable."
      ],
      shouldSuggestSkill: true,
      shouldAutoPromote: true,
      rationale: ["Strong reusable project workflow."]
    }
  });
  assert.ok(draft);
  await memoryService.getSkillPromotionService().promoteSkill(draft);

  const prepared = await engine.preparePrompt({
    workdir,
    intent: "implementation",
    prompt: "restart o dex-agent escondido no windows e confira os logs"
  });

  assert.equal(prepared.relevantSkills.length, 1);
  assert.match(prepared.promptWithSkills, /Reusable project skills likely relevant:/);
  assert.match(
    prepared.disclosure || "",
    /Reusing project skill context: restart-dex-agent-hidden-on-windows/
  );
});

test("reuse engine delegates finalized response capture through the shared memory service", async () => {
  const workdir = await createWorkdir("reuse-engine-finalized");
  const engine = new ProjectReuseEngine(new ProjectMemoryService());

  const result = await engine.captureFinalizedResponse({
    chatId: 1,
    workdir,
    promptText:
      "isso tem que virar skill de projeto: usar o launcher oculto do dex-agent no windows",
    text: `Passos:
1. abrir scripts/restart-dex-agent-hidden.vbs
2. validar scripts/restart-dex-agent-hidden.ps1
3. conferir .runtime/restart-bootstrap.log`
  });

  assert.match(result.message || "", /Aprendi um novo procedimento de projeto/);
  assert.ok(result.promotionResult);
  assert.ok(
    result.promotionResult?.createdPaths.some((createdPath) =>
      createdPath.endsWith(`${path.sep}SKILL.md`)
    )
  );
  const skillStatus = await engine.getProjectSkillStatus(workdir);
  assert.ok(skillStatus.recentSkills.length >= 1);
});
