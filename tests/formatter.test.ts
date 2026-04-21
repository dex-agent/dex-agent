import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeMarkdownV2,
  extractCodexExecResponse,
  extractReasoning,
  formatPtyOutput,
  sanitizeTelegramFacingCodexText,
  splitTelegramMessage
} from "../src/bot/formatter.js";

test("escapeMarkdownV2 escapes Telegram MarkdownV2 special characters", () => {
  const input = "_*[]()~`>#+-=|{}.!\\";
  const escaped = escapeMarkdownV2(input);

  assert.equal(
    escaped,
    "\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!\\\\"
  );
});

test("extractReasoning separates think blocks from visible output", () => {
  const result = extractReasoning(
    "before<think>first</think>middle<think>second</think>after"
  );

  assert.equal(result.cleanText, "beforemiddleafter");
  assert.deepEqual(result.reasoningBlocks, ["first", "second"]);
});

test("formatPtyOutput renders visible output and spoiler reasoning", () => {
  const rendered = formatPtyOutput("done<think>private reasoning</think>", {
    mode: "spoiler"
  });

  assert.match(rendered, /done/);
  assert.match(rendered, /Reasoning Stream/);
  assert.match(rendered, /\|\|private reasoning\|\|/);
});

test("extractCodexExecResponse strips codex exec transcript noise and keeps the final assistant reply", () => {
  const raw = [
    "OpenAI Codex v0.114.0 (research preview)",
    "--------",
    "workdir: /tmp/demo",
    "model: gpt-5.4",
    "session id: 11111111-1111-1111-1111-111111111111",
    "--------",
    "user",
    "run unit test",
    "mcp startup: no servers",
    "codex",
    "I’m checking the repository layout first.",
    "exec",
    "/bin/zsh -lc 'npm test' succeeded in 1.07s:",
    "ok",
    "codex",
    "`npm test` passed.",
    "",
    "15 tests ran, 15 passed, 0 failed.",
    "tokens used",
    "8,301",
    "`npm test` passed.",
    "",
    "15 tests ran, 15 passed, 0 failed."
  ].join("\n");

  assert.equal(
    extractCodexExecResponse(raw),
    "`npm test` passed.\n\n15 tests ran, 15 passed, 0 failed."
  );
});

test("formatPtyOutput uses cleaned codex exec content when session mode is exec", () => {
  const raw = [
    "OpenAI Codex v0.114.0 (research preview)",
    "--------",
    "workdir: /tmp/demo",
    "--------",
    "user",
    "who are u",
    "mcp startup: no servers",
    "codex",
    "I am Codex."
  ].join("\n");

  const rendered = formatPtyOutput(raw, {
    mode: "spoiler",
    sessionMode: "exec"
  });

  assert.equal(rendered, "I am Codex\\.");
});

test("formatPtyOutput removes transient runner noise from streamed output", () => {
  const raw = [
    "[error] in-process app-server event stream lagged; dropped 1 events",
    "Planejando o proximo sprint.",
    "Reconnecting... 1/5 (unexpected status 401 Unauthorized: Missing Authentication header, url: https://openrouter.ai/api/v1/responses, cf-ray: abc-GRU)"
  ].join("\n");

  const rendered = formatPtyOutput(raw, {
    mode: "spoiler",
    sessionMode: "sdk"
  });

  assert.equal(rendered, "Planejando o proximo sprint\\.");
});

test("formatPtyOutput removes unstable feature warnings from streamed output", () => {
  const raw = [
    "[error] Under-development features enabled: codex_hooks, memories. Under-development features are incomplete and may behave unpredictably.",
    "To suppress this warning, set `suppress_unstable_features_warning = true` in C:\\Users\\crsan\\.codex\\config.toml.",
    "",
    "Entendido. O desvio foi no sender automatico."
  ].join("\n");

  const rendered = formatPtyOutput(raw, {
    mode: "spoiler",
    sessionMode: "sdk"
  });

  assert.equal(rendered, "Entendido\\. O desvio foi no sender automatico\\.");
});

test("sanitizeTelegramFacingCodexText removes internal report sections and keeps useful findings", () => {
  const raw = [
    "Resumo principal do fechamento.",
    "",
    "File paths created/modified",
    "- Nenhum.",
    "",
    "Knowledge base source labels",
    "- AGENTS check",
    "- MEMORY check",
    "",
    "Key findings",
    "- O item saiu da memoria persistida.",
    "- Nesta sessao ainda depende de nova janela."
  ].join("\n");

  const sanitized = sanitizeTelegramFacingCodexText(raw);

  assert.doesNotMatch(sanitized, /File paths created\/modified/i);
  assert.doesNotMatch(sanitized, /Knowledge base source labels/i);
  assert.match(sanitized, /Resumo principal do fechamento/i);
  assert.match(sanitized, /Achados principais/i);
  assert.match(sanitized, /O item saiu da memoria persistida/i);
});

test("formatPtyOutput hides internal report sections from sdk output", () => {
  const raw = [
    "Resumo principal do fechamento.",
    "",
    "File paths created/modified",
    "- Nenhum.",
    "",
    "Knowledge base source labels",
    "- AGENTS check",
    "",
    "Key findings",
    "- O item saiu da memoria persistida."
  ].join("\n");

  const rendered = formatPtyOutput(raw, {
    mode: "spoiler",
    sessionMode: "sdk"
  });

  assert.doesNotMatch(rendered, /File paths created\/modified/i);
  assert.doesNotMatch(rendered, /Knowledge base source labels/i);
  assert.match(rendered, /Achados principais/i);
  assert.match(rendered, /Resumo principal do fechamento/i);
});

test("splitTelegramMessage preserves content and avoids trailing escape characters in chunks", () => {
  const input = `${"a".repeat(9)}\\b`;
  const chunks = splitTelegramMessage(input, 10);

  assert.deepEqual(chunks, ["a".repeat(9), "\\b"]);
  assert.equal(chunks.join(""), input);
  assert.ok(chunks.every((chunk) => !chunk.endsWith("\\")));
});
