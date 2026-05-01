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
  assert.doesNotMatch(script, /BotToken\s*=\s*\$token/);
});
