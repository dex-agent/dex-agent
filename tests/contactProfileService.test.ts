import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyContactProfilePromptBlock,
  ContactProfileService
} from "../src/orchestrator/contactProfileService.js";

function makeWorkdir(): string {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "dex-contatos-"));
  fs.mkdirSync(path.join(workdir, ".agents"), { recursive: true });
  return workdir;
}

test("contact profile found by chat_id generates a tone block", async () => {
  const workdir = makeWorkdir();
  fs.writeFileSync(
    path.join(workdir, ".agents", "CONTACTS.local.json"),
    JSON.stringify({
      contacts: [
        {
          chat_id: "5375742808",
          nome: "Duda",
          chamar_como: "Duda",
          tom: "simples, paciente, pessoal e explicativo",
          nivel_detalhe: "curto primeiro; detalhar se pedir",
          midia_preferida: ["prints_mobile", "audio_curto", "texto"],
          evitar: [
            "tokens",
            "caminhos internos desnecessarios",
            "termos tecnicos sem explicacao"
          ]
        }
      ]
    })
  );

  const service = new ContactProfileService();
  const block = await service.buildPromptBlock(workdir, "5375742808");

  assert.ok(block);
  assert.match(block, /Chamar a pessoa de: Duda/);
  assert.match(block, /Tom: simples, paciente, pessoal e explicativo/);
  assert.match(block, /Midia preferida: prints_mobile, audio_curto, texto/);
  assert.match(block, /nao altera permissoes/);
});

test("missing or nonmatching contact leaves prompt unchanged", async () => {
  const workdir = makeWorkdir();
  const service = new ContactProfileService();
  const block = await service.buildPromptBlock(workdir, "111");

  assert.equal(block, null);
  assert.equal(
    applyContactProfilePromptBlock("pedido original", block),
    "pedido original"
  );
});

test("invalid contacts json does not throw or change the prompt", async () => {
  const workdir = makeWorkdir();
  fs.writeFileSync(
    path.join(workdir, ".agents", "CONTACTS.local.json"),
    "{ invalid"
  );

  const service = new ContactProfileService();
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (value?: unknown) => {
    warnings.push(String(value));
  };
  try {
    const block = await service.buildPromptBlock(workdir, "5375742808");
    assert.equal(block, null);
    assert.equal(
      applyContactProfilePromptBlock("analise esta imagem", block),
      "analise esta imagem"
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /invalid CONTACTS\.local\.json/);
});

test("contact profile wrapper does not encode access or media routing", async () => {
  const workdir = makeWorkdir();
  fs.writeFileSync(
    path.join(workdir, ".agents", "CONTACTS.local.json"),
    JSON.stringify({
      contacts: [
        {
          chat_id: "5375742808",
          chamar_como: "Duda",
          tom: "simples",
          evitar: ["tokens"]
        }
      ]
    })
  );

  const service = new ContactProfileService();
  const block = await service.buildPromptBlock(workdir, "5375742808");
  const prompt = applyContactProfilePromptBlock("explique o projeto", block);

  assert.match(prompt, /Pedido do usuario:\nexplique o projeto/);
  assert.doesNotMatch(prompt, /ALLOWED_USER_IDS=/);
  assert.doesNotMatch(prompt, /PROACTIVE_USER_IDS=/);
  assert.doesNotMatch(prompt, /DEX_REQUEST_CHAT_ID=/);
});
