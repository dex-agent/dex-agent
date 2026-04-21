import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PromptLibraryService } from "../src/orchestrator/promptLibraryService.js";

async function createWorkspace(): Promise<string> {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "dex-agent-prompts-"));
  await fs.mkdir(path.join(workdir, ".agents"), { recursive: true });
  return workdir;
}

test("prompt library persists custom prompts across service restarts", async () => {
  const workdir = await createWorkspace();
  const firstService = new PromptLibraryService();

  const created = await firstService.addPrompt(workdir, {
    label: "Sprint implementacao",
    prompt:
      "/plan concordo com voce quero crie os sprint de planejamento de implementacao usando $sprinter",
    intent: "planning"
  });

  const secondService = new PromptLibraryService();
  const prompts = await secondService.listPrompts(workdir);

  assert.equal(prompts.length, 1);
  assert.equal(prompts[0]?.id, created.id);
  assert.equal(prompts[0]?.intent, "planning");
});

test("prompt library removes prompts by id", async () => {
  const workdir = await createWorkspace();
  const service = new PromptLibraryService();
  const created = await service.addPrompt(workdir, {
    label: "Panorama forte",
    prompt: "Me devolva um panorama forte do projeto.",
    intent: "status"
  });

  const removed = await service.removePrompt(workdir, created.id);
  assert.equal(removed?.id, created.id);
  assert.equal((await service.listPrompts(workdir)).length, 0);
});
