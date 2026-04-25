import path from "node:path";
import { buildProjectUnderstanding } from "./projectIntelligence.js";
import { ProjectMemoryService } from "./memoryService.js";
import {
  PromptLibraryService,
  type ProjectPromptIntent,
  type StoredProjectPrompt
} from "./promptLibraryService.js";
import {
  buildProjectPromptPresets,
  type ProjectPromptPreset
} from "./skills/projectStatusSkill.js";

export interface PromptAdminItem {
  selector: string;
  source: "builtin" | "custom";
  label: string;
  intent: ProjectPromptIntent;
  group: string;
  prompt: string;
  featured?: boolean;
  removable: boolean;
  createdAt?: string | null;
}

export interface CreatePromptAdminItemInput {
  label: string;
  prompt: string;
  intent?: ProjectPromptIntent;
}

function toPromptAdminItem(
  preset: ProjectPromptPreset,
  customPrompt?: StoredProjectPrompt
): PromptAdminItem {
  return {
    selector: preset.selector,
    source: preset.source,
    label: preset.label,
    intent: preset.intent,
    group: preset.group,
    prompt: preset.prompt,
    featured: preset.featured,
    removable: Boolean(preset.removable),
    createdAt: customPrompt?.createdAt || null
  };
}

function resolveCustomPromptId(selector: string): string {
  const normalized = String(selector || "").trim();
  if (!normalized) {
    throw new Error("prompt_admin_selector_required");
  }

  if (normalized.startsWith("builtin:")) {
    throw new Error("prompt_admin_builtin_not_removable");
  }

  if (normalized.startsWith("custom:")) {
    const customId = normalized.slice("custom:".length).trim();
    if (!customId) {
      throw new Error("prompt_admin_selector_invalid");
    }
    return customId;
  }

  throw new Error("prompt_admin_selector_invalid");
}

export class PromptAdminService {
  constructor(
    private readonly memoryService = new ProjectMemoryService(),
    private readonly promptLibraryService = new PromptLibraryService()
  ) {}

  async listPromptAdminItems(workdir: string): Promise<PromptAdminItem[]> {
    const resolvedWorkdir = path.resolve(workdir);
    const [contract, customPrompts] = await Promise.all([
      buildProjectUnderstanding({
        workdir: resolvedWorkdir,
        memoryService: this.memoryService
      }),
      this.promptLibraryService.listPrompts(resolvedWorkdir)
    ]);

    const customPromptById = new Map(
      customPrompts.map((prompt) => [prompt.id, prompt])
    );

    return buildProjectPromptPresets(contract, customPrompts).map((preset) => {
      const customPrompt =
        preset.source === "custom"
          ? customPromptById.get(preset.selector.replace(/^custom:/, ""))
          : undefined;
      return toPromptAdminItem(preset, customPrompt);
    });
  }

  async createPromptAdminItem(
    workdir: string,
    input: CreatePromptAdminItemInput
  ): Promise<PromptAdminItem> {
    const resolvedWorkdir = path.resolve(workdir);
    const created = await this.promptLibraryService.addPrompt(
      resolvedWorkdir,
      input
    );

    return {
      selector: `custom:${created.id}`,
      source: "custom",
      label: created.label,
      intent: created.intent,
      group: "Custom",
      prompt: created.prompt,
      removable: true,
      createdAt: created.createdAt
    };
  }

  async removePromptAdminItem(
    workdir: string,
    selector: string
  ): Promise<PromptAdminItem | null> {
    const resolvedWorkdir = path.resolve(workdir);
    const customId = resolveCustomPromptId(selector);
    const removed = await this.promptLibraryService.removePrompt(
      resolvedWorkdir,
      customId
    );

    if (!removed) {
      return null;
    }

    return {
      selector: `custom:${removed.id}`,
      source: "custom",
      label: removed.label,
      intent: removed.intent,
      group: "Custom",
      prompt: removed.prompt,
      removable: true,
      createdAt: removed.createdAt
    };
  }
}
