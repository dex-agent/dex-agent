import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const eslintConfigUrl = new URL("../eslint.config.ts", import.meta.url);
const ecosystemConfigUrl = new URL("../ecosystem.config.ts", import.meta.url);

test("eslint config shim resolves the typescript source of truth", async () => {
  const [{ default: tsConfig }, { default: jsConfig }] = await Promise.all([
    import(eslintConfigUrl.href),
    import("../eslint.config.js")
  ]);

  assert.equal(Array.isArray(tsConfig), true);
  assert.equal(Array.isArray(jsConfig), true);
  assert.equal(jsConfig.length, tsConfig.length);
  const tsLastConfig = tsConfig.at(-1);
  const jsLastConfig = jsConfig.at(-1);
  const tsFiles =
    tsLastConfig && "files" in tsLastConfig ? tsLastConfig.files : [];
  const jsFiles =
    jsLastConfig && "files" in jsLastConfig ? jsLastConfig.files : [];
  assert.deepEqual(jsFiles, tsFiles);
});

test("ecosystem config points pm2 at the typescript runtime entry", async () => {
  const { default: tsConfig } = await import(ecosystemConfigUrl.href);
  const cjsConfig = require("../ecosystem.config.cjs");

  assert.equal(tsConfig.apps[0]?.script, "src/index.ts");
  assert.equal(tsConfig.apps[0]?.interpreter, "node_modules/.bin/tsx");
  assert.equal(cjsConfig.apps[0]?.script, tsConfig.apps[0]?.script);
  assert.equal(cjsConfig.apps[0]?.interpreter, tsConfig.apps[0]?.interpreter);
});

test("versioned public fixtures avoid real local Telegram identities", async () => {
  const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const fragment = (...parts: string[]): string => parts.join("");
  const chars = (...codes: number[]): string => String.fromCharCode(...codes);
  const blockedFragments = [
    fragment("codex", "10", "_bot"),
    chars(68, 117, 100, 97),
    fragment("Prem", "ier", "Dash", "board"),
    fragment("prem", "ier", "_dash", "boardbot"),
    fragment("8736", "107242"),
    fragment("5375", "742808"),
    fragment("5334", "767037"),
    fragment("C:\\Users\\", "cr", "san"),
    fragment("D:\\Drive\\", "Segunda", "Mente"),
    fragment("cr", "santos", "xx", "bot"),
    fragment("dex_", "agenda", "dor", "consultas_bot"),
    fragment("dex_", "controle", "pessoal_bot"),
    fragment(chars(65, 103, 101, 110, 100, 97), "dor", "Consultas", "Oticas"),
    fragment("Controle", "Pes", "soal"),
    fragment("Memoria", "Ger", "al")
  ];
  const ignoredDirectories = new Set([
    ".git",
    ".agents",
    ".codex",
    ".harness",
    ".playwright-cli",
    ".runtime",
    "node_modules",
    "dist"
  ]);
  const ignoredFiles = new Set([
    ".codex-telegram-claws-state.json",
    ".env",
    "package-lock.json",
    path.basename(fileURLToPath(import.meta.url))
  ]);
  const findings: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = path.relative(repoRoot, fullPath);
      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name)) {
          continue;
        }
        await visit(fullPath);
        continue;
      }
      if (!entry.isFile() || ignoredFiles.has(entry.name)) {
        continue;
      }
      if (entry.name.endsWith(".local.json")) {
        continue;
      }

      const content = await readFile(fullPath, "utf8");
      for (const fragment of blockedFragments) {
        if (content.includes(fragment)) {
          findings.push(`${relativePath}: ${fragment}`);
        }
      }
    }
  }

  await visit(repoRoot);

  assert.deepEqual(findings, []);
});
