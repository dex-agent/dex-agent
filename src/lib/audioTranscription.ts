import { request, type Dispatcher } from "undici";
import {
  buildTelegramFileUrl,
  createTelegramFetchDispatcher,
  requestTelegramJson
} from "./telegramApi.js";

export interface AudioTranscriptionConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  language: string;
  prompt: string;
  maxFileBytes: number;
  enabled: boolean;
}

export interface TelegramAudioSource {
  apiBase: string;
  token: string;
  proxyUrl?: string;
  fileId: string;
  fileName: string;
  mimeType?: string;
}

interface TelegramGetFileResponse {
  ok?: boolean;
  result?: {
    file_path?: string;
    file_size?: number;
  };
  description?: string;
}

interface AudioTranscriptionResponse {
  text?: string;
}

interface OpenRouterChatResponse {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
}

interface OpenRouterAudioInputPart {
  type: "input_audio";
  input_audio: {
    data: string;
    format: string;
  };
}

interface BinaryResponse {
  statusCode: number;
  bytes: Uint8Array;
}

type BinaryRequestFn = (
  url: string,
  options?: {
    dispatcher?: Dispatcher;
  }
) => Promise<BinaryResponse>;

type JsonRequestFn = typeof requestTelegramJson;

type FetchLike = typeof fetch;

export class AudioTranscriber {
  private readonly config: AudioTranscriptionConfig;
  private readonly requestTelegramJsonImpl: JsonRequestFn;
  private readonly fetchImpl: FetchLike;
  private readonly requestBinaryImpl: BinaryRequestFn;

  constructor({
    config,
    requestTelegramJsonImpl = requestTelegramJson,
    fetchImpl = fetch,
    requestBinaryImpl
  }: {
    config: AudioTranscriptionConfig;
    requestTelegramJsonImpl?: JsonRequestFn;
    fetchImpl?: FetchLike;
    requestBinaryImpl?: BinaryRequestFn;
  }) {
    this.config = config;
    this.requestTelegramJsonImpl = requestTelegramJsonImpl;
    this.fetchImpl = fetchImpl;
    this.requestBinaryImpl =
      requestBinaryImpl ||
      (async (url, options) => {
        const response = await request(url, {
          dispatcher: options?.dispatcher
        });

        return {
          statusCode: response.statusCode,
          bytes: new Uint8Array(await response.body.arrayBuffer())
        };
      });
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  private usesOpenRouterChatCompletions(): boolean {
    return /openrouter\.ai\/api\/v1$/i.test(this.config.baseUrl);
  }

  private inferAudioFormat(source: TelegramAudioSource): string {
    const extension = source.fileName.split(".").pop()?.toLowerCase();
    if (extension) return extension;

    const mimeType = String(source.mimeType || "").toLowerCase();
    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("aac")) return "aac";
    if (mimeType.includes("flac")) return "flac";
    if (mimeType.includes("m4a")) return "m4a";

    return "ogg";
  }

  private buildOpenRouterAudioInputPart(
    source: TelegramAudioSource,
    fileResponse: BinaryResponse
  ): OpenRouterAudioInputPart {
    return {
      type: "input_audio",
      input_audio: {
        data: Buffer.from(fileResponse.bytes).toString("base64"),
        format: this.inferAudioFormat(source)
      }
    };
  }

  private looksLikeMetaReplyInsteadOfTranscript(text: string): boolean {
    const normalized = String(text || "")
      .trim()
      .toLowerCase();
    if (!normalized) {
      return false;
    }

    const asksToSendAudio =
      /\b(envie|anexe|compartilhe|mande|send|share|attach)\b/.test(
        normalized
      ) && /\b(audio|áudio|arquivo|file)\b/.test(normalized);
    const genericMetaPhrases = [
      "ficarei no aguardo",
      "i heard this from your audio",
      "received your audio",
      "transcribing it before sending it to codex",
      "estou pronto para receber o áudio",
      "estou pronto para receber o audio"
    ];

    return (
      asksToSendAudio ||
      genericMetaPhrases.some((phrase) => normalized.includes(phrase))
    );
  }

  private async transcribeWithOpenAiStyleApi(
    source: TelegramAudioSource,
    fileResponse: BinaryResponse
  ): Promise<string> {
    const form = new FormData();
    form.append(
      "file",
      new Blob([Buffer.from(fileResponse.bytes)], {
        type: source.mimeType || "application/octet-stream"
      }),
      source.fileName
    );
    form.append("model", this.config.model);
    form.append("language", this.config.language);
    form.append("response_format", "json");
    if (this.config.prompt) {
      form.append("prompt", this.config.prompt);
    }

    const response = await this.fetchImpl(
      `${this.config.baseUrl}/audio/transcriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`
        },
        body: form
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Audio transcription failed: HTTP ${response.status} ${errorText}`.trim()
      );
    }

    return String(
      ((await response.json()) as AudioTranscriptionResponse)?.text || ""
    ).trim();
  }

  private async transcribeWithOpenRouterChatCompletions(
    source: TelegramAudioSource,
    fileResponse: BinaryResponse
  ): Promise<string> {
    const response = await this.fetchImpl(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    this.config.prompt ||
                    `Please transcribe this ${this.config.language} audio file accurately.`
                },
                this.buildOpenRouterAudioInputPart(source, fileResponse)
              ]
            }
          ],
          stream: false
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter audio transcription failed: HTTP ${response.status} ${errorText}`.trim()
      );
    }

    const payload = (await response.json()) as OpenRouterChatResponse;
    const content = payload.choices?.[0]?.message?.content;

    if (typeof content === "string") {
      return content.trim();
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => item.text || "")
        .join("\n")
        .trim();
    }

    return "";
  }

  async transcribeTelegramAudio(
    source: TelegramAudioSource
  ): Promise<{ text: string; fileName: string }> {
    if (!this.isEnabled()) {
      throw new Error(
        "Audio transcription is not configured. Set OPENAI_API_KEY first."
      );
    }

    const { statusCode, payload } =
      await this.requestTelegramJsonImpl<TelegramGetFileResponse>({
        apiBase: source.apiBase,
        token: source.token,
        method: "getFile",
        proxyUrl: source.proxyUrl,
        body: {
          file_id: source.fileId
        }
      });

    if (
      statusCode < 200 ||
      statusCode >= 300 ||
      !payload?.ok ||
      !payload?.result?.file_path
    ) {
      throw new Error(
        `Telegram getFile failed: ${payload?.description || `HTTP ${statusCode}`}`
      );
    }

    const fileSize = Number(payload.result.file_size || 0);
    if (fileSize > this.config.maxFileBytes) {
      throw new Error(
        `Audio file is too large (${fileSize} bytes). Limit: ${this.config.maxFileBytes} bytes.`
      );
    }

    const dispatcher = createTelegramFetchDispatcher(source.proxyUrl);
    const fileUrl = buildTelegramFileUrl(
      source.apiBase,
      source.token,
      payload.result.file_path
    );
    const fileResponse = await this.requestBinaryImpl(fileUrl, {
      dispatcher
    });

    if (fileResponse.statusCode < 200 || fileResponse.statusCode >= 300) {
      throw new Error(
        `Telegram file download failed: HTTP ${fileResponse.statusCode}`
      );
    }

    if (fileResponse.bytes.byteLength > this.config.maxFileBytes) {
      throw new Error(
        `Downloaded audio is too large (${fileResponse.bytes.byteLength} bytes). Limit: ${this.config.maxFileBytes} bytes.`
      );
    }

    const text = this.usesOpenRouterChatCompletions()
      ? await this.transcribeWithOpenRouterChatCompletions(source, fileResponse)
      : await this.transcribeWithOpenAiStyleApi(source, fileResponse);

    if (!text) {
      throw new Error("Audio transcription returned an empty transcript.");
    }

    if (this.looksLikeMetaReplyInsteadOfTranscript(text)) {
      throw new Error(
        "Audio transcription returned a meta reply instead of the spoken transcript."
      );
    }

    return {
      text,
      fileName: source.fileName
    };
  }
}
