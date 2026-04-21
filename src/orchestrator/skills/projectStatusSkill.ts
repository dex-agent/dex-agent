import path from "node:path";
import {
  buildProjectUnderstanding,
  type ProjectStatusVariant,
  type ProjectUnderstandingContract
} from "../projectIntelligence.js";
import { ProjectMemoryService } from "../memoryService.js";
import {
  PromptLibraryService,
  type ProjectPromptIntent,
  type StoredProjectPrompt
} from "../promptLibraryService.js";
import { escapeMarkdownV2 } from "../../bot/formatter.js";
import type { ProjectSkillStatus } from "../skillPromotionService.js";

interface ExecuteInput {
  text?: string;
  workdir?: string;
  variant?: ProjectStatusVariant;
}

interface ProjectStatusButton {
  text: string;
  callbackData: string;
}

interface ProjectStatusResponse {
  text: string;
  parseMode: "markdown";
  buttons?: ProjectStatusButton[][];
}

export interface ProjectPromptPreset {
  label: string;
  prompt: string;
  intent: ProjectPromptIntent;
  selector: string;
  source: "builtin" | "custom";
  removable?: boolean;
}

function sanitizeCommandText(line: string): string {
  return line.replace(/^- /, "").replace(/`/g, "").trim();
}

function labelForSuggestedCommand(line: string): string {
  const command = sanitizeCommandText(line).toLowerCase();
  if (command.includes("frontend:agenda:mock:battery")) return "Bateria agenda";
  if (command.includes("frontend:audit:recurring")) return "Auditoria";
  if (command.includes("frontend:confidence:report")) return "Confianca";
  if (command.includes("frontend:executive:summary")) return "Resumo exec";
  if (command.includes("get-content .agents\\active.md")) return "Ler ACTIVE";
  if (command.includes("get-content .agents\\handoff.md")) return "Ler HANDOFF";
  if (command.includes("npm run ")) {
    return sanitizeCommandText(line).replace(/^npm run\s+/i, "").slice(0, 22);
  }
  return sanitizeCommandText(line).slice(0, 22) || "Comando";
}

function buildCommandButtons(contract: ProjectUnderstandingContract): ProjectStatusButton[][] {
  const rows: ProjectStatusButton[][] = [];
  const buttons = contract.suggestedCommands.slice(0, 4).map((line, index) => ({
    text: labelForSuggestedCommand(line),
    callbackData: `project_status:command:${index}`
  }));

  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2));
  }

  if (!rows.length) {
    rows.push([
      {
        text: "\u{1F9ED} Usar /plan",
        callbackData: "project_status:plan"
      }
    ]);
  }

  return rows;
}

export function buildProjectPromptPresets(
  contract: ProjectUnderstandingContract,
  customPrompts: StoredProjectPrompt[] = []
): ProjectPromptPreset[] {
  const projectName = contract.currentStatus.projectName;
  const nextBlock = contract.currentStatus.nextEligibleBlock || "proximo bloco";
  const latestClosedBlock =
    contract.currentStatus.latestClosedBlock || "ultimo bloco validado";

  const builtins: ProjectPromptPreset[] = [
    {
      label: "Panorama exec",
      intent: "status",
      selector: "builtin:0",
      source: "builtin",
      prompt: `Me devolva um panorama executivo honesto do estado atual do projeto ${projectName}, usando memoria viva, sem inventar backlog e destacando o bloco fechado ${latestClosedBlock} e o proximo bloco ${nextBlock}.`
    },
    {
      label: "Continuar bloco",
      intent: "continue",
      selector: "builtin:1",
      source: "builtin",
      prompt: `Continue o trabalho do projeto ${projectName} a partir do estado vivo atual. Priorize o proximo bloco elegivel ${nextBlock}, sem replanejar do zero e sem reabrir frentes ja fechadas.`
    },
    {
      label: "Cadeia canonica",
      intent: "implementation",
      selector: "builtin:2",
      source: "builtin",
      prompt: `Rerode a cadeia canonica do projeto ${projectName}: auditoria recorrente, confidence report e executive summary, nessa ordem, e me devolva so o veredito final com os pontos fortes e os riscos abertos.`
    },
    {
      label: "Prompt retomada",
      intent: "planning",
      selector: "builtin:3",
      source: "builtin",
      prompt: `Monte um prompt maximo de retomada para uma nova conversa do projeto ${projectName}, citando ACTIVE.md, HANDOFF.md, MEMORY.ndjson, o bloco fechado ${latestClosedBlock}, o proximo bloco ${nextBlock} e a regra de nao inventar backlog.`
    },
    {
      label: "Contar blocos",
      intent: "status",
      selector: "builtin:4",
      source: "builtin",
      prompt: `Me diga falta quantos blocos no projeto ${projectName} ate o limite formalmente planejado, usando o estado canonico atual e sem inventar backlog para manter momentum.`
    },
    {
      label: "Ler protocolo",
      intent: "status",
      selector: "builtin:5",
      source: "builtin",
      prompt: `Leia ACTIVE.md, HANDOFF.md e MEMORY.ndjson do projeto ${projectName} e me devolva somente o protocolo curto de retomada, em formato direto para uso no telefone.`
    }
  ];

  const custom: ProjectPromptPreset[] = customPrompts.map((preset) => ({
    label: preset.label,
    prompt: preset.prompt,
    intent: preset.intent,
    selector: `custom:${preset.id}`,
    source: "custom",
    removable: true
  }));

  return [...builtins, ...custom];
}

function buildPromptButtons(
  contract: ProjectUnderstandingContract,
  customPrompts: StoredProjectPrompt[] = []
): ProjectStatusButton[][] {
  const buttons = buildProjectPromptPresets(contract, customPrompts).map((preset) => ({
    text: preset.label,
    callbackData: `project_status:prompt:${preset.selector.replace(/:/g, "~")}`
  }));
  const rows: ProjectStatusButton[][] = [];

  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2));
  }

  return rows;
}

function formatInlineMarkdown(text: string): string {
  return text
    .split(/(`[^`]+`)/g)
    .filter(Boolean)
    .map((chunk) => {
      if (chunk.startsWith("`") && chunk.endsWith("`")) {
        const code = chunk
          .slice(1, -1)
          .replace(/\\/g, "\\\\")
          .replace(/`/g, "\\`");
        return `\`${code}\``;
      }

      return escapeMarkdownV2(chunk);
    })
    .join("");
}

function toProjectRelativePath(workdir: string, targetPath: string): string {
  const relative = path.relative(workdir, targetPath).replace(/\\/g, "/");
  return relative || path.basename(targetPath);
}

function buildButtons(
  variant: Exclude<ProjectStatusVariant, "default"> | "default" = "default"
): ProjectStatusButton[][] {
  return [
    [
      {
        text: "\u{1F4CC} Panorama curto",
        callbackData: "project_status:executive"
      },
      {
        text: "\u{23ED}\u{FE0F} Proximo bloco",
        callbackData: "project_status:next"
      },
      {
        text: "\u{1F5C2}\u{FE0F} Fontes",
        callbackData: "project_status:sources"
      },
      {
        text: "\u{1F50A}",
        callbackData: `project_status:audio:${variant}`
      }
    ],
    [
      {
        text: "\u{25B6}\u{FE0F} Continuar sprint",
        callbackData: `project_status:continue:${variant}`
      },
      {
        text: "\u{2328}\u{FE0F} Comandos",
        callbackData: "project_status:commands"
      },
      {
        text: "\u{1F9E9} Prompts",
        callbackData: "project_status:prompts"
      },
      {
        text: "\u{1F4DA} Fila",
        callbackData: "project_status:queue"
      }
    ],
    [
      {
        text: "\u{1F9E0} Reuniao",
        callbackData: `project_status:meeting:${variant}`
      }
    ],
    [
      {
        text: "\u{1F4E5} Inbox",
        callbackData: "inbox:show"
      },
      {
        text: "\u{1F9E0} Memoria",
        callbackData: "memory:show"
      },
      {
        text: "ACTIVE",
        callbackData: "memory:view:active"
      },
      {
        text: "HANDOFF",
        callbackData: "memory:view:handoff"
      }
    ]
  ];
}

function buildCommandsVariantButtons(
  contract: ProjectUnderstandingContract
): ProjectStatusButton[][] {
  return [...buildCommandButtons(contract), ...buildButtons("commands")];
}

function buildPromptsVariantButtons(
  contract: ProjectUnderstandingContract,
  customPrompts: StoredProjectPrompt[] = []
): ProjectStatusButton[][] {
  return [...buildPromptButtons(contract, customPrompts), ...buildButtons("prompts")];
}

function buildSourcesLines(
  workdir: string,
  sources: string[],
  limit = 4
): string[] {
  return sources.slice(0, limit).map((source) => {
    const relativePath = toProjectRelativePath(workdir, source)
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`");
    return `- \`${relativePath}\``;
  });
}

function buildMissingSectionNotice(contract: ProjectUnderstandingContract): string[] {
  if (!contract.renderHints.missingSections.length) {
    return [];
  }

  return [
    "",
    `\u{2139}\u{FE0F} *Contrato parcial:* ${escapeMarkdownV2(
      contract.renderHints.missingSections.join(", ")
    )}`
  ];
}

function buildMemoryDisclosure(
  contract: ProjectUnderstandingContract,
  workdir: string
): string[] {
  if (!contract.relevantMemory.length && !contract.memorySources.length) {
    return [];
  }

  const lines = [
    "",
    `\u{1F9E0} *Memory used:* ${escapeMarkdownV2(
      `${contract.relevantMemory.length} durable entr${contract.relevantMemory.length === 1 ? "y" : "ies"}, confidence ${contract.memoryConfidence}`
    )}`
  ];

  if (contract.memorySources.length) {
    const sources = contract.memorySources
      .slice(0, 3)
      .map((source) => toProjectRelativePath(workdir, source))
      .map((source) => `\`${source.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``)
      .join(", ");
    lines.push(`\u{1F4CE} *Memory sources:* ${sources}`);
  }

  if (contract.relevantMemory.length) {
    const top = contract.relevantMemory[0];
    lines.push(
      `\u{1F4A1} *Top memory:* ${escapeMarkdownV2(
        `[${top.kind}] ${top.title}`
      )}`
    );
  }

  return lines;
}

function buildSkillReuseDisclosure(skillStatus: ProjectSkillStatus): string[] {
  if (!skillStatus.recentSkills.length && !skillStatus.pendingCandidates.length) {
    return [];
  }

  const lines = ["", "\u{2728} *Reuso Rapido*"];

  if (skillStatus.recentSkills.length) {
    lines.push(
      `\u{1F9E9} *Skills recentes:* ${escapeMarkdownV2(
        skillStatus.recentSkills
          .map((skill) => `${skill.name} [${skill.destination}]`)
          .join(", ")
      )}`
    );
  }

  if (skillStatus.pendingCandidates.length) {
    lines.push(
      `\u{23F3} *Skills pendentes:* ${escapeMarkdownV2(
        skillStatus.pendingCandidates
          .map(
            (candidate) =>
              `${candidate.title}${candidate.destination ? ` [${candidate.destination}]` : ""}`
          )
          .join(", ")
      )}`
    );
  }

  if (skillStatus.suggestedAction) {
    lines.push(
      `\u{1F449} *Melhor proximo passo:* ${escapeMarkdownV2(
        skillStatus.suggestedAction
      )}`
    );
  }

  return lines;
}

function renderMissingList(
  title: string,
  body: string,
  variant: ProjectStatusVariant
): ProjectStatusResponse {
  return {
    parseMode: "markdown",
    text: [title, "", body].join("\n"),
    buttons: buildButtons(variant)
  };
}

function renderContract(
  contract: ProjectUnderstandingContract,
  workdir: string,
  variant: ProjectStatusVariant,
  customPrompts: StoredProjectPrompt[] = [],
  skillStatus: ProjectSkillStatus = {
    recentSkills: [],
    pendingCandidates: [],
    suggestedAction: null
  }
): ProjectStatusResponse {
  if (!contract.projectProfile) {
    return {
      parseMode: "markdown",
      text: [
        "\u{26A0}\u{FE0F} *Padrao de Projeto Nao Encontrado*",
        "",
        `\u{1F4C1} *Projeto:* ${escapeMarkdownV2(
          contract.currentStatus.projectName
        )}`,
        "",
        escapeMarkdownV2(
          contract.renderHints.safeFallbackReason ||
            "Nao encontrei um padrao compativel de memoria viva neste projeto."
        ),
        "",
        "Esperava encontrar `\\.agents/ACTIVE\\.md` ou `\\.agents/HANDOFF\\.md` antes de responder esse tipo de pergunta\\."
      ].join("\n"),
      buttons: buildButtons("default")
    };
  }

  if (variant === "executive") {
    return {
      parseMode: "markdown",
      text: [
        "\u{1F9ED} *Panorama Executivo*",
        "",
        `\u{2705} *Ultimo bloco fechado:* ${escapeMarkdownV2(
          contract.currentStatus.latestClosedBlock || "nao identificado"
        )}`,
        `\u{23ED}\u{FE0F} *Proximo bloco elegivel:* ${escapeMarkdownV2(
          contract.currentStatus.nextEligibleBlock || "nao identificado"
        )}`,
        `\u{1F7E1} *Execucao formal:* ${escapeMarkdownV2(
          contract.currentStatus.executionFormal || "Nao confirmado"
        )}`,
        `\u{1F9ED} *Frente principal:* ${escapeMarkdownV2(
          contract.currentStatus.primaryFocus || "nao identificada"
        )}`,
        ...(contract.progressSummary.length
          ? [
              `\u{1F4AF} *Progresso forte:* ${formatInlineMarkdown(
                contract.progressSummary[0]
              )}`
            ]
          : []),
        contract.openRisks.length
          ? `\u{1F50E} *Ponto de atencao:* ${escapeMarkdownV2(
              contract.openRisks[0]
            )}`
          : "\u{1F50E} *Ponto de atencao:* nenhum loop aberto forte identificado",
        ...buildSkillReuseDisclosure(skillStatus),
        ...buildMemoryDisclosure(contract, workdir),
        ...buildMissingSectionNotice(contract)
      ].join("\n"),
      buttons: buildButtons("executive")
    };
  }

  if (variant === "next") {
    return {
      parseMode: "markdown",
      text: [
        "\u{23ED}\u{FE0F} *Proximo Bloco*",
        "",
        `*Bloco elegivel:* ${escapeMarkdownV2(
          contract.currentStatus.nextEligibleBlock || "nao identificado"
        )}`,
        `*Estado formal:* ${escapeMarkdownV2(
          contract.currentStatus.executionFormal || "Nao confirmado"
        )}`,
        contract.currentStatus.liveEvidence
          ? `*Base de confianca:* ${escapeMarkdownV2(
              contract.currentStatus.liveEvidence
            )}`
          : "*Base de confianca:* sem evidencia viva resumida",
        contract.currentStatus.publicEvidence
          ? `*Base publica:* ${escapeMarkdownV2(
              contract.currentStatus.publicEvidence
            )}`
          : "*Base publica:* sem evidencia publica resumida",
        ...buildMemoryDisclosure(contract, workdir),
        ...buildMissingSectionNotice(contract)
      ].join("\n"),
      buttons: buildButtons("next")
    };
  }

  if (variant === "sources") {
    return {
      parseMode: "markdown",
      text: [
        "\u{1F5C2}\u{FE0F} *Fontes Canonicas Priorizadas*",
        "",
        ...buildSourcesLines(workdir, contract.canonicalSources, 6),
        ...(contract.memorySources.length
          ? ["", "\u{1F9E0} *Memory ledger used:*", ...buildSourcesLines(workdir, contract.memorySources, 3)]
          : []),
        "",
        "Esses arquivos sao a base que o bot deve consultar antes de improvisar um status\\."
      ].join("\n"),
      buttons: buildButtons("sources")
    };
  }

  if (variant === "steps") {
    if (!contract.nextStepSummary.length) {
      return renderMissingList(
        "\u{1FA9C} *Primeiros Passos*",
        "Primeiros passos ainda nao registrados no contrato atual\\.",
        "steps"
      );
    }

    return {
      parseMode: "markdown",
      text: [
        "\u{1FA9C} *Primeiros Passos*",
        "",
        ...contract.nextStepSummary.map((line) =>
          `- ${formatInlineMarkdown(line.replace(/^- /, ""))}`
        ),
        "",
        "Use este bloco como protocolo curto de retomada antes de abrir o proximo eixo\\.",
        ...buildMissingSectionNotice(contract)
      ].join("\n"),
      buttons: buildButtons("steps")
    };
  }

  if (variant === "commands") {
    if (!contract.suggestedCommands.length) {
      return renderMissingList(
        "\u{2328}\u{FE0F} *Comandos Sugeridos*",
        "Comandos sugeridos ainda nao registrados no contrato atual\\.",
        "commands"
      );
    }

    return {
      parseMode: "markdown",
      text: [
        "\u{2328}\u{FE0F} *Comandos Sugeridos*",
        "",
        ...contract.suggestedCommands.map((line) =>
          `- ${formatInlineMarkdown(line.replace(/^- /, ""))}`
        ),
        "",
        "Toque em um dos atalhos abaixo para mandar esse protocolo ao Codex sem precisar digitar\\.",
        "",
        "Esses comandos devem refletir o protocolo atual do projeto, nao um historico antigo\\.",
        ...buildMissingSectionNotice(contract)
      ].join("\n"),
      buttons: buildCommandsVariantButtons(contract)
    };
  }

  if (variant === "queue") {
    if (!contract.nextQueue.length) {
      return renderMissingList(
        "\u{1F4DA} *Fila de Proximos Blocos*",
        "Fila de proximos blocos ainda nao registrada no contrato atual\\.",
        "queue"
      );
    }

    return {
      parseMode: "markdown",
      text: [
        "\u{1F4DA} *Fila de Proximos Blocos*",
        "",
        ...contract.nextQueue.map((line) =>
          line.startsWith("- ")
            ? `- ${formatInlineMarkdown(line.replace(/^- /, ""))}`
            : formatInlineMarkdown(line)
        ),
        "",
        "A fila e backlog estruturado, nao autorizacao para pular o bloco atual\\.",
        ...buildMissingSectionNotice(contract)
      ].join("\n"),
      buttons: buildButtons("queue")
    };
  }

  if (variant === "prompts") {
    const presets = buildProjectPromptPresets(contract, customPrompts);

    return {
      parseMode: "markdown",
      text: [
        "\u{1F9E9} *Prompts Prontos*",
        "",
        ...presets.map(
          (preset, index) =>
            `*${index + 1}. ${escapeMarkdownV2(preset.label)}*` +
            `\n${escapeMarkdownV2(preset.prompt)}` +
            `\n_${escapeMarkdownV2(preset.source === "custom" ? "custom" : "builtin")}_`
        ),
        "",
        "Toque em um dos atalhos abaixo para enviar esse prompt direto ao Codex sem precisar digitar\\.",
        "Para gerenciar a biblioteca, use `/prompts`\\.",
        ...buildMissingSectionNotice(contract)
      ].join("\n"),
      buttons: buildPromptsVariantButtons(contract, customPrompts)
    };
  }

  const lines = [
    "\u{1F4CA} *Status Atual do Projeto*",
    "",
    `\u{1F4C1} *Projeto:* ${escapeMarkdownV2(contract.currentStatus.projectName)}`,
    `\u{1F9ED} *Frente principal:* ${escapeMarkdownV2(
      contract.currentStatus.primaryFocus || "nao identificada"
    )}`,
    `\u{2705} *Ultimo bloco fechado:* ${escapeMarkdownV2(
      contract.currentStatus.latestClosedBlock || "nao identificado"
    )}`,
    `\u{23ED}\u{FE0F} *Proximo bloco elegivel:* ${escapeMarkdownV2(
      contract.currentStatus.nextEligibleBlock || "nao identificado"
    )}`,
    `\u{1F7E1} *Sprint em execucao formal:* ${escapeMarkdownV2(
      contract.currentStatus.executionFormal || "Nao confirmado"
    )}`
  ];

  if (contract.currentStatus.publicEvidence) {
    lines.push(
      `\u{1F310} *Evidencia publica:* ${formatInlineMarkdown(
        contract.currentStatus.publicEvidence
      )}`
    );
  }
  if (contract.currentStatus.liveEvidence) {
    lines.push(
      `\u{1F9EA} *Evidencia viva:* ${formatInlineMarkdown(
        contract.currentStatus.liveEvidence
      )}`
    );
  }
  if (contract.openRisks.length) {
    lines.push(
      `\u{1F50E} *Loop aberto principal:* ${formatInlineMarkdown(
        contract.openRisks[0]
      )}`
    );
  }
  if (contract.progressSummary.length) {
    lines.push(
      `\u{1F4AF} *Progresso final:* ${formatInlineMarkdown(
        contract.progressSummary[0]
      )}`
    );
  }

  lines.push("", "\u{1F5C2}\u{FE0F} *Fontes priorizadas:*");
  lines.push(...buildSourcesLines(workdir, contract.canonicalSources, 4));
  lines.push(...buildSkillReuseDisclosure(skillStatus));
  lines.push(...buildMemoryDisclosure(contract, workdir));
  lines.push(
    "",
    "\u{1F3AF} *Escolha uma opcao abaixo para testar outra leitura:* panorama curto, proximo bloco, fontes, continuar sprint, comandos, prompts ou fila\\."
  );
  lines.push(...buildMissingSectionNotice(contract));

  return {
    parseMode: "markdown",
    text: lines.join("\n"),
    buttons: buildButtons("default")
  };
}

export class ProjectStatusSkill {
  constructor(
    private readonly memoryService = new ProjectMemoryService(),
    private readonly promptLibraryService = new PromptLibraryService()
  ) {}

  async inspect({
    workdir,
    variant
  }: ExecuteInput): Promise<ProjectUnderstandingContract> {
    const resolvedWorkdir = path.resolve(workdir || process.cwd());
    return buildProjectUnderstanding({
      workdir: resolvedWorkdir,
      variant,
      memoryService: this.memoryService
    });
  }

  async execute({
    workdir,
    variant
  }: ExecuteInput): Promise<ProjectStatusResponse> {
    const resolvedWorkdir = path.resolve(workdir || process.cwd());
    const contract = await this.inspect({
      workdir: resolvedWorkdir,
      variant
    });
    const resolvedVariant = variant || contract.renderHints.variant;
    const customPrompts = await this.promptLibraryService.listPrompts(
      resolvedWorkdir
    );
    const skillStatus = await this.memoryService.getProjectSkillStatus(
      resolvedWorkdir
    );

    return renderContract(
      contract,
      resolvedWorkdir,
      resolvedVariant,
      customPrompts,
      skillStatus
    );
  }
}
