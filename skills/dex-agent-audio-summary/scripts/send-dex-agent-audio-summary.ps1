param(
    [string]$Text,
    [string]$TextPath,
    [string]$ChatId,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
if (-not (Test-Path $repoRoot)) {
    throw "Dex Agent repo not found at $repoRoot"
}

if (-not $Text -and $TextPath) {
    if (-not (Test-Path $TextPath)) {
        throw "TextPath not found: $TextPath"
    }
    $Text = Get-Content $TextPath -Raw -Encoding UTF8
}

$normalizedText = ""
if (-not [string]::IsNullOrWhiteSpace($Text)) {
    $normalizedText = $Text.Trim()
}
if (-not $normalizedText) {
    throw "Provide -Text or -TextPath with non-empty content."
}

$nodeScript = @'
import { Telegraf } from "telegraf";
import { loadConfig } from "./src/config.js";
import { AudioTts } from "./src/lib/audioTts.js";
import { createTelegramApiAgent } from "./src/lib/telegramApi.js";

const payload = JSON.parse(process.env.DEX_AGENT_AUDIO_SUMMARY_PAYLOAD || "{}");
const config = loadConfig();
const chatCandidates = [
  ["-ChatId", payload.chatId],
  ["DEX_REQUEST_CHAT_ID", process.env.DEX_REQUEST_CHAT_ID],
  ["DEX_CURRENT_CHAT_ID", process.env.DEX_CURRENT_CHAT_ID],
  ["TELEGRAM_CHAT_ID", process.env.TELEGRAM_CHAT_ID],
  ["PROACTIVE_USER_IDS", config.telegram.proactiveUserIds[0]],
  ["ALLOWED_USER_IDS", config.telegram.allowedUserIds[0]]
];
const target = chatCandidates
  .map(([source, value]) => ({ source, chatId: String(value || "").trim() }))
  .find((candidate) => candidate.chatId);
const chatId = target?.chatId || "";

if (!chatId) {
  throw new Error("No Telegram target chat configured.");
}

if (payload.dryRun) {
  console.log(
    JSON.stringify({
      ok: true,
      dryRun: true,
      chatId,
      chatIdSource: target.source,
      textLength: String(payload.text || "").length
    })
  );
  process.exit(0);
}

const telegramApiAgent = createTelegramApiAgent(config.telegram.proxyUrl);
const bot = new Telegraf(config.telegram.botToken, {
  telegram: {
    apiRoot: config.telegram.apiBase,
    ...(telegramApiAgent
      ? { agent: telegramApiAgent, attachmentAgent: telegramApiAgent }
      : {})
  }
});

const tts = new AudioTts(config.audio.tts);
if (!tts.isEnabled()) {
  throw new Error("TTS is disabled in Dex Agent config.");
}

const artifact = await tts.synthesize(String(payload.text || ""));
try {
  const result = await bot.telegram.sendVoice(chatId, {
    source: artifact.filePath,
    filename: artifact.fileName
  });
  console.log(
    JSON.stringify({
      ok: true,
      chatId,
      chatIdSource: target.source,
      messageId: result.message_id,
      fileName: artifact.fileName
    })
  );
} finally {
  await artifact.cleanup();
}
'@

$payload = @{
    text = $normalizedText
    chatId = $ChatId
    dryRun = [bool]$DryRun
} | ConvertTo-Json -Compress

Push-Location $repoRoot
try {
    $env:DEX_AGENT_AUDIO_SUMMARY_PAYLOAD = $payload
    $nodeScript | node --import tsx -
}
finally {
    Remove-Item Env:DEX_AGENT_AUDIO_SUMMARY_PAYLOAD -ErrorAction SilentlyContinue
    Pop-Location
}
