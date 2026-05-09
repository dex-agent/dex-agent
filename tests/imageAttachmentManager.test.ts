import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { escapeMarkdownV2 } from "../src/bot/formatter.js";
import {
  extractImagePathCandidates,
  ImageAttachmentManager
} from "../src/lib/imageAttachmentManager.js";

function createTempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dex-agent-images-"));
}

test("extractImagePathCandidates finds markdown, absolute, and relative image paths", () => {
  const candidates = extractImagePathCandidates(
    [
      "Print: [screen](reports/screen.png)",
      "Absolute: C:/Users/TestUser/Projetos/App/output/error.jpg",
      "Relative raw: output\\playwright\\shot.webp"
    ].join("\n")
  );

  assert.ok(candidates.includes("reports/screen.png"));
  assert.ok(
    candidates.includes("C:/Users/TestUser/Projetos/App/output/error.jpg")
  );
  assert.ok(candidates.includes("output\\playwright\\shot.webp"));
});

test("image attachment manager sends existing referenced images as Telegram photos", async () => {
  const workdir = createTempWorkspace();
  const imageDir = path.join(workdir, "reports");
  fs.mkdirSync(imageDir, { recursive: true });
  const imagePath = path.join(imageDir, "screen.png");
  fs.writeFileSync(imagePath, "fake png payload");

  const sentPhotos: Array<{ chatId: string | number; source: string }> = [];
  const sentDocuments: Array<{ chatId: string | number; source: string }> = [];
  const manager = new ImageAttachmentManager({
    bot: {
      telegram: {
        sendPhoto: async (chatId, photo) => {
          sentPhotos.push({ chatId, source: photo.source });
        },
        sendDocument: async (chatId, document) => {
          sentDocuments.push({ chatId, source: document.source });
        }
      }
    }
  });

  const count = await manager.sendReferencedImages({
    chatId: 123,
    text: `Arquivo pronto em reports/screen.png e tambem [screen](${imagePath}).`,
    workdir
  });

  assert.equal(count, 1);
  assert.deepEqual(sentPhotos, [{ chatId: 123, source: imagePath }]);
  assert.deepEqual(sentDocuments, []);
});

test("image attachment manager accepts paths escaped for Telegram MarkdownV2", async () => {
  const workdir = createTempWorkspace();
  const imageDir = path.join(workdir, "output", "playwright");
  fs.mkdirSync(imageDir, { recursive: true });
  const imagePath = path.join(
    imageDir,
    "frontend-sample-mock-2026-04-20_09-33-13-929.png"
  );
  fs.writeFileSync(imagePath, "fake png payload");

  const sentPhotos: Array<{ chatId: string | number; source: string }> = [];
  const manager = new ImageAttachmentManager({
    bot: {
      telegram: {
        sendPhoto: async (chatId, photo) => {
          sentPhotos.push({ chatId, source: photo.source });
        },
        sendDocument: async () => {}
      }
    }
  });

  const count = await manager.sendReferencedImages({
    chatId: 123,
    text: escapeMarkdownV2(`Print anotada salva em:\n${imagePath}`),
    workdir
  });

  assert.equal(count, 1);
  assert.deepEqual(sentPhotos, [{ chatId: 123, source: imagePath }]);
});

test("image attachment manager falls back to Telegram documents when photo upload fails", async () => {
  const workdir = createTempWorkspace();
  const imagePath = path.join(workdir, "layout.jpg");
  fs.writeFileSync(imagePath, "fake jpg payload");

  const sentDocuments: Array<{ chatId: string | number; source: string }> = [];
  const manager = new ImageAttachmentManager({
    bot: {
      telegram: {
        sendPhoto: async () => {
          throw new Error("photo rejected");
        },
        sendDocument: async (chatId, document) => {
          sentDocuments.push({ chatId, source: document.source });
        }
      }
    }
  });

  const count = await manager.sendReferencedImages({
    chatId: "chat",
    text: `Veja ${imagePath}`,
    workdir
  });

  assert.equal(count, 1);
  assert.deepEqual(sentDocuments, [{ chatId: "chat", source: imagePath }]);
});

test("image attachment manager ignores missing and oversized images", async () => {
  const workdir = createTempWorkspace();
  const imagePath = path.join(workdir, "huge.png");
  fs.writeFileSync(imagePath, "payload too large for this test limit");

  let sent = 0;
  const manager = new ImageAttachmentManager({
    maxFileBytes: 4,
    bot: {
      telegram: {
        sendPhoto: async () => {
          sent += 1;
        },
        sendDocument: async () => {
          sent += 1;
        }
      }
    }
  });

  const count = await manager.sendReferencedImages({
    chatId: 1,
    text: `Arquivos: ${imagePath} e missing.png`,
    workdir
  });

  assert.equal(count, 0);
  assert.equal(sent, 0);
});
