import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanPrompt,
  extractCommandPayload,
  shouldAttachImmediateContextToPlan,
  suggestClosestWord
} from "../src/bot/commandUtils.js";

test("extractCommandPayload removes telegram command prefix and bot suffix", () => {
  assert.equal(
    extractCommandPayload("/exec@ExampleBot run tests", "exec"),
    "run tests"
  );
  assert.equal(
    extractCommandPayload("/model gpt-5-codex", "model"),
    "gpt-5-codex"
  );
  assert.equal(extractCommandPayload("/new", "new"), "");
});

test("buildPlanPrompt forces planning-only behavior", () => {
  const prompt = buildPlanPrompt("refactor src/index.ts");

  assert.match(prompt, /Planning mode only/);
  assert.match(prompt, /Do not modify files/);
  assert.match(prompt, /Task:\nrefactor src\/index\.ts/);
});

test("buildPlanPrompt can make immediate review context primary", () => {
  const prompt = buildPlanPrompt("planeje em cima daqui com os findings", {
    immediateContext: "Finding 1: Cadastro perde valor + endereco."
  });

  assert.match(prompt, /Immediate conversation context/i);
  assert.match(prompt, /primary source/i);
  assert.match(prompt, /Finding 1: Cadastro perde valor \+ endereco/);
  assert.match(prompt, /do not replace the current planning target/i);
});

test("shouldAttachImmediateContextToPlan detects contextual planning requests", () => {
  assert.equal(
    shouldAttachImmediateContextToPlan(
      "consolidar tudo que ja foi levantado nos achados"
    ),
    true
  );
  assert.equal(
    shouldAttachImmediateContextToPlan("crie um plano para refatorar src"),
    false
  );
});

test("suggestClosestWord returns the nearest supported command when the typo is small", () => {
  assert.equal(
    suggestClosestWord("ststus", ["list", "status", "tools"]),
    "status"
  );
  assert.equal(suggestClosestWord("zzz", ["list", "status", "tools"]), "");
});

test("suggestClosestWord supports larger edit distances when the caller relaxes the threshold", () => {
  assert.equal(
    suggestClosestWord("ai-engineer-hub", ["ai-engineering-hub"], 6),
    "ai-engineering-hub"
  );
});
