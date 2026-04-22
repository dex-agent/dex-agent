import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAudioSummary,
  buildAudioVoiceDirectionPlan,
  normalizeTextForSpeech
} from "../src/lib/audioTts.js";

test("normalizeTextForSpeech removes markdown and rewrites technical tokens", () => {
  const normalized = normalizeTextForSpeech(
    "Use `/mcp tools` em `C:\\Projetos\\Repo` no bloco 561-572 com API e TTS. Progresso: 100/100. 🔊"
  );

  assert.doesNotMatch(normalized, /`/);
  assert.doesNotMatch(normalized, /C:\\Projetos/);
  assert.match(normalized, /comando/);
  assert.match(normalized, /561 a 572/);
  assert.match(normalized, /a p i/i);
  assert.match(normalized, /te te esse/i);
  assert.match(normalized, /100 por cento concluido/i);
  assert.doesNotMatch(normalized, /\u{1F50A}/u);
});

test("normalizeTextForSpeech strips transient stream and auth noise from audio", () => {
  const normalized = normalizeTextForSpeech(
    [
      "Status atual do projeto.",
      "[error] in-process app-server event stream lagged; dropped 7 events.",
      "Reconnecting... 1/5 (unexpected status 401 Unauthorized: Missing Authentication header, url: https://openrouter.ai/api/v1/responses, cf-ray: 123-GRU).",
      "Ultimo bloco fechado: 609-620."
    ].join(" ")
  );

  assert.doesNotMatch(normalized, /lagged/i);
  assert.doesNotMatch(normalized, /Unauthorized/i);
  assert.match(normalized, /Status atual/i);
  assert.match(normalized, /609 a 620/);
});

test("buildAudioSummary keeps a compact spoken summary", () => {
  const summary = buildAudioSummary(
    [
      "Status atual do projeto.",
      "Ultimo bloco fechado: 585-596.",
      "Proximo bloco elegivel: 597-608.",
      "Nao existe sprint em execucao formal.",
      "Ha um handoff pronto para a proxima macrofase."
    ].join(" "),
    140
  );

  assert.match(summary, /Status atual/i);
  assert.match(summary, /585 a 596/);
  assert.equal(summary.length <= 140, true);
});

test("buildAudioSummary prefers useful status content over infrastructure noise", () => {
  const summary = buildAudioSummary(
    [
      "[error] in-process app-server event stream lagged; dropped 12 events.",
      "Reconnecting... 2/5 (unexpected status 401 Unauthorized: Missing Authentication header).",
      "Status atual do projeto.",
      "Ultimo bloco fechado: 609-620.",
      "Proximo bloco elegivel: 621-632."
    ].join(" "),
    180
  );

  assert.doesNotMatch(summary, /lagged/i);
  assert.doesNotMatch(summary, /Unauthorized/i);
  assert.match(summary, /Status atual do projeto/i);
  assert.match(summary, /609 a 620/);
});

test("buildAudioVoiceDirectionPlan codifies the audio-direction contract before TTS", () => {
  const concise = buildAudioVoiceDirectionPlan(
    {
      enabled: true,
      provider: "edge",
      voice: "pt-BR-FranciscaNeural",
      rate: "+0%",
      pitch: "+0Hz",
      pythonCommand: "python",
      ffmpegCommand: "ffmpeg",
      offerMinChars: 900,
      summaryMaxChars: 650,
      cacheTtlMs: 1800000
    },
    "concise"
  );
  const detailed = buildAudioVoiceDirectionPlan(
    {
      enabled: true,
      provider: "edge",
      voice: "pt-BR-FranciscaNeural",
      rate: "+0%",
      pitch: "+0Hz",
      pythonCommand: "python",
      ffmpegCommand: "ffmpeg",
      offerMinChars: 900,
      summaryMaxChars: 650,
      cacheTtlMs: 1800000
    },
    "detailed"
  );

  assert.equal(concise.objective, "telegram_short_summary");
  assert.equal(concise.density, "enxuta");
  assert.equal(concise.maxUnits, 5);
  assert.equal(detailed.objective, "telegram_detailed_summary");
  assert.equal(detailed.density, "detalhada");
  assert.equal(detailed.maxUnits, 10);
  assert.equal(detailed.maxChars >= 1400, true);
});
