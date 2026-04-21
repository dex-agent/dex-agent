import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type SkillPromotionDestination =
  | "memory"
  | "project_skill"
  | "global_skill";

export interface SkillAssessment {
  destination: SkillPromotionDestination;
  explicitSignals: string[];
  structuralSignals: string[];
  shouldSuggestSkill: boolean;
  shouldAutoPromote: boolean;
  rationale: string[];
}

export interface SkillDraft {
  workdir: string;
  slug: string;
  name: string;
  title: string;
  summary: string;
  destination: Exclude<SkillPromotionDestination, "memory">;
  projectName: string;
  promptText: string | null;
  evidenceValue: string;
  sourceDetail: string;
  tags: string[];
  usageSignals: string[];
  readySignals: string[];
}

export interface SkillDraftInput {
  workdir: string;
  projectName: string;
  title: string;
  summary: string;
  promptText?: string | null;
  evidenceValue: string;
  sourceDetail: string;
  tags: string[];
  assessment: SkillAssessment;
}

export interface PromotedSkillSummary {
  name: string;
  destination: Exclude<SkillPromotionDestination, "memory">;
  relativeSkillPath: string;
}

export interface PendingSkillCandidateSummary {
  id: string;
  title: string;
  destination: Exclude<SkillPromotionDestination, "memory"> | null;
}

export interface ProjectSkillStatus {
  recentSkills: PromotedSkillSummary[];
  pendingCandidates: PendingSkillCandidateSummary[];
  suggestedAction: string | null;
}

export interface SkillPromotionResult {
  status: "created" | "duplicate";
  draft: SkillDraft;
  createdPaths: string[];
  mirrorPaths: string[];
}

export interface RelevantSkill {
  name: string;
  relativeSkillPath: string;
  snippet: string;
  score: number;
}

interface SkillPromotionServiceOptions {
  globalSkillsRoot?: string;
  projectSkillsDirName?: string;
}

const EXPLICIT_SIGNAL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern:
      /\b(isso (tem que|precisa|deve) virar skill|memoriza isso como (habilidade|skill)|isso ja merece promocao|vamos repetir isso|isso vamos usar de novo)\b/i,
    reason: "Operator explicitly asked for reusable skill promotion."
  },
  {
    pattern:
      /\b(this (needs|should) become a skill|remember this as a skill|we will reuse this|promote this to a skill)\b/i,
    reason: "Prompt explicitly asks to preserve the workflow as a reusable skill."
  }
];

const GLOBAL_DESTINATION_PATTERNS = [
  /\b(skill global|global skill|varios projetos|v[aá]rios reposit[oó]rios|across projects|across repos|cross[- ]project|vault global|global vault)\b/i
];

const PROJECT_DESTINATION_PATTERNS = [
  /\b(skill de projeto|project skill|local skill|skill local|runtime daquele projeto|repo especifico|runtime especifico)\b/i
];

const PROJECT_SPECIFIC_PATTERNS = [
  /\bnpm run\b/i,
  /\bscripts?[\\/]/i,
  /\bsrc[\\/]/i,
  /\b\.agents[\\/]/i,
  /\b\.codex[\\/]/i,
  /\bREADME\.md\b/i,
  /\bHANDOFF\.md\b/i,
  /\bACTIVE\.md\b/i,
  /[a-z]:[\\/]/i,
  /\/(project|repo|memory|inbox|status|pwd)\b/i
];

function normalizeAscii(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function normalizeWhitespace(value: string): string {
  return String(value || "").replace(/\r/g, "").trim();
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      normalizeAscii(value)
        .split(/[^a-z0-9_./-]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
    )
  );
}

function slugify(value: string): string {
  const base = normalizeAscii(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return base || "skill-aprendida";
}

function humanizeSkillName(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function firstUsefulLine(value: string): string {
  const clean = normalizeWhitespace(value).replace(/\s+/g, " ");
  if (!clean) return "";
  const withoutPrefix = clean.replace(
    /^(decision|rule|procedure|fact|task_state|exception)\s*[:.-]\s*/i,
    ""
  );
  return withoutPrefix.length <= 96
    ? withoutPrefix
    : `${withoutPrefix.slice(0, 93).trimEnd()}...`;
}

function countStepSignals(value: string): number {
  const matches = [
    ...(value.match(/\b(1\.|2\.|3\.|primeiro|depois|then|step|steps|passo|passos)\b/gi) || []),
    ...(value.match(/^- /gm) || [])
  ];
  return matches.length;
}

function hasProjectSpecificEvidence(
  workdir: string,
  projectName: string,
  combined: string
): boolean {
  if (PROJECT_SPECIFIC_PATTERNS.some((pattern) => pattern.test(combined))) {
    return true;
  }

  const normalized = normalizeAscii(combined);
  return (
    normalized.includes(normalizeAscii(projectName)) ||
    normalized.includes(normalizeAscii(path.basename(workdir)))
  );
}

function parseSkillNameFromFrontmatter(content: string): string | null {
  const match = content.match(/^\s*name:\s*([^\r\n]+)\s*$/im);
  return match?.[1]?.trim() || null;
}

export class SkillPromotionService {
  constructor(
    private readonly options: SkillPromotionServiceOptions = {}
  ) {}

  private projectSkillsRoot(workdir: string): string {
    return path.join(
      path.resolve(workdir),
      this.options.projectSkillsDirName || "skills"
    );
  }

  private globalSkillsRoot(): string {
    return path.resolve(
      this.options.globalSkillsRoot || path.join(os.homedir(), ".codex", "skills")
    );
  }

  assessCandidate({
    workdir,
    projectName,
    title,
    summary,
    promptText,
    evidenceValue,
    existingMatches = 0
  }: {
    workdir: string;
    projectName: string;
    title: string;
    summary: string;
    promptText?: string | null;
    evidenceValue: string;
    existingMatches?: number;
  }): SkillAssessment {
    const combined = [title, summary, promptText || "", evidenceValue]
      .filter(Boolean)
      .join("\n");
    const explicitSignals = EXPLICIT_SIGNAL_PATTERNS.filter(({ pattern }) =>
      pattern.test(combined)
    ).map(({ reason }) => reason);
    const structuralSignals: string[] = [];

    if (existingMatches > 0) {
      structuralSignals.push("A similar workflow already appeared before.");
    }

    if (countStepSignals(combined) >= 3) {
      structuralSignals.push("The workflow contains three or more explicit steps.");
    }

    if (PROJECT_SPECIFIC_PATTERNS.some((pattern) => pattern.test(combined))) {
      structuralSignals.push(
        "The workflow references commands, files, scripts, or operational contracts."
      );
    }

    let destination: SkillPromotionDestination = "memory";
    if (GLOBAL_DESTINATION_PATTERNS.some((pattern) => pattern.test(combined))) {
      destination = "global_skill";
    } else if (
      PROJECT_DESTINATION_PATTERNS.some((pattern) => pattern.test(combined)) ||
      hasProjectSpecificEvidence(workdir, projectName, combined)
    ) {
      destination = "project_skill";
    }

    if (destination !== "memory") {
      structuralSignals.push(
        destination === "global_skill"
          ? "The destination is clearly cross-project."
          : "The destination is clearly project-specific."
      );
    }

    const strongStructuralCount = structuralSignals.filter(
      (signal) => !/destination is clearly/i.test(signal)
    ).length;

    const shouldSuggestSkill =
      destination !== "memory" &&
      (explicitSignals.length > 0 || structuralSignals.length > 0);
    const shouldAutoPromote =
      destination !== "memory" &&
      (explicitSignals.length >= 1 || strongStructuralCount >= 2);

    const rationale = [
      ...explicitSignals,
      ...structuralSignals,
      shouldAutoPromote
        ? "The signal is strong and clear enough for automatic skill promotion."
        : shouldSuggestSkill
          ? "The workflow looks reusable, but it still needs manual review."
          : "The workflow should stay in memory until the reuse signal is stronger."
    ];

    return {
      destination,
      explicitSignals,
      structuralSignals,
      shouldSuggestSkill,
      shouldAutoPromote,
      rationale
    };
  }

  buildDraft(input: SkillDraftInput): SkillDraft | null {
    if (input.assessment.destination === "memory") {
      return null;
    }

    const title = firstUsefulLine(input.title || input.summary);
    const slug = slugify(title);

    return {
      workdir: path.resolve(input.workdir),
      slug,
      name: slug,
      title: title || humanizeSkillName(slug),
      summary: firstUsefulLine(input.summary || input.title),
      destination: input.assessment.destination,
      projectName: input.projectName,
      promptText: normalizeWhitespace(input.promptText || "") || null,
      evidenceValue: normalizeWhitespace(input.evidenceValue),
      sourceDetail: input.sourceDetail,
      tags: input.tags,
      usageSignals: input.assessment.rationale.slice(0, 4),
      readySignals: [
        "A reusable entrypoint exists under SKILL.md.",
        "The operator can recover the workflow quickly in a future conversation.",
        input.assessment.destination === "global_skill"
          ? "The global skill is mirrored in the Dex Agent repo."
          : "The skill lives under the current project runtime."
      ]
    };
  }

  private buildSkillMarkdown(draft: SkillDraft): string {
    const description =
      draft.destination === "global_skill"
        ? `Use when the workflow "${draft.title}" appears again across projects and Codex should reuse it instead of re-learning it.`
        : `Use when the workflow "${draft.title}" appears again inside ${draft.projectName} and Codex should reuse it instead of re-learning it.`;

    const lines = [
      "---",
      `name: ${draft.name}`,
      `description: ${description}`,
      "---",
      "",
      `# ${draft.title}`,
      "",
      "## O que esta skill faz",
      "",
      `Esta skill foi promovida automaticamente pelo Dex Agent a partir de um fluxo repetivel: ${draft.summary}.`,
      "",
      "## Quando usar",
      "",
      `- quando o usuario pedir algo equivalente a: ${draft.title.toLowerCase()}`,
      `- quando a conversa mostrar o mesmo padrao operacional em ${draft.destination === "global_skill" ? "mais de um projeto" : "este projeto"}`,
      "- quando reaprender isso do zero gerar retrabalho",
      "",
      "## Quando nao usar",
      "",
      "- quando a situacao ainda nao tiver contexto suficiente",
      "- quando a solicitacao for parecida, mas o contrato principal tiver mudado",
      "",
      "## Recuperacao rapida",
      "",
      `- origem resumida: ${draft.summary}`,
      ...(draft.promptText ? [`- pedido que disparou a promocao: ${draft.promptText}`] : []),
      `- evidencia registrada: ${draft.evidenceValue}`,
      `- destino: ${draft.destination}`,
      "",
      "## Sinais de pronto",
      "",
      ...draft.readySignals.map((line) => `- ${line}`)
    ];

    return `${lines.join("\n")}\n`;
  }

  private buildReadme(draft: SkillDraft): string {
    const lines = [
      `# ${draft.title}`,
      "",
      "## Resumo",
      "",
      `Esta skill foi criada pelo Dex Agent para evitar que o mesmo fluxo precise ser explicado novamente: ${draft.summary}.`,
      "",
      "## Destino",
      "",
      `- ${draft.destination}`,
      "",
      "## Sinais que justificaram a promocao",
      "",
      ...draft.usageSignals.map((line) => `- ${line}`),
      "",
      "## Recuperacao",
      "",
      "- ler primeiro o SKILL.md",
      "- usar o prompt de contexto quando outro agente precisar retomar rapidamente"
    ];

    return `${lines.join("\n")}\n`;
  }

  private buildContextPrompt(draft: SkillDraft): string {
    const lines = [
      `Voce esta retomando a skill ${draft.name}.`,
      "",
      "Leia primeiro o SKILL.md desta pasta.",
      "",
      "Objetivo:",
      `- reutilizar o fluxo ${draft.title} sem reexplicar tudo do zero`,
      "",
      "Contexto minimo:",
      `- projeto origem: ${draft.projectName}`,
      `- resumo: ${draft.summary}`,
      `- destino: ${draft.destination}`,
      ...(draft.promptText ? [`- pedido gatilho: ${draft.promptText}`] : []),
      `- evidencia: ${draft.evidenceValue}`,
      "",
      "Regra de uso:",
      "- se o pedido atual conflitar com o contrato salvo, diga isso explicitamente antes de executar",
      "- se o pedido atual for equivalente, use a skill como fluxo preferido"
    ];

    return `${lines.join("\n")}\n`;
  }

  private async writeSkillFolder(
    targetRoot: string,
    draft: SkillDraft,
    overwrite = false
  ): Promise<{ status: "created" | "duplicate"; files: string[] }> {
    const folder = path.join(targetRoot, draft.slug);
    const skillPath = path.join(folder, "SKILL.md");
    const readmePath = path.join(folder, "README.md");
    const contextPath = path.join(folder, "PROMPT_AGENTE_CODEX_CONTEXTO.md");

    await fs.mkdir(folder, { recursive: true });

    const alreadyExists = await fs
      .access(skillPath)
      .then(() => true)
      .catch(() => false);
    if (alreadyExists && !overwrite) {
      return {
        status: "duplicate",
        files: [skillPath, readmePath, contextPath]
      };
    }

    await fs.writeFile(skillPath, this.buildSkillMarkdown(draft), "utf8");
    await fs.writeFile(readmePath, this.buildReadme(draft), "utf8");
    await fs.writeFile(contextPath, this.buildContextPrompt(draft), "utf8");

    return {
      status: "created",
      files: [skillPath, readmePath, contextPath]
    };
  }

  async promoteSkill(draft: SkillDraft): Promise<SkillPromotionResult> {
    const projectTargetRoot = this.projectSkillsRoot(draft.workdir);
    const createdPaths: string[] = [];
    const mirrorPaths: string[] = [];

    if (draft.destination === "project_skill") {
      const projectWrite = await this.writeSkillFolder(
        projectTargetRoot,
        draft
      );
      return {
        status: projectWrite.status,
        draft,
        createdPaths: projectWrite.files,
        mirrorPaths
      };
    }

    const globalWrite = await this.writeSkillFolder(
      this.globalSkillsRoot(),
      draft
    );
    const projectWrite = await this.writeSkillFolder(
      projectTargetRoot,
      draft,
      globalWrite.status === "created"
    );

    createdPaths.push(...globalWrite.files);
    mirrorPaths.push(...projectWrite.files);

    return {
      status:
        globalWrite.status === "duplicate" && projectWrite.status === "duplicate"
          ? "duplicate"
          : "created",
      draft,
      createdPaths,
      mirrorPaths
    };
  }

  async listProjectSkillStatus(
    workdir: string,
    pendingCandidates: PendingSkillCandidateSummary[] = []
  ): Promise<ProjectSkillStatus> {
    const skillsRoot = this.projectSkillsRoot(workdir);
    let recentSkills: PromotedSkillSummary[] = [];

    try {
      const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
      const folders = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const folderPath = path.join(skillsRoot, entry.name);
            const stats = await fs.stat(folderPath);
            const skillPath = path.join(folderPath, "SKILL.md");
            const content = await fs.readFile(skillPath, "utf8").catch(() => "");
            const name = parseSkillNameFromFrontmatter(content) || entry.name;
            const mirroredGlobal = await fs
              .access(path.join(this.globalSkillsRoot(), entry.name, "SKILL.md"))
              .then(() => true)
              .catch(() => false);
            return {
              name,
              relativeSkillPath: path
                .relative(path.resolve(workdir), skillPath)
                .replace(/\\/g, "/"),
              destination: mirroredGlobal ? "global_skill" : "project_skill",
              mtimeMs: stats.mtimeMs
            } as const;
          })
      );

      recentSkills = folders
        .sort((left, right) => right.mtimeMs - left.mtimeMs)
        .slice(0, 3)
        .map((entry) => ({
          name: entry.name,
          relativeSkillPath: entry.relativeSkillPath,
          destination: entry.destination
        }));
    } catch {
      recentSkills = [];
    }

    const suggestedAction = pendingCandidates.length
      ? "Use /inbox candidates para revisar os candidatos de skill que ainda nao foram promovidos."
      : recentSkills.length
        ? "Reaproveite primeiro uma das skills recentes antes de reexplicar o mesmo processo."
        : "Quando um fluxo repetivel ficar forte e claro, o Dex Agent pode promovelo automaticamente para skill.";

    return {
      recentSkills,
      pendingCandidates,
      suggestedAction
    };
  }

  async findRelevantSkills(
    workdir: string,
    prompt: string,
    limit = 2
  ): Promise<RelevantSkill[]> {
    const skillsRoot = this.projectSkillsRoot(workdir);
    const promptTokens = tokenize(prompt);
    if (!promptTokens.length) {
      return [];
    }

    try {
      const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
      const candidates = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const skillPath = path.join(skillsRoot, entry.name, "SKILL.md");
            const content = await fs.readFile(skillPath, "utf8").catch(() => "");
            if (!content.trim()) return null;
            const combined = `${entry.name}\n${content}`;
            const entryTokens = tokenize(combined);
            const overlap = promptTokens.filter((token) =>
              entryTokens.includes(token)
            );
            if (!overlap.length) return null;
            const snippet = normalizeWhitespace(content)
              .split("\n")
              .slice(0, 18)
              .join("\n")
              .slice(0, 900);
            return {
              name: parseSkillNameFromFrontmatter(content) || entry.name,
              relativeSkillPath: path
                .relative(path.resolve(workdir), skillPath)
                .replace(/\\/g, "/"),
              snippet,
              score: overlap.length * 10 + (combined.includes(promptTokens[0]) ? 2 : 0)
            };
          })
      );

      return candidates
        .filter(Boolean)
        .sort((left, right) => (right?.score || 0) - (left?.score || 0))
        .slice(0, limit) as RelevantSkill[];
    } catch {
      return [];
    }
  }

  renderRelevantSkillsPacket(relevantSkills: RelevantSkill[], prompt: string): string {
    const lines = [
      "Reusable project skills likely relevant:",
      ...relevantSkills.map(
        (skill) =>
          `- ${skill.name} (${skill.relativeSkillPath})\n${skill.snippet}`
      ),
      "",
      "Prefer reusing these skills before reconstructing the workflow from scratch.",
      "",
      "User request:",
      prompt
    ];

    return lines.join("\n");
  }
}
