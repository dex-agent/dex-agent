import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { AppConfig } from "../config.js";
import { toErrorMessage } from "./errors.js";

export interface AudioTtsArtifact {
  filePath: string;
  fileName: string;
  cleanup(): Promise<void>;
}

export type AudioSummaryMode = "concise" | "detailed";

export interface AudioVoiceDirectionPlan {
  objective: "telegram_short_summary" | "telegram_detailed_summary";
  voice: string;
  tone: string;
  rhythm: "medio";
  density: "enxuta" | "detalhada";
  maxChars: number;
  maxUnits: number;
}

type AudioTtsConfig = AppConfig["audio"]["tts"];
const AUDIO_NOISE_PATTERNS: RegExp[] = [
  /(\[error\]\s*)?in-process app-server event stream lagged; dropped \d+ events?/gi,
  /Reconnecting\.\.\.\s*\d+\/\d+\s*\(unexpected status \d+[^)]*\)/gi,
  /unexpected status \d+\s+Unauthorized:[^.!?\n]*/gi,
  /cf-ray:\s*[A-Za-z0-9-]+/gi
];

function stripAudioNoise(input: string): string {
  let cleaned = String(input || "");

  for (const pattern of AUDIO_NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }

  return cleaned.replace(/\s+/g, " ").trim();
}

function stripMarkdown(input: string): string {
  return String(input || "")
    .replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~>#]+/g, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripEmoji(input: string): string {
  return String(input || "")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/\p{Regional_Indicator}/gu, " ")
    .replace(/\u{200D}/gu, " ")
    .replace(/\u{FE0F}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTechnicalTerms(input: string): string {
  return input
    .replace(/\bMCP\b/gi, "eme ce pe")
    .replace(/\bTTS\b/gi, "te te esse")
    .replace(/\bSTT\b/gi, "esse te te")
    .replace(/\bAPI\b/gi, "a p i")
    .replace(/\bSDK\b/gi, "esse de ka")
    .replace(/\bPID\b/gi, "pi i de")
    .replace(/\bpt-BR\b/gi, "portugues do Brasil")
    .replace(/\bOpenAI\b/g, "Open AI")
    .replace(/\bOpenRouter\b/g, "Open Router")
    .replace(/\bDexAgent\b/g, "Dex Agent");
}

function normalizeProgressForSpeech(input: string): string {
  return input
    .replace(
      /(\d{1,3})\s*\/\s*100\b/gi,
      (_match, value: string) => `${value} por cento concluido`
    )
    .replace(
      /(\d{1,3})\s*%\s*(?:de\s+conclus[aã]o|conclu[ií]do)?/gi,
      (_match, value: string) => `${value} por cento concluido`
    );
}

function normalizeRangesAndPaths(input: string): string {
  return input
    .replace(/\b(\d{1,4})\s*-\s*(\d{1,4})\b/g, "$1 a $2")
    .replace(/[A-Za-z]:\\[^\s]+/g, "caminho local do projeto")
    .replace(/\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+\b/g, "caminho do projeto")
    .replace(/\/[A-Za-z][\w-]*/g, "comando");
}

function splitIntoUnits(input: string): string[] {
  return String(input || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((line) => line.trim())
    .filter(Boolean);
}

export function normalizeTextForSpeech(input: string): string {
  const markdownStripped = stripEmoji(stripMarkdown(stripAudioNoise(input)));
  const normalized = normalizeRangesAndPaths(
    normalizeProgressForSpeech(normalizeTechnicalTerms(markdownStripped))
  )
    .replace(/\s*[:;]\s*/g, ". ")
    .replace(/\s*[-*]\s+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

export function buildAudioSummary(
  input: string,
  maxChars: number,
  {
    maxUnits = 5
  }: {
    maxUnits?: number;
  } = {}
): string {
  const normalized = normalizeTextForSpeech(input);
  if (!normalized) {
    return "Nao encontrei conteudo suficiente para resumir em audio.";
  }

  const units = splitIntoUnits(normalized);
  const selected: string[] = [];

  for (const unit of units) {
    const candidate = [...selected, unit].join(" ");
    if (candidate.length > maxChars && selected.length) {
      break;
    }

    selected.push(unit);
    if (selected.length >= maxUnits || candidate.length >= maxChars) {
      break;
    }
  }

  const summary = (selected.length ? selected.join(" ") : normalized)
    .replace(/\s+/g, " ")
    .trim();

  return summary.length > maxChars
    ? `${summary.slice(0, Math.max(0, maxChars - 1)).trimEnd()}.`
    : summary;
}

export function buildAudioVoiceDirectionPlan(
  config: AudioTtsConfig,
  mode: AudioSummaryMode = "concise"
): AudioVoiceDirectionPlan {
  if (mode === "detailed") {
    return {
      objective: "telegram_detailed_summary",
      voice: config.voice,
      tone: "calmo e confiante",
      rhythm: "medio",
      density: "detalhada",
      maxChars: Math.max(config.summaryMaxChars * 2, 1400),
      maxUnits: 10
    };
  }

  return {
    objective: "telegram_short_summary",
    voice: config.voice,
    tone: "calmo e confiante",
    rhythm: "medio",
    density: "enxuta",
    maxChars: config.summaryMaxChars,
    maxUnits: 5
  };
}

export class AudioTts {
  readonly config: AudioTtsConfig;

  constructor(config: AudioTtsConfig) {
    this.config = config;
  }

  isEnabled(): boolean {
    return this.config.enabled && this.config.provider === "edge";
  }

  shouldOfferSummary(text: string): boolean {
    return (
      this.isEnabled() &&
      normalizeTextForSpeech(text).length >= this.config.offerMinChars
    );
  }

  summarize(text: string, mode: AudioSummaryMode = "concise"): string {
    const direction = buildAudioVoiceDirectionPlan(this.config, mode);
    return buildAudioSummary(text, direction.maxChars, {
      maxUnits: direction.maxUnits
    });
  }

  async synthesize(text: string): Promise<AudioTtsArtifact> {
    if (!this.isEnabled()) {
      throw new Error("Audio TTS is disabled.");
    }

    const normalizedText = normalizeTextForSpeech(text);
    if (!normalizedText) {
      throw new Error("Audio TTS received empty text.");
    }

    const prefix = path.join(os.tmpdir(), `dex-agent-tts-${randomUUID()}`);
    const inputPath = `${prefix}.txt`;
    const intermediatePath = `${prefix}.mp3`;
    const outputPath = `${prefix}.ogg`;
    await fs.writeFile(inputPath, normalizedText, "utf8");

    try {
      await this.runEdgeTts(inputPath, intermediatePath);
      await this.convertToTelegramVoice(intermediatePath, outputPath);
      return {
        filePath: outputPath,
        fileName: "dex-agent-resumo.ogg",
        cleanup: async () => {
          await Promise.allSettled([
            fs.rm(inputPath, { force: true }),
            fs.rm(intermediatePath, { force: true }),
            fs.rm(outputPath, { force: true })
          ]);
        }
      };
    } catch (error) {
      await Promise.allSettled([
        fs.rm(inputPath, { force: true }),
        fs.rm(intermediatePath, { force: true }),
        fs.rm(outputPath, { force: true })
      ]);
      throw error;
    }
  }

  private async runEdgeTts(
    inputPath: string,
    outputPath: string
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const args = [
        "-m",
        "edge_tts",
        "-f",
        inputPath,
        "-v",
        this.config.voice,
        "--rate",
        this.config.rate,
        "--pitch",
        this.config.pitch,
        "--write-media",
        outputPath
      ];
      const child = spawn(this.config.pythonCommand, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
      let stderr = "";
      let stdout = "";

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk || "");
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk || "");
      });
      child.once("error", (error) => {
        reject(
          new Error(`Failed to launch edge-tts: ${toErrorMessage(error)}`)
        );
      });
      child.once("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        const detail = [stderr.trim(), stdout.trim()]
          .filter(Boolean)
          .join("\n");
        reject(
          new Error(
            detail
              ? `edge-tts failed (${code}): ${detail}`
              : `edge-tts failed with exit code ${code}`
          )
        );
      });
    });
  }

  private async convertToTelegramVoice(
    inputPath: string,
    outputPath: string
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const args = [
        "-y",
        "-i",
        inputPath,
        "-vn",
        "-c:a",
        "libopus",
        "-b:a",
        "48k",
        outputPath
      ];
      const child = spawn(this.config.ffmpegCommand, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
      let stderr = "";
      let stdout = "";

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk || "");
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk || "");
      });
      child.once("error", (error) => {
        reject(new Error(`Failed to launch ffmpeg: ${toErrorMessage(error)}`));
      });
      child.once("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        const detail = [stderr.trim(), stdout.trim()]
          .filter(Boolean)
          .join("\n");
        reject(
          new Error(
            detail
              ? `ffmpeg voice conversion failed (${code}): ${detail}`
              : `ffmpeg voice conversion failed with exit code ${code}`
          )
        );
      });
    });
  }
}
