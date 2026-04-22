import fs from "node:fs/promises";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff"
]);

const PHOTO_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;

interface TelegramImageLike {
  sendPhoto(
    chatId: string | number,
    photo: { source: string; filename?: string },
    options?: Record<string, unknown>
  ): Promise<unknown>;
  sendDocument(
    chatId: string | number,
    document: { source: string; filename?: string },
    options?: Record<string, unknown>
  ): Promise<unknown>;
}

interface BotLike {
  telegram: TelegramImageLike;
}

export interface ImageAttachmentCandidate {
  filePath: string;
  fileName: string;
}

export class ImageAttachmentManager {
  readonly bot: BotLike;
  readonly maxFileBytes: number;

  constructor({
    bot,
    maxFileBytes = DEFAULT_MAX_FILE_BYTES
  }: {
    bot: BotLike;
    maxFileBytes?: number;
  }) {
    this.bot = bot;
    this.maxFileBytes = maxFileBytes;
  }

  async sendReferencedImages({
    chatId,
    text,
    workdir
  }: {
    chatId: string | number;
    text: string;
    workdir: string;
  }): Promise<number> {
    const candidates = await this.findReferencedImages(text, workdir);
    let sent = 0;

    for (const candidate of candidates) {
      await this.sendImage(chatId, candidate);
      sent += 1;
    }

    return sent;
  }

  async findReferencedImages(
    text: string,
    workdir: string
  ): Promise<ImageAttachmentCandidate[]> {
    const candidates = extractImagePathCandidates(text);
    const unique = new Map<string, ImageAttachmentCandidate>();

    for (const candidate of candidates) {
      const resolved = resolveCandidatePath(candidate, workdir);
      if (!resolved || !isImagePath(resolved)) {
        continue;
      }

      const record = await this.toExistingImage(resolved);
      if (!record) {
        continue;
      }

      unique.set(record.filePath.toLowerCase(), record);
    }

    return [...unique.values()];
  }

  private async toExistingImage(
    filePath: string
  ): Promise<ImageAttachmentCandidate | null> {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > this.maxFileBytes) {
        return null;
      }

      return {
        filePath,
        fileName: path.basename(filePath)
      };
    } catch {
      return null;
    }
  }

  private async sendImage(
    chatId: string | number,
    candidate: ImageAttachmentCandidate
  ): Promise<void> {
    const source = {
      source: candidate.filePath,
      filename: candidate.fileName
    };
    const caption = `Imagem gerada: ${candidate.fileName}`;

    if (shouldSendAsPhoto(candidate.filePath)) {
      try {
        await this.bot.telegram.sendPhoto(chatId, source, { caption });
        return;
      } catch {
        // Some formats or sizes are rejected as Telegram photos; documents are
        // the reliable fallback for prints and generated image artifacts.
      }
    }

    await this.bot.telegram.sendDocument(chatId, source, { caption });
  }
}

function shouldSendAsPhoto(filePath: string): boolean {
  return PHOTO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function resolveCandidatePath(
  candidate: string,
  workdir: string
): string | null {
  const cleaned = cleanCandidate(candidate);
  if (!cleaned) {
    return null;
  }

  const resolved = path.isAbsolute(cleaned)
    ? path.resolve(cleaned)
    : path.resolve(workdir, cleaned);

  return isImagePath(resolved) ? resolved : null;
}

function cleanCandidate(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\\([\\_*[\]()~`>#+\-=|{}.!])/g, "$1")
    .replace(/^<|>$/g, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[),.;:]+$/g, "")
    .trim();
}

export function extractImagePathCandidates(text: string): string[] {
  const source = String(text || "");
  const candidates: string[] = [];

  const markdownLinkPattern = /!?\[[^\]]*]\(([^)\n]+)\)/g;
  for (const match of source.matchAll(markdownLinkPattern)) {
    candidates.push(match[1]);
  }

  const anglePathPattern = /<([^<>\n]+\.(?:png|jpe?g|webp|gif|bmp|tiff?))>/gi;
  for (const match of source.matchAll(anglePathPattern)) {
    candidates.push(match[1]);
  }

  const windowsPathPattern =
    /[A-Za-z]:[\\/][^\r\n<>|?*]*?\.(?:png|jpe?g|webp|gif|bmp|tiff?)/gi;
  for (const match of source.matchAll(windowsPathPattern)) {
    candidates.push(match[0]);
  }

  const relativePathPattern =
    /(?:\.{1,2}[\\/])?(?:[\w.-][\w .-]*[\\/])+[\w .()_-]+\.(?:png|jpe?g|webp|gif|bmp|tiff?)/gi;
  for (const match of source.matchAll(relativePathPattern)) {
    candidates.push(cleanCandidate(match[0]));
  }

  return candidates;
}
