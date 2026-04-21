import test from "node:test";
import assert from "node:assert/strict";
import { AudioTranscriber } from "../src/lib/audioTranscription.js";
import { requestTelegramJson } from "../src/lib/telegramApi.js";

test("AudioTranscriber downloads Telegram audio and returns the transcript", async () => {
  const telegramCalls: Array<Record<string, unknown>> = [];
  const binaryCalls: Array<Record<string, unknown>> = [];
  const fetchCalls: Array<Record<string, unknown>> = [];

  const transcriber = new AudioTranscriber({
    config: {
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini-transcribe",
      language: "pt",
      prompt: "Transcreva em portugues brasileiro",
      maxFileBytes: 1024 * 1024,
      enabled: true
    },
    requestTelegramJsonImpl: (async (request: {
      apiBase: string;
      token: string;
      method: string;
      proxyUrl?: string;
      body?: unknown;
    }) => {
      telegramCalls.push(request as unknown as Record<string, unknown>);
      return {
        statusCode: 200,
        payload: {
          ok: true,
          result: {
            file_path: "voice/file_123.ogg",
            file_size: 128
          }
        }
      };
    }) as typeof requestTelegramJson,
    requestBinaryImpl: async (url, options) => {
      binaryCalls.push({
        url,
        hasDispatcher: Boolean(options?.dispatcher)
      });
      return {
        statusCode: 200,
        bytes: new Uint8Array([1, 2, 3, 4])
      };
    },
    fetchImpl: async (input, init) => {
      fetchCalls.push({
        input: String(input),
        method: init?.method,
        authorization: (init?.headers as Record<string, string>).Authorization,
        bodyType: init?.body?.constructor?.name
      });

      return {
        ok: true,
        status: 200,
        json: async () => ({ text: "ola codex" }),
        text: async () => ""
      } as Response;
    }
  });

  const result = await transcriber.transcribeTelegramAudio({
    apiBase: "https://api.telegram.org",
    token: "123456:abcDEF",
    fileId: "voice-file-id",
    fileName: "voice-note.ogg",
    mimeType: "audio/ogg"
  });

  assert.deepEqual(result, {
    text: "ola codex",
    fileName: "voice-note.ogg"
  });
  assert.equal(telegramCalls.length, 1);
  assert.equal(telegramCalls[0].method, "getFile");
  assert.equal(binaryCalls.length, 1);
  assert.equal(
    binaryCalls[0].url,
    "https://api.telegram.org/file/bot123456:abcDEF/voice/file_123.ogg"
  );
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].input, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(fetchCalls[0].method, "POST");
  assert.equal(fetchCalls[0].authorization, "Bearer sk-test");
  assert.equal(fetchCalls[0].bodyType, "FormData");
});

test("AudioTranscriber rejects Telegram audio above the configured limit", async () => {
  const transcriber = new AudioTranscriber({
    config: {
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini-transcribe",
      language: "pt",
      prompt: "",
      maxFileBytes: 32,
      enabled: true
    },
    requestTelegramJsonImpl: (async () => {
      return {
        statusCode: 200,
        payload: {
          ok: true,
          result: {
            file_path: "voice/file_oversized.ogg",
            file_size: 64
          }
        }
      };
    }) as typeof requestTelegramJson
  });

  await assert.rejects(
    () =>
      transcriber.transcribeTelegramAudio({
        apiBase: "https://api.telegram.org",
        token: "123456:abcDEF",
        fileId: "voice-file-id",
        fileName: "voice-note.ogg",
        mimeType: "audio/ogg"
      }),
    /Audio file is too large/
  );
});

test("AudioTranscriber uses OpenRouter chat completions for audio input when configured", async () => {
  const fetchCalls: Array<Record<string, unknown>> = [];

  const transcriber = new AudioTranscriber({
    config: {
      apiKey: "sk-or-test",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "google/gemini-2.5-flash-lite",
      language: "pt-BR",
      prompt: "Transcreva este audio em portugues do Brasil.",
      maxFileBytes: 1024 * 1024,
      enabled: true
    },
    requestTelegramJsonImpl: (async () => {
      return {
        statusCode: 200,
        payload: {
          ok: true,
          result: {
            file_path: "voice/file_456.ogg",
            file_size: 128
          }
        }
      };
    }) as typeof requestTelegramJson,
    requestBinaryImpl: async () => ({
      statusCode: 200,
      bytes: new Uint8Array([5, 6, 7, 8])
    }),
    fetchImpl: async (input, init) => {
      fetchCalls.push({
        input: String(input),
        method: init?.method,
        body: String(init?.body || "")
      });

      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: "transcricao via openrouter"
              }
            }
          ]
        }),
        text: async () => ""
      } as Response;
    }
  });

  const result = await transcriber.transcribeTelegramAudio({
    apiBase: "https://api.telegram.org",
    token: "123456:abcDEF",
    fileId: "voice-file-id",
    fileName: "voice-note.ogg",
    mimeType: "audio/ogg"
  });

  assert.equal(result.text, "transcricao via openrouter");
  assert.equal(
    fetchCalls[0].input,
    "https://openrouter.ai/api/v1/chat/completions"
  );
  assert.match(String(fetchCalls[0].body), /input_audio/);
  assert.match(String(fetchCalls[0].body), /"input_audio"\s*:\s*\{/);
  assert.doesNotMatch(String(fetchCalls[0].body), /inputAudio/);
  assert.match(String(fetchCalls[0].body), /google\/gemini-2.5-flash-lite/);
});

test("AudioTranscriber rejects OpenRouter meta replies that do not contain the transcript", async () => {
  const transcriber = new AudioTranscriber({
    config: {
      apiKey: "sk-or-test",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "google/gemini-2.5-flash-lite",
      language: "pt-BR",
      prompt: "Transcreva o audio.",
      maxFileBytes: 1024 * 1024,
      enabled: true
    },
    requestTelegramJsonImpl: (async () => {
      return {
        statusCode: 200,
        payload: {
          ok: true,
          result: {
            file_path: "voice/file_789.ogg",
            file_size: 128
          }
        }
      };
    }) as typeof requestTelegramJson,
    requestBinaryImpl: async () => ({
      statusCode: 200,
      bytes: new Uint8Array([5, 6, 7, 8])
    }),
    fetchImpl: async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  "Com certeza! Por favor, compartilhe o audio para que eu possa transcrever."
              }
            }
          ]
        }),
        text: async () => ""
      } as Response;
    }
  });

  await assert.rejects(
    () =>
      transcriber.transcribeTelegramAudio({
        apiBase: "https://api.telegram.org",
        token: "123456:abcDEF",
        fileId: "voice-file-id",
        fileName: "voice-note.ogg",
        mimeType: "audio/ogg"
      }),
    /meta reply instead of the spoken transcript/
  );
});
