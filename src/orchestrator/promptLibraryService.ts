import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type ProjectPromptIntent =
  | "status"
  | "continue"
  | "planning"
  | "implementation";

export interface StoredProjectPrompt {
  id: string;
  createdAt: string;
  label: string;
  prompt: string;
  intent: ProjectPromptIntent;
}

interface AddProjectPromptInput {
  label: string;
  prompt: string;
  intent?: ProjectPromptIntent;
}

const MAX_CUSTOM_PROMPTS = 24;

function normalizeWhitespace(value: string): string {
  return String(value || "")
    .replace(/\r/g, "")
    .trim();
}

function promptsFilePath(workdir: string): string {
  return path.join(workdir, ".agents", "PROMPTS.json");
}

function isValidIntent(value: string): value is ProjectPromptIntent {
  return (
    value === "status" ||
    value === "continue" ||
    value === "planning" ||
    value === "implementation"
  );
}

function isValidPromptRecord(value: unknown): value is StoredProjectPrompt {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<StoredProjectPrompt>;
  return (
    typeof entry.id === "string" &&
    typeof entry.createdAt === "string" &&
    typeof entry.label === "string" &&
    typeof entry.prompt === "string" &&
    typeof entry.intent === "string" &&
    isValidIntent(entry.intent)
  );
}

export class PromptLibraryService {
  async listPrompts(workdir: string): Promise<StoredProjectPrompt[]> {
    try {
      const raw = await fs.readFile(promptsFilePath(workdir), "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(isValidPromptRecord);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }
      return [];
    }
  }

  async addPrompt(
    workdir: string,
    input: AddProjectPromptInput
  ): Promise<StoredProjectPrompt> {
    const label = normalizeWhitespace(input.label);
    const prompt = normalizeWhitespace(input.prompt);
    const intent = input.intent || "implementation";

    if (!label || !prompt) {
      throw new Error("label_and_prompt_required");
    }

    const prompts = await this.listPrompts(workdir);
    const next: StoredProjectPrompt = {
      id: randomUUID().slice(0, 12),
      createdAt: new Date().toISOString(),
      label,
      prompt,
      intent
    };

    const trimmed = [...prompts, next].slice(-MAX_CUSTOM_PROMPTS);
    await fs.mkdir(path.join(workdir, ".agents"), { recursive: true });
    await fs.writeFile(
      promptsFilePath(workdir),
      `${JSON.stringify(trimmed, null, 2)}\n`,
      "utf8"
    );

    return next;
  }

  async removePrompt(
    workdir: string,
    selector: string
  ): Promise<StoredProjectPrompt | null> {
    const prompts = await this.listPrompts(workdir);
    const normalized = normalizeWhitespace(selector);
    if (!normalized) return null;

    let target: StoredProjectPrompt | undefined;
    let index = -1;

    const numericIndex = Number(normalized);
    if (Number.isInteger(numericIndex) && numericIndex >= 0) {
      index = numericIndex;
      target = prompts[index];
    } else {
      index = prompts.findIndex((prompt) => prompt.id === normalized);
      target = index >= 0 ? prompts[index] : undefined;
    }

    if (!target || index < 0) {
      return null;
    }

    const next = prompts.filter((_, entryIndex) => entryIndex !== index);
    await fs.mkdir(path.join(workdir, ".agents"), { recursive: true });
    await fs.writeFile(
      promptsFilePath(workdir),
      `${JSON.stringify(next, null, 2)}\n`,
      "utf8"
    );

    return target;
  }
}
