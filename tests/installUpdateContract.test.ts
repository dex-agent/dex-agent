import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("project install writes visible final-action defaults into env and bootstrap", () => {
  const script = readRepoFile(
    "scripts/provision-dex-agent-project-instance.ps1"
  );

  assert.match(
    script,
    /Set-OrAppendEnvValue[\s\S]*-Name "FINAL_ACTIONS_AUTO_OFFER"[\s\S]*-Value "false"/
  );
  assert.match(script, /FINAL_ACTIONS_AUTO_OFFER=false/);
  assert.match(
    script,
    /painel final de acoes dinamicas nao aparece automaticamente/
  );
  assert.match(script, /dex-contatos/);
  assert.match(script, /\.agents\/CONTACTS\.local\.json/);
});

test("project update preserves the child env template while reapplying managed files", () => {
  const script = readRepoFile("scripts/update-dex-agent-project-instance.ps1");

  assert.match(script, /EnvTemplatePath\s*=\s*\$envPath/);
  assert.match(script, /BotTokenPath\s*=\s*\$tokenPath/);
  assert.match(script, /RefreshSharedDependencies\s*=\s*\$true/);
  assert.doesNotMatch(script, /BotToken\s*=\s*\$token/);
});

test("project install does not copy the parent env as an implicit child template", () => {
  const script = readRepoFile(
    "scripts/provision-dex-agent-project-instance.ps1"
  );

  assert.doesNotMatch(script, /\$EnvTemplatePath\s*=\s*\$defaultTemplate/);
  assert.match(script, /sourceEnvPath = Join-Path \$sourceRoot "\.env"/);
  assert.match(script, /Import-DotEnv -Path \$sourceEnvPath/);
});

test("config export and import protect secrets while preserving local config surfaces", () => {
  const exportScript = readRepoFile("scripts/export-dex-agent-config.ps1");
  const importScript = readRepoFile("scripts/import-dex-agent-config.ps1");

  assert.match(exportScript, /IncludeSecrets/);
  assert.match(exportScript, /\.agents\\CONTACTS\.local\.json|\*\.local\.json/);
  assert.match(exportScript, /\.agents\\PROMPTS\.json/);
  assert.match(exportScript, /skills\\dex-agent\\instance\.json/);
  assert.match(exportScript, /\.env" -Secret \$true/);

  assert.match(importScript, /secret_requires_include_secrets/);
  assert.match(importScript, /exists_use_force/);
  assert.match(importScript, /Assert-SafeRelativePath/);
  assert.match(importScript, /Path traversal nao permitido/);
});

test("autostart registration and child autostart stay hidden and canonical", () => {
  const parentAutostart = readRepoFile(
    "scripts/register-dex-agent-autostart.ps1"
  );
  const installScript = readRepoFile("scripts/install-dex-agent-skill.ps1");
  const redeWrapper = readRepoFile(
    "skills/dex-rede/scripts/send-to-dex-child.ps1"
  );

  assert.match(parentAutostart, /USERPROFILE[\s\S]*\.dex-agent/);
  assert.match(parentAutostart, /AllowNonCanonicalPath/);
  assert.match(parentAutostart, /Autostart deve ser registrado/);
  assert.match(installScript, /-WindowStyle Hidden -File/);
  assert.match(redeWrapper, /scripts\\send-dex-child-message\.ps1/);
});
