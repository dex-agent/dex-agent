import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PromptAdminService } from "../src/orchestrator/promptAdminService.js";

async function createWorkspace(): Promise<string> {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "dex-agent-prompt-admin-")
  );
  await fs.mkdir(path.join(workdir, ".agents"), { recursive: true });
  await fs.mkdir(path.join(workdir, ".codex"), { recursive: true });
  await fs.writeFile(
    path.join(workdir, "INDEX.md"),
    ["# INDEX", "", "## Agora", "- Projeto atual: dashboard admin."].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "PROJECT.md"),
    ["# Project", "", "## Name", "dashboard admin test"].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(workdir, ".agents", "ACTIVE.md"),
    [
      "# Active State",
      "",
      "## Current objective",
      "- Abrir o dashboard admin com contrato seguro."
    ].join("\n"),
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
      "- conclusao: em andamento",
      "- objetivo_atual: fechar contrato do admin",
      "- proximo_passo_indicado: modulo prompts"
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

test("prompt admin service lists builtins and custom prompts in one unified shape", async () => {
  const workdir = await createWorkspace();
  await fs.writeFile(
    path.join(workdir, ".agents", "PROMPTS.json"),
    `${JSON.stringify(
      [
        {
          id: "custom-123",
          createdAt: "2026-04-22T21:10:00.000Z",
          label: "Custom sprint",
          prompt: "Continue o sprint atual.",
          intent: "continue"
        }
      ],
      null,
      2
    )}\n`,
    "utf8"
  );

  const service = new PromptAdminService();
  const items = await service.listPromptAdminItems(workdir);

  const builtin = items.find((item) => item.selector === "builtin:0");
  const custom = items.find((item) => item.selector === "custom:custom-123");

  assert.ok(builtin);
  assert.equal(builtin?.source, "builtin");
  assert.equal(builtin?.removable, false);
  assert.equal(builtin?.createdAt, null);

  assert.ok(custom);
  assert.equal(custom?.source, "custom");
  assert.equal(custom?.group, "Custom");
  assert.equal(custom?.removable, true);
  assert.equal(custom?.createdAt, "2026-04-22T21:10:00.000Z");
});

test("prompt admin service creates custom prompt items with admin selector", async () => {
  const workdir = await createWorkspace();
  const service = new PromptAdminService();

  const created = await service.createPromptAdminItem(workdir, {
    label: "Planejar bloco",
    prompt: "Monte o plano do proximo bloco.",
    intent: "planning"
  });

  assert.equal(created.source, "custom");
  assert.equal(created.group, "Custom");
  assert.equal(created.removable, true);
  assert.match(created.selector, /^custom:/);

  const persisted = JSON.parse(
    await fs.readFile(path.join(workdir, ".agents", "PROMPTS.json"), "utf8")
  ) as Array<{ label: string; intent: string }>;
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]?.label, "Planejar bloco");
  assert.equal(persisted[0]?.intent, "planning");
});

test("prompt admin service removes only custom prompts via admin selector", async () => {
  const workdir = await createWorkspace();
  await fs.writeFile(
    path.join(workdir, ".agents", "PROMPTS.json"),
    `${JSON.stringify(
      [
        {
          id: "custom-456",
          createdAt: "2026-04-22T21:20:00.000Z",
          label: "Custom remover",
          prompt: "Remova este prompt.",
          intent: "status"
        }
      ],
      null,
      2
    )}\n`,
    "utf8"
  );
  const service = new PromptAdminService();

  const removed = await service.removePromptAdminItem(
    workdir,
    "custom:custom-456"
  );
  assert.equal(removed?.selector, "custom:custom-456");
  assert.equal(
    JSON.parse(
      await fs.readFile(path.join(workdir, ".agents", "PROMPTS.json"), "utf8")
    ).length,
    0
  );

  await assert.rejects(
    () => service.removePromptAdminItem(workdir, "builtin:0"),
    /prompt_admin_builtin_not_removable/
  );
});
