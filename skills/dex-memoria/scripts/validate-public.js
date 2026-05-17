#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const expectedVersion = "0.1.5";

const requiredFiles = [
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "README.md",
  "CHANGELOG.md",
  "DECISIONS.md",
  "SKILL.md",
  "SPEC.md",
  "VERSION",
  "package.json",
  "bin/dex-memoria.js",
  "contracts/CONTRATO_OPERACIONAL_CONDICAO_ACAO_EXECUCAO_RETORNO.md",
  "docs/usage.md",
  "docs/runtime-boundary.md",
  "docs/integration-dex-agent.md",
  "docs/memory-home.md",
  "docs/layered-memory-simulations.md",
  "templates/memory-contract.md",
  "templates/memory-resolution-checklist.md",
  "templates/child-usage-prompt.md",
  "templates/l1-lembranca.md",
  "templates/l2-memoria.md",
  "templates/l3-conhecimento-index.md",
  "templates/layered-memory-checklist.md",
  "examples/active-operational-memory.md",
  "examples/child-to-child-handoff.md",
  "examples/ledger-only-memory.md",
  "examples/resolved-operational-finding.md",
  "examples/layered-memory/lembranca.md",
  "examples/layered-memory/memoria.md",
  "examples/layered-memory/conhecimento/INDEX.md",
  "examples/layered-memory/conhecimento/documentacao/INDEX.md",
  "examples/layered-memory/conhecimento/modelos/INDEX.md",
  "examples/layered-memory/conhecimento/tutoriais/INDEX.md",
  ".github/ISSUE_TEMPLATE/bug_report.md",
  ".github/ISSUE_TEMPLATE/docs_change.md",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/pull_request_template.md",
  ".github/workflows/ci.yml"
];

const requiredPackageFiles = [
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "bin/",
  "contracts/",
  "docs/",
  "examples/",
  "scripts/",
  "templates/",
  "CHANGELOG.md",
  "DECISIONS.md",
  "README.md",
  "SKILL.md",
  "SPEC.md",
  "VERSION"
];

function main() {
  const errors = [];

  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(root, file))) {
      errors.push(`Missing required file: ${file}`);
    }
  }

  const packageJson = readJson("package.json", errors);
  if (packageJson) {
    assertEqual(errors, "package.json name", packageJson.name, "dex-memoria");
    assertEqual(
      errors,
      "package.json version",
      packageJson.version,
      expectedVersion
    );
    assertEqual(errors, "package.json license", packageJson.license, "MIT");
    assertEqual(
      errors,
      "package.json repository.url",
      packageJson.repository && packageJson.repository.url,
      "git+https://github.com/dex-agent/dex-memoria.git"
    );
    assertEqual(
      errors,
      "package.json bugs.url",
      packageJson.bugs && packageJson.bugs.url,
      "https://github.com/dex-agent/dex-memoria/issues"
    );

    for (const file of requiredPackageFiles) {
      if (
        !Array.isArray(packageJson.files) ||
        !packageJson.files.includes(file)
      ) {
        errors.push(`package.json files must include: ${file}`);
      }
    }
  }

  const version = readText("VERSION", errors).trim();
  if (version && version !== expectedVersion) {
    errors.push(`VERSION must be ${expectedVersion}, got ${version}`);
  }

  requireText(errors, "README.md", [
    "Versao atual: `0.1.5`",
    "dex-agent",
    "nao carrega o runtime",
    "DEX_MEMORIA_HOME",
    "Taxonomia de temas"
  ]);
  requireText(errors, "SPEC.md", [
    "L1 - Lembranca",
    "L2 - Memoria",
    "L3 - Conhecimento",
    "Escopos De Caminho",
    "Raiz Canonica",
    "Taxonomia De Temas"
  ]);
  requireText(errors, "docs/usage.md", [
    "Usar L1/L2/L3",
    "gatilho -> ancora -> detalhe",
    "Escolher O Caminho Correto",
    "$HOME/.agents/memories",
    "tema e dominio reutilizavel"
  ]);
  requireText(errors, "docs/runtime-boundary.md", [
    "Carregamento De L1/L2/L3",
    "global roteia",
    "DEX_MEMORIA_HOME"
  ]);
  requireText(errors, "docs/memory-home.md", [
    "DEX_MEMORIA_HOME",
    "$HOME/.agents/memories",
    "<WORKSPACE>/.agents",
    "projeto-ferramenta"
  ]);
  requireText(errors, "docs/layered-memory-simulations.md", [
    "PASS",
    "FAIL UTIL",
    "global roteia, tema reutiliza, projeto opera"
  ]);
  requireText(errors, "CHANGELOG.md", [
    "## 0.1.5 - 2026-05-17",
    "## 0.1.4 - 2026-05-16",
    "## 0.1.3 - 2026-05-15",
    "## 0.1.2 - 2026-05-09"
  ]);
  requireText(errors, "SECURITY.md", [
    "must not contain secrets",
    "does not provide the Dex Agent runtime"
  ]);
  requireText(errors, "LICENSE", ["MIT License"]);
  validateLayeredMemoryExample(errors);

  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }

  console.log("dex-memoria public structure ok");
}

function validateLayeredMemoryExample(errors) {
  const lembranca = readText("examples/layered-memory/lembranca.md", errors);
  const memoria = readText("examples/layered-memory/memoria.md", errors);
  const anchors = new Set(
    [...memoria.matchAll(/\{#([^}]+)\}/g)].map((match) => match[1])
  );
  const links = [...lembranca.matchAll(/\]\(memoria\.md#([^)]+)\)/g)].map(
    (match) => match[1]
  );

  if (links.length === 0) {
    errors.push(
      "examples/layered-memory/lembranca.md must link to memoria.md anchors"
    );
  }

  for (const anchor of links) {
    if (!anchors.has(anchor)) {
      errors.push(`Layered memory link points to missing anchor: ${anchor}`);
    }
  }

  const usefulLines = lembranca
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith(">"));

  if (usefulLines.length > 30) {
    errors.push(
      `examples/layered-memory/lembranca.md should stay short, got ${usefulLines.length} useful lines`
    );
  }
}

function readJson(file, errors) {
  try {
    return JSON.parse(readText(file, errors));
  } catch (error) {
    errors.push(`Invalid JSON in ${file}: ${error.message}`);
    return null;
  }
}

function readText(file, errors) {
  try {
    return fs.readFileSync(path.join(root, file), "utf8");
  } catch (error) {
    errors.push(`Cannot read ${file}: ${error.message}`);
    return "";
  }
}

function requireText(errors, file, snippets) {
  const text = readText(file, errors);
  for (const snippet of snippets) {
    if (!text.includes(snippet)) {
      errors.push(`${file} must mention: ${snippet}`);
    }
  }
}

function assertEqual(errors, label, actual, expected) {
  if (actual !== expected) {
    errors.push(`${label} must be ${expected}, got ${actual}`);
  }
}

main();
