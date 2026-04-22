import {
  ProjectMemoryService,
  type FinalizedResponseCaptureResult,
  type MemoryIntent,
  type MemoryPacket
} from "./memoryService.js";
import type {
  ProjectSkillStatus,
  RelevantSkill,
  SkillPromotionService
} from "./skillPromotionService.js";

export interface PreparedReusePrompt {
  prompt: string;
  promptWithSkills: string;
  disclosure: string | null;
  packet: MemoryPacket | null;
  relevantSkills: RelevantSkill[];
}

export type FinalizedReuseResult = FinalizedResponseCaptureResult;

export class ProjectReuseEngine {
  constructor(private readonly memoryService = new ProjectMemoryService()) {}

  getMemoryService(): ProjectMemoryService {
    return this.memoryService;
  }

  getSkillPromotionService(): SkillPromotionService | null {
    const service = (
      this.memoryService as ProjectMemoryService & {
        getSkillPromotionService?: () => SkillPromotionService;
      }
    ).getSkillPromotionService;
    return typeof service === "function"
      ? service.call(this.memoryService)
      : null;
  }

  async preparePrompt(input: {
    workdir: string;
    prompt: string;
    intent: MemoryIntent;
  }): Promise<PreparedReusePrompt> {
    const { workdir, prompt, intent } = input;
    const skillPromotionService = this.getSkillPromotionService();
    const relevantSkills = skillPromotionService
      ? await skillPromotionService.findRelevantSkills(workdir, prompt)
      : [];
    const packet = await this.memoryService.buildMemoryPacket({
      workdir,
      prompt,
      intent
    });
    const skillDisclosure = relevantSkills.length
      ? `Reusing project skill context: ${relevantSkills.map((skill) => skill.name).join(", ")}`
      : null;
    const promptWithSkills = relevantSkills.length
      ? skillPromotionService!.renderRelevantSkillsPacket(
          relevantSkills,
          prompt
        )
      : prompt;

    if (!packet) {
      return {
        prompt: promptWithSkills,
        promptWithSkills,
        disclosure: skillDisclosure,
        packet,
        relevantSkills
      };
    }

    return {
      prompt: this.memoryService.renderMemoryPacket(packet, promptWithSkills),
      promptWithSkills,
      disclosure:
        [
          skillDisclosure,
          packet.confidence === "low"
            ? this.memoryService.buildSourceDisclosure(packet)
            : null
        ]
          .filter(Boolean)
          .join("\n") || null,
      packet,
      relevantSkills
    };
  }

  async captureFinalizedResponse(input: {
    chatId: string | number;
    workdir: string;
    text: string;
    promptText?: string | null;
  }): Promise<FinalizedReuseResult> {
    return this.memoryService.captureFinalizedResponse(input);
  }

  async getProjectSkillStatus(workdir: string): Promise<ProjectSkillStatus> {
    return this.memoryService.getProjectSkillStatus(workdir);
  }
}
