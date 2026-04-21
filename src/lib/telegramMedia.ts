import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { request, type Dispatcher } from "undici";
import {
  buildTelegramFileUrl,
  createTelegramFetchDispatcher,
  requestTelegramJson
} from "./telegramApi.js";

export interface TelegramMediaSource {
  apiBase: string;
  token: string;
  proxyUrl?: string;
  fileId: string;
  fileName: string;
  mimeType?: string;
  maxFileBytes?: number;
}

interface TelegramGetFileResponse {
  ok?: boolean;
  result?: {
    file_path?: string;
    file_size?: number;
  };
  description?: string;
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

function inferExtension(fileName: string, mimeType?: string): string {
  const fileExtension = path.extname(String(fileName || "")).toLowerCase();
  if (fileExtension) {
    return fileExtension;
  }

  const normalizedMime = String(mimeType || "").toLowerCase();
  if (normalizedMime.includes("png")) return ".png";
  if (normalizedMime.includes("webp")) return ".webp";
  if (normalizedMime.includes("gif")) return ".gif";
  return ".jpg";
}

export async function downloadTelegramMediaToTemp({
  source,
  requestTelegramJsonImpl = requestTelegramJson,
  requestBinaryImpl
}: {
  source: TelegramMediaSource;
  requestTelegramJsonImpl?: JsonRequestFn;
  requestBinaryImpl?: BinaryRequestFn;
}): Promise<{
  filePath: string;
  fileName: string;
  mimeType?: string;
}> {
  const binaryRequest =
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

  const { statusCode, payload } =
    await requestTelegramJsonImpl<TelegramGetFileResponse>({
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

  const maxFileBytes = Number(source.maxFileBytes || 20 * 1024 * 1024);
  const fileSize = Number(payload.result.file_size || 0);
  if (fileSize > maxFileBytes) {
    throw new Error(
      `Media file is too large (${fileSize} bytes). Limit: ${maxFileBytes} bytes.`
    );
  }

  const dispatcher = createTelegramFetchDispatcher(source.proxyUrl);
  const fileUrl = buildTelegramFileUrl(
    source.apiBase,
    source.token,
    payload.result.file_path
  );
  const fileResponse = await binaryRequest(fileUrl, {
    dispatcher
  });

  if (fileResponse.statusCode < 200 || fileResponse.statusCode >= 300) {
    throw new Error(`Telegram file download failed: HTTP ${fileResponse.statusCode}`);
  }

  const tempDir = path.join(os.tmpdir(), "dex-agent-telegram-media");
  await fs.mkdir(tempDir, {
    recursive: true
  });
  const tempPath = path.join(
    tempDir,
    `${randomUUID()}${inferExtension(source.fileName, source.mimeType)}`
  );
  await fs.writeFile(tempPath, Buffer.from(fileResponse.bytes));

  return {
    filePath: tempPath,
    fileName: source.fileName,
    mimeType: source.mimeType
  };
}
