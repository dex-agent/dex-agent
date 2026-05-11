#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    paths: [],
    caption: "",
    chatId: "",
    mode: "auto",
    json: false,
    envFile: "",
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--path" || item === "-p") {
      args.paths.push(argv[++index]);
    } else if (item === "--caption" || item === "-c") {
      args.caption = argv[++index] || "";
    } else if (item === "--chat-id") {
      args.chatId = argv[++index] || "";
    } else if (item === "--mode") {
      args.mode = argv[++index] || "auto";
    } else if (item === "--json") {
      args.json = true;
    } else if (item === "--dry-run") {
      args.dryRun = true;
    } else if (item === "--env-file") {
      args.envFile = argv[++index] || "";
    } else if (item === "--help" || item === "-h") {
      args.help = true;
    } else if (item && !item.startsWith("-")) {
      args.paths.push(item);
    } else {
      throw new Error(`Argumento desconhecido: ${item}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(
    `dex-print\n\nUso:\n  node send-dex-print.mjs --path print.png --caption "Exemplo" --json\n  node send-dex-print.mjs --path desktop.png --path mobile.png --chat-id 123 --mode photo --json\n  node send-dex-print.mjs --path print.png --dry-run --json\n\nAmbiente:\n  BOT_TOKEN ou TELEGRAM_BOT_TOKEN\n  DEX_REQUEST_CHAT_ID, DEX_CURRENT_CHAT_ID, DEX_PRINT_CHAT_ID, TELEGRAM_CHAT_ID, PROACTIVE_USER_IDS ou ALLOWED_USER_IDS\n`
  );
}

function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }

  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function firstId(value = "") {
  return (
    String(value)
      .split(/[,\s;]+/)
      .map((part) => part.trim())
      .filter(Boolean)[0] || ""
  );
}

function loadDefaultEnv(args) {
  const defaultDexEnv = path.join(os.homedir(), ".dex-agent", ".env");
  loadEnvFile(args.envFile);
  loadEnvFile(defaultDexEnv);
  loadEnvFile(path.resolve(process.cwd(), ".env"));
}

function resolveChatTarget(args) {
  const candidates = [
    ["--chat-id", args.chatId],
    ["DEX_REQUEST_CHAT_ID", process.env.DEX_REQUEST_CHAT_ID],
    ["DEX_CURRENT_CHAT_ID", process.env.DEX_CURRENT_CHAT_ID],
    ["DEX_PRINT_CHAT_ID", process.env.DEX_PRINT_CHAT_ID],
    ["TELEGRAM_CHAT_ID", process.env.TELEGRAM_CHAT_ID],
    ["PROACTIVE_USER_IDS", firstId(process.env.PROACTIVE_USER_IDS)],
    ["ALLOWED_USER_IDS", firstId(process.env.ALLOWED_USER_IDS)]
  ];

  for (const [source, value] of candidates) {
    const chatId = String(value || "").trim();
    if (chatId) {
      return { chatId, source };
    }
  }

  return { chatId: "", source: "" };
}

function maskChatId(chatId) {
  if (!chatId) {
    return null;
  }
  const value = String(chatId);
  if (value.length <= 4) {
    return "[redacted]";
  }
  return `${value.slice(0, 2)}...${value.slice(-2)}`;
}

function resolveConfig(args) {
  loadDefaultEnv(args);
  const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
  const target = resolveChatTarget(args);

  if (!token) {
    throw new Error(
      "BOT_TOKEN ausente. Configure BOT_TOKEN/TELEGRAM_BOT_TOKEN ou carregue o .env do Dex Agent."
    );
  }
  if (!target.chatId) {
    throw new Error(
      "chat_id ausente. Passe --chat-id ou configure DEX_REQUEST_CHAT_ID/DEX_CURRENT_CHAT_ID/DEX_PRINT_CHAT_ID/TELEGRAM_CHAT_ID/PROACTIVE_USER_IDS/ALLOWED_USER_IDS."
    );
  }

  return { token, chatId: target.chatId, chatIdSource: target.source };
}

function validatePaths(paths) {
  const resolved = paths.map((filePath) =>
    path.resolve(process.cwd(), filePath)
  );
  if (!resolved.length) {
    throw new Error("Nenhuma imagem informada. Use --path <arquivo>.");
  }
  for (const filePath of resolved) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Arquivo nao encontrado: ${filePath}`);
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      throw new Error(`Caminho nao e arquivo: ${filePath}`);
    }
  }
  return resolved;
}

function mimeFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

async function sendTelegramFile({ token, chatId, filePath, caption, mode }) {
  const endpoint = mode === "document" ? "sendDocument" : "sendPhoto";
  const field = mode === "document" ? "document" : "photo";
  const form = new FormData();
  form.set("chat_id", chatId);
  if (caption) {
    form.set("caption", caption);
  }
  form.set(
    field,
    await fs.openAsBlob(filePath, { type: mimeFromFile(filePath) }),
    path.basename(filePath)
  );

  const response = await fetch(
    `https://api.telegram.org/bot${token}/${endpoint}`,
    {
      method: "POST",
      body: form
    }
  );
  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(payload.description || JSON.stringify(payload));
  }
  return payload.result;
}

async function sendWithFallback(config, filePath, caption, requestedMode) {
  const preferred = requestedMode === "document" ? "document" : "photo";
  const allowFallback = requestedMode === "auto" || requestedMode === "photo";

  try {
    const result = await sendTelegramFile({
      ...config,
      filePath,
      caption,
      mode: preferred
    });
    return {
      ok: true,
      file: filePath,
      mode: preferred,
      message_id: result.message_id,
      chat_id: result.chat?.id
    };
  } catch (error) {
    if (!allowFallback || preferred === "document") {
      return {
        ok: false,
        file: filePath,
        mode: preferred,
        error: error.message
      };
    }
    try {
      const result = await sendTelegramFile({
        ...config,
        filePath,
        caption,
        mode: "document"
      });
      return {
        ok: true,
        file: filePath,
        mode: "document",
        message_id: result.message_id,
        chat_id: result.chat?.id,
        fallback_from: "photo"
      };
    } catch (fallbackError) {
      return {
        ok: false,
        file: filePath,
        mode: "document",
        error: fallbackError.message,
        fallback_from: "photo",
        original_error: error.message
      };
    }
  }
}

function formatText(results) {
  const lines = ["Dex Print result:"];
  for (const item of results) {
    if (item.ok) {
      lines.push(
        `- ${path.basename(item.file)} -> ${item.mode} message_id=${item.message_id}`
      );
    } else {
      lines.push(`- ${path.basename(item.file)} -> falhou: ${item.error}`);
    }
  }
  return lines.join("\n");
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

if (!["auto", "photo", "document"].includes(args.mode)) {
  throw new Error("--mode deve ser auto, photo ou document.");
}

const files = validatePaths(args.paths);

if (args.dryRun) {
  loadDefaultEnv(args);
  const target = resolveChatTarget(args);
  const output = {
    ok: true,
    dry_run: true,
    mode: args.mode,
    caption: args.caption,
    chat_id_present: Boolean(target.chatId),
    chat_id_masked: maskChatId(target.chatId),
    chat_id_source: target.source || null,
    files: files.map((filePath) => ({
      file: filePath,
      bytes: fs.statSync(filePath).size
    }))
  };
  if (args.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(
      formatText(
        output.files.map((item) => ({
          ok: true,
          file: item.file,
          mode: args.mode,
          message_id: "dry-run"
        }))
      )
    );
  }
  process.exit(0);
}

const config = resolveConfig(args);
const results = [];

for (let index = 0; index < files.length; index += 1) {
  const filePath = files[index];
  const prefix = files.length > 1 ? `${index + 1}/${files.length} - ` : "";
  const caption = `${prefix}${args.caption || path.basename(filePath)}`.slice(
    0,
    1024
  );
  results.push(await sendWithFallback(config, filePath, caption, args.mode));
}

const output = { ok: results.every((item) => item.ok), results };
if (args.json) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log(formatText(results));
}

if (!output.ok) {
  process.exit(1);
}
