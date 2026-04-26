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
  group: string;
  source: "builtin" | "custom";
  featured?: boolean;
  removable?: boolean;
}

function compactPromptPresetText(value: string, max = 108): string {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function humanizePromptIntent(intent: ProjectPromptIntent): string {
  switch (intent) {
    case "continue":
      return "Continuacao";
    case "planning":
      return "Planejamento";
    case "implementation":
      return "Implementacao";
    default:
      return "Status";
  }
}

function buildExecutionPrompt(task: string): string {
  return [
    "Use $roteador-programacao para escolher o menor fluxo seguro e aplique $kant como lente transversal.",
    task
  ].join(" ");
}

function buildPlanningPrompt(task: string): string {
  return [
    "Use $roteador-programacao para escolher o menor fluxo seguro. Se o melhor caminho for planejamento, use $sprinter. Aplique $kant como lente transversal.",
    task
  ].join(" ");
}

function buildMeetingPrompt(task: string): string {
  return [
    "Use $roteador-programacao para enquadrar o caso. Se a melhor resposta for mesa, use $reuniao. Aplique $kant como lente transversal.",
    task
  ].join(" ");
}

function pickQuickPromptPresets(
  presets: ProjectPromptPreset[]
): ProjectPromptPreset[] {
  const featuredBuiltins = presets.filter(
    (preset) => preset.source === "builtin" && preset.featured
  );
  const custom = presets
    .filter((preset) => preset.source === "custom")
    .slice(0, 2);
  const quick = [...featuredBuiltins, ...custom];
  return (quick.length ? quick : presets).slice(0, 8);
}

function formatPromptPresetSection(
  title: string,
  presets: ProjectPromptPreset[],
  startIndex = 0
): string[] {
  if (!presets.length) return [];

  return [
    `*${escapeMarkdownV2(title)}*`,
    ...presets.map(
      (preset, index) =>
        `*${startIndex + index + 1}. ${escapeMarkdownV2(preset.label)}*` +
        `\n   tipo: ${escapeMarkdownV2(humanizePromptIntent(preset.intent))}` +
        `\n   uso: ${escapeMarkdownV2(compactPromptPresetText(preset.prompt))}`
    ),
    ""
  ];
}

function groupPromptPresets(
  presets: ProjectPromptPreset[]
): Array<{ title: string; presets: ProjectPromptPreset[] }> {
  const order = [
    "Execucao",
    "Planejamento",
    "Reuniao",
    "Testes",
    "Analise",
    "Organizacao",
    "Retomada",
    "Custom"
  ];

  return order
    .map((title) => ({
      title,
      presets: presets.filter((preset) => preset.group === title)
    }))
    .filter((group) => group.presets.length);
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
    return sanitizeCommandText(line)
      .replace(/^npm run\s+/i, "")
      .slice(0, 22);
  }
  return sanitizeCommandText(line).slice(0, 22) || "Comando";
}

function buildCommandButtons(
  contract: ProjectUnderstandingContract
): ProjectStatusButton[][] {
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
      label: "2 blocos seguidos",
      intent: "continue",
      selector: "builtin:0",
      group: "Execucao",
      source: "builtin",
      featured: true,
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, continue direto e execute os proximos 2 blocos completos em sequencia, sem parar entre eles. So avance para o bloco seguinte quando o atual estiver realmente fechado com veredito honesto. Estado atual: bloco fechado ${latestClosedBlock}; proximo bloco ${nextBlock}.`
      )
    },
    {
      label: "3 sprints + reuniao",
      intent: "continue",
      selector: "builtin:1",
      group: "Execucao",
      source: "builtin",
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, execute os proximos 3 sprints. Faça uma reuniao curta de alinhamento quando necessario, aplique ajustes finos e siga direto sem me interromper.`
      )
    },
    {
      label: "12 sprints seguidos",
      intent: "continue",
      selector: "builtin:2",
      group: "Execucao",
      source: "builtin",
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, execute os proximos 12 sprints seguidos, mantendo foco no bloco atual e sem abrir frentes paralelas desnecessarias.`
      )
    },
    {
      label: "Seguir proximo passo",
      intent: "continue",
      selector: "builtin:3",
      group: "Execucao",
      source: "builtin",
      featured: true,
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, siga direto para o proximo passo do plano atual, sem reabrir discussao ja resolvida.`
      )
    },
    {
      label: "Continuar sem pausa",
      intent: "continue",
      selector: "builtin:4",
      group: "Execucao",
      source: "builtin",
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, continue direto a execucao a partir do ponto atual, mantendo o mesmo padrao de qualidade e governanca.`
      )
    },
    {
      label: "Fechar bloco inteiro",
      intent: "continue",
      selector: "builtin:5",
      group: "Execucao",
      source: "builtin",
      featured: true,
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, execute todo este bloco ate o final. So considere concluido quando houver prova, validacao e veredito honesto.`
      )
    },
    {
      label: "Fechar e emendar",
      intent: "continue",
      selector: "builtin:6",
      group: "Execucao",
      source: "builtin",
      featured: true,
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, feche completamente o bloco atual e, se ele terminar limpo, ja emende no proximo bloco sem esperar nova autorizacao.`
      )
    },
    {
      label: "Progresso percentual",
      intent: "continue",
      selector: "builtin:7",
      group: "Execucao",
      source: "builtin",
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, continue a execucao normalmente e, no final de cada sprint ou bloco, informe o progresso real em escala de 0 a 100%.`
      )
    },
    {
      label: "3 sprints + progresso",
      intent: "continue",
      selector: "builtin:8",
      group: "Execucao",
      source: "builtin",
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, execute os proximos 3 sprints. No final, me informe o progresso real de 0 a 100% e o estado do bloco.`
      )
    },
    {
      label: "Execucao maxima",
      intent: "continue",
      selector: "builtin:9",
      group: "Execucao",
      source: "builtin",
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, siga ate o final do bloco atual sem parar, tratando achados laterais como estacionamento e mantendo o foco principal.`
      )
    },
    {
      label: "2 blocos com rigor",
      intent: "continue",
      selector: "builtin:10",
      group: "Execucao",
      source: "builtin",
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, execute os proximos 2 blocos continuamente. Preserve a regra de so abrir o segundo quando o primeiro estiver realmente concluido.`
      )
    },
    {
      label: "Rodada com governanca",
      intent: "continue",
      selector: "builtin:11",
      group: "Execucao",
      source: "builtin",
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, faca uma rodada maior de trabalho, mas preserve governanca: um eixo por vez, um residual forte por lote e validacao no final.`
      )
    },
    {
      label: "Mesa especialistas",
      intent: "planning",
      selector: "builtin:12",
      group: "Reuniao",
      source: "builtin",
      featured: true,
      prompt: buildMeetingPrompt(
        `No projeto ${projectName}, faça uma reuniao com a mesa de especialistas para analisar o estado atual, identificar tensoes reais e sair com encaminhamento claro.`
      )
    },
    {
      label: "Reuniao auditoria",
      intent: "planning",
      selector: "builtin:13",
      group: "Reuniao",
      source: "builtin",
      prompt: buildMeetingPrompt(
        `No projeto ${projectName}, faça uma reuniao rapida de auditoria e alinhamento para revisar o estado atual, confirmar riscos e ajustar o rumo antes de seguir.`
      )
    },
    {
      label: "Reuniao planejamento",
      intent: "planning",
      selector: "builtin:14",
      group: "Reuniao",
      source: "builtin",
      prompt: buildMeetingPrompt(
        `No projeto ${projectName}, gere uma reuniao com foco em planejamento maior, consolidando achados atuais, riscos, prioridades e a proxima sequencia de sprints.`
      )
    },
    {
      label: "Mesa guiada por skill",
      intent: "planning",
      selector: "builtin:15",
      group: "Reuniao",
      source: "builtin",
      prompt: buildMeetingPrompt(
        `No projeto ${projectName}, conduza a discussao com a skill mais apropriada como linha mestra, mantendo foco, objetividade e decisoes acionaveis.`
      )
    },
    {
      label: "Plano do proximo bloco",
      intent: "planning",
      selector: "builtin:16",
      group: "Planejamento",
      source: "builtin",
      featured: true,
      prompt: buildPlanningPrompt(
        `No projeto ${projectName}, consolide o proximo bloco como um plano executavel: objetivo, frente principal, risco principal, criterio de pronto e sequencia de execucao. Estado atual: bloco fechado ${latestClosedBlock}; proximo bloco ${nextBlock}.`
      )
    },
    {
      label: "Bateria completa",
      intent: "implementation",
      selector: "builtin:17",
      group: "Testes",
      source: "builtin",
      featured: true,
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, monte e execute uma bateria de testes completa, cobrindo o fluxo principal e os casos criticos, com validacao real e relatorio final.`
      )
    },
    {
      label: "Teste tentando quebrar",
      intent: "implementation",
      selector: "builtin:18",
      group: "Testes",
      source: "builtin",
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, faça testes tentando quebrar o sistema de verdade. Procure falhas de fluxo, estado, persistencia, contrato, UI e comportamento real.`
      )
    },
    {
      label: "Teste ponta a ponta",
      intent: "implementation",
      selector: "builtin:19",
      group: "Testes",
      source: "builtin",
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, faça um teste ponta a ponta real do fluxo principal deste workspace. Primeiro identifique o fluxo principal atual; depois execute iniciar ou abrir a superfície correta, orientar ou preparar o contexto se isso existir, criar ou acionar a entidade principal, confirmar o resultado, consultar o estado, editar ou avançar o mesmo fluxo, consultar de novo, desfazer, remover ou cancelar quando fizer sentido e verificar limpeza correta de estado, fila e artefatos temporários.`
      )
    },
    {
      label: "Bateria visual ao vivo",
      intent: "implementation",
      selector: "builtin:20",
      group: "Testes",
      source: "builtin",
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, faça uma bateria de testes visuais ao vivo, validando cada superficie relevante em navegador real e registrando os artefatos mais importantes.`
      )
    },
    {
      label: "Especialistas ao vivo",
      intent: "planning",
      selector: "builtin:21",
      group: "Reuniao",
      source: "builtin",
      prompt: buildMeetingPrompt(
        `No projeto ${projectName}, use os especialistas ao vivo apenas para gerar sugestoes realmente uteis a operacao real, sem inflar contexto e sem duplicar autoridade.`
      )
    },
    {
      label: "Avaliacao honesta",
      intent: "status",
      selector: "builtin:22",
      group: "Analise",
      source: "builtin",
      featured: true,
      prompt: buildPlanningPrompt(
        `No projeto ${projectName}, faça uma avaliacao honesta do progresso atual, sem inflar numeros. Diga claramente o que esta forte, o que esta fragil e o que ainda bloqueia avanco.`
      )
    },
    {
      label: "Auditoria clean code",
      intent: "planning",
      selector: "builtin:23",
      group: "Testes",
      source: "builtin",
      prompt: buildPlanningPrompt(
        `No projeto ${projectName}, faça uma auditoria para verificar se nossa resolucao esta seguindo padrao de organizacao, arquitetura e clean code, sem maquiagem.`
      )
    },
    {
      label: "Jogar no estacionamento",
      intent: "implementation",
      selector: "builtin:24",
      group: "Organizacao",
      source: "builtin",
      prompt: buildExecutionPrompt(
        `No projeto ${projectName}, anote os achados laterais e ajustes futuros no estacionamento, sem desviar o foco do bloco principal em execucao.`
      )
    },
    {
      label: "Reuniao ao surgir barata",
      intent: "planning",
      selector: "builtin:25",
      group: "Reuniao",
      source: "builtin",
      prompt: buildMeetingPrompt(
        `No projeto ${projectName}, sempre que aparecer artefato estranho, indicio de barata, conflito de decisao ou tensao estrutural, abra uma reuniao curta e registre o encaminhamento.`
      )
    },
    {
      label: "Planejar proximo bloco",
      intent: "planning",
      selector: "builtin:26",
      group: "Planejamento",
      source: "builtin",
      prompt: buildPlanningPrompt(
        `No projeto ${projectName}, planeje a frente do proximo bloco de trabalho a partir do estado real atual, preservando a governanca conquistada e sem redesenhar tudo do zero. Proximo bloco elegivel: ${nextBlock}.`
      )
    },
    {
      label: "Extrair sistema de design",
      intent: "implementation",
      selector: "builtin:27",
      group: "Testes",
      source: "builtin",
      prompt: buildExecutionPrompt(
        `Use designer-extract no projeto ${projectName} para ler a UI existente, identificar padroes dominantes e consolidar um sistema oficial reutilizavel.`
      )
    },
    {
      label: "Prompt de retomada",
      intent: "planning",
      selector: "builtin:28",
      group: "Retomada",
      source: "builtin",
      featured: true,
      prompt: buildPlanningPrompt(
        `No projeto ${projectName}, monte um prompt de retomada para nova conversa usando memoria viva. Leia primeiro INDEX.md, depois AGENTS.md se existir, depois o INDEX.md local relevante, e so entao ACTIVE.md, HANDOFF.md, .codex/napkin.md, .agents/sprints/INDEX.md quando houver sprint/bloco e .agents/ESTACIONAMENTO.md quando houver residuo/reabertura. Use MEMORY.ndjson como ledger, nao como fonte primaria do proximo passo. Cite o bloco fechado ${latestClosedBlock}, o proximo bloco ${nextBlock} e qualquer INDEX local usado.`
      )
    },
    {
      label: "Retomada maxima",
      intent: "planning",
      selector: "builtin:29",
      group: "Retomada",
      source: "builtin",
      featured: true,
      prompt: buildPlanningPrompt(
        `No projeto ${projectName}, retome exatamente do ponto onde a outra janela parou. Use a ordem INDEX.md raiz -> AGENTS.md -> INDEX.md local relevante -> arquivo alvo -> ACTIVE.md + HANDOFF.md -> .codex/napkin.md -> .agents/sprints/INDEX.md quando houver sprint/bloco -> .agents/ESTACIONAMENTO.md quando houver residuo/reabertura; trate MEMORY.ndjson como ledger. Confirme o estado real, resuma o que esta provado e planeje o proximo bloco antes de executar.`
      )
    }
  ];

  const custom: ProjectPromptPreset[] = customPrompts.map((preset) => ({
    label: preset.label,
    prompt: preset.prompt,
    intent: preset.intent,
    selector: `custom:${preset.id}`,
    group: "Custom",
    source: "custom",
    removable: true
  }));

  return [...builtins, ...custom];
}

function buildPromptButtons(
  contract: ProjectUnderstandingContract,
  customPrompts: StoredProjectPrompt[] = []
): ProjectStatusButton[][] {
  const buttons = pickQuickPromptPresets(
    buildProjectPromptPresets(contract, customPrompts)
  ).map((preset) => ({
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
  return [
    ...buildPromptButtons(contract, customPrompts),
    ...buildButtons("prompts")
  ];
}

function buildSourcesLines(
  workdir: string,
  sources: string[],
  limit = sources.length
): string[] {
  return sources.slice(0, limit).map((source) => {
    const relativePath = toProjectRelativePath(workdir, source)
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`");
    return `- \`${relativePath}\``;
  });
}

function buildMissingSectionNotice(
  contract: ProjectUnderstandingContract
): string[] {
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
      .map((source) => toProjectRelativePath(workdir, source))
      .map(
        (source) => `\`${source.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``
      )
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
  if (
    !skillStatus.recentSkills.length &&
    !skillStatus.pendingCandidates.length
  ) {
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
      `\u{23F3} *Candidates de skill sob revisao:* ${escapeMarkdownV2(
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

function buildCurrentBlockCardLines(
  contract: ProjectUnderstandingContract
): string[] {
  const block = contract.currentBlockStatus;
  if (!block) {
    return [];
  }

  const lines = ["", "\u{1F4CB} *Current block status*"];

  if (block.name) {
    lines.push(`\u{1F3AF} *Bloco atual:* ${escapeMarkdownV2(block.name)}`);
  }
  if (block.conclusion) {
    lines.push(`\u{2705} *Conclusao:* ${escapeMarkdownV2(block.conclusion)}`);
  }
  if (block.planPosition) {
    lines.push(
      `\u{1F522} *Posicao no plano:* ${escapeMarkdownV2(block.planPosition)}`
    );
  }
  if (block.currentObjective) {
    lines.push(
      `\u{1F9ED} *Objetivo atual:* ${escapeMarkdownV2(block.currentObjective)}`
    );
  }
  if (block.nextStep) {
    lines.push(
      `\u{23ED}\u{FE0F} *Proximo passo indicado:* ${escapeMarkdownV2(block.nextStep)}`
    );
  }
  if (block.fallbackPath) {
    lines.push(
      `\u{21A9}\u{FE0F} *Retrocesso padrao:* ${escapeMarkdownV2(block.fallbackPath)}`
    );
  }
  if (block.evidence.length) {
    lines.push(
      `\u{1F4CE} *Evidencia:* ${formatInlineMarkdown(block.evidence[0])}`
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
    const focus =
      contract.currentBlockStatus?.currentObjective ||
      contract.currentStatus.primaryFocus ||
      "nao identificada";
    return {
      parseMode: "markdown",
      text: [
        "\u{1F9ED} *Panorama Executivo*",
        "",
        `\u{2705} *Ultimo bloco fechado:* ${escapeMarkdownV2(
          contract.currentStatus.latestClosedBlock || "nao identificado"
        )}`,
        `\u{23ED}\u{FE0F} *Proximo bloco elegivel:* ${escapeMarkdownV2(
          contract.currentBlockStatus?.nextStep ||
            contract.currentStatus.nextEligibleBlock ||
            "nao identificado"
        )}`,
        `\u{1F7E1} *Execucao formal:* ${escapeMarkdownV2(
          contract.currentStatus.executionFormal || "Nao confirmado"
        )}`,
        `\u{1F9ED} *Frente principal:* ${escapeMarkdownV2(focus)}`,
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
        ...buildCurrentBlockCardLines(contract),
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
          contract.currentBlockStatus?.nextStep ||
            contract.currentStatus.nextEligibleBlock ||
            "nao identificado"
        )}`,
        `*Estado formal:* ${escapeMarkdownV2(
          contract.currentStatus.executionFormal || "Nao confirmado"
        )}`,
        ...(contract.currentBlockStatus?.fallbackPath
          ? [
              `*Retrocesso padrao:* ${escapeMarkdownV2(
                contract.currentBlockStatus.fallbackPath
              )}`
            ]
          : []),
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
        ...buildSourcesLines(workdir, contract.canonicalSources),
        ...(contract.memorySources.length
          ? [
              "",
              "\u{1F9E0} *Memory ledger used:*",
              ...buildSourcesLines(workdir, contract.memorySources)
            ]
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
        ...contract.nextStepSummary.map(
          (line) => `- ${formatInlineMarkdown(line.replace(/^- /, ""))}`
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
        ...contract.suggestedCommands.map(
          (line) => `- ${formatInlineMarkdown(line.replace(/^- /, ""))}`
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
    const grouped = groupPromptPresets(presets);
    let offset = 0;
    const sections = grouped.flatMap((group) => {
      const lines = formatPromptPresetSection(
        group.title,
        group.presets,
        offset
      );
      offset += group.presets.length;
      return lines;
    });

    return {
      parseMode: "markdown",
      text: [
        "\u{1F9E9} *Prompts Prontos*",
        "",
        "Atalhos reutilizaveis para executar pedidos frequentes sem redigitar tudo\\.",
        "",
        ...sections,
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
      contract.currentBlockStatus?.currentObjective ||
        contract.currentStatus.primaryFocus ||
        "nao identificada"
    )}`,
    `\u{2705} *Ultimo bloco fechado:* ${escapeMarkdownV2(
      contract.currentStatus.latestClosedBlock || "nao identificado"
    )}`,
    `\u{23ED}\u{FE0F} *Proximo bloco elegivel:* ${escapeMarkdownV2(
      contract.currentBlockStatus?.nextStep ||
        contract.currentStatus.nextEligibleBlock ||
        "nao identificado"
    )}`,
    `\u{1F7E1} *Sprint em execucao formal:* ${escapeMarkdownV2(
      contract.currentStatus.executionFormal || "Nao confirmado"
    )}`
  ];

  lines.push(...buildCurrentBlockCardLines(contract));

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
  lines.push(...buildSourcesLines(workdir, contract.canonicalSources));
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
    const customPrompts =
      await this.promptLibraryService.listPrompts(resolvedWorkdir);
    const skillStatus =
      await this.memoryService.getProjectSkillStatus(resolvedWorkdir);

    return renderContract(
      contract,
      resolvedWorkdir,
      resolvedVariant,
      customPrompts,
      skillStatus
    );
  }
}
