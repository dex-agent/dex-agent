import test from "node:test";
import assert from "node:assert/strict";
import {
  extractFinalResponseNextSpecialist,
  extractFinalResponseNextStep,
  extractFinalResponseRecommendedStep
} from "../src/lib/finalActionContext.js";

test("final action context extracts accented portuguese headings", () => {
  const text = [
    "Próximo Passo Recomendado: seguir com teste real",
    "Próximo especialista indicado: Tereza Testa",
    "Próximo passo: abrir navegador real"
  ].join("\n");

  assert.equal(
    extractFinalResponseRecommendedStep(text),
    "seguir com teste real"
  );
  assert.equal(extractFinalResponseNextSpecialist(text), "Tereza Testa");
  assert.equal(extractFinalResponseNextStep(text), "abrir navegador real");
});

test("final action context keeps recommended step out of generic next step", () => {
  const text = [
    "Proximo passo recomendado: revisar as ressalvas",
    "Proximo especialista indicado:",
    "- Renata Review"
  ].join("\n");

  assert.equal(
    extractFinalResponseRecommendedStep(text),
    "revisar as ressalvas"
  );
  assert.equal(extractFinalResponseNextStep(text), null);
  assert.equal(extractFinalResponseNextSpecialist(text), "Renata Review");
});

test("final action context strips common bullet markers from multiline values", () => {
  const text = ["Recommended next step:", "• Keep the line closed"].join("\n");

  assert.equal(
    extractFinalResponseRecommendedStep(text),
    "Keep the line closed"
  );
});
