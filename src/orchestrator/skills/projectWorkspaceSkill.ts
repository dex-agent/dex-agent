type WorkspaceQueryFamily =
  | "switch"
  | "locate"
  | "list"
  | "recent"
  | "previous";

type WorkspaceConfidence = "high" | "medium" | "low";

interface WorkspaceProjectEntry {
  name: string;
  path: string;
  relativePath: string;
}

interface WorkspaceProjectHistoryEntry {
  path: string;
  relativePath: string;
}

interface WorkspaceSkillResult {
  text: string;
  parseMode: "markdown";
  switchToRepo?: string;
}

interface WorkspaceResolver {
  listProjects(): WorkspaceProjectEntry[];
  getRecentProjects(chatId: string | number): WorkspaceProjectHistoryEntry[];
  getCurrentProject(
    chatId: string | number
  ): WorkspaceProjectHistoryEntry | null;
}

interface ExecuteInput {
  text: string;
  chatId?: string | number;
}

interface WorkspaceIntentResolution {
  family: WorkspaceQueryFamily | null;
  confidence: WorkspaceConfidence;
  projectQuery: string | null;
}

const SWITCH_PATTERNS = [
  /\b(mude|mudar|troque|trocar|va|ir|abre|abrir|abra|entre|entrar|use|usar)\b/,
  /\b(switch|change|move|open|go)\b/
];

const LOCATE_PATTERNS = [
  /\b(onde fica|aonde fica|onde esta|aonde esta|localize|localizar|encontre|encontrar|procure|procurar|pesquise|pesquisar)\b/,
  /\b(where is|find|locate|search)\b/
];

function normalizeAscii(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function normalizeWorkspaceQuery(text: string): string {
  return normalizeAscii(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseValue(value: string): string {
  return normalizeWorkspaceQuery(value).replace(/\s+/g, "");
}

function extractProjectQuery(normalizedText: string): string | null {
  const cleaned = normalizedText
    .replace(
      /\b(mude|mudar|troque|trocar|va|ir|abre|abrir|abra|entre|entrar|use|usar|switch|change|move|open|go|onde fica|aonde fica|onde esta|aonde esta|localize|localizar|encontre|encontrar|procure|procurar|pesquise|pesquisar|where is|find|locate|search)\b/g,
      " "
    )
    .replace(/\b(agora|para|pro|pra|to|the|now|please)\b/g, " ")
    .replace(/\b(o|a|os|as|do|da|dos|das)\b/g, " ")
    .replace(
      /\b(projeto|projetos|repo|repositorio|repositorios|repository|repositories)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

function resolveWorkspaceIntent(text: string): WorkspaceIntentResolution {
  const normalized = normalizeWorkspaceQuery(text);

  if (!normalized) {
    return {
      family: null,
      confidence: "low",
      projectQuery: null
    };
  }

  if (
    /\b(projeto anterior|anterior|volte|voltar|previous project|go back|back to previous)\b/.test(
      normalized
    )
  ) {
    return {
      family: "previous",
      confidence: "high",
      projectQuery: null
    };
  }

  if (
    /\b(projetos recentes|recentes|recent projects|recent repos)\b/.test(
      normalized
    )
  ) {
    return {
      family: "recent",
      confidence: "high",
      projectQuery: null
    };
  }

  if (
    /\b(lista|liste|listar|mostrar|mostre|quais)\b/.test(normalized) &&
    /\b(projetos|repositorios|repos|repositories|projects)\b/.test(normalized)
  ) {
    return {
      family: "list",
      confidence: "high",
      projectQuery: null
    };
  }

  const projectQuery = extractProjectQuery(normalized);

  if (
    SWITCH_PATTERNS.some((pattern) => pattern.test(normalized)) &&
    /\b(projeto|repo|repositorio|repository)\b/.test(normalized) &&
    projectQuery
  ) {
    return {
      family: "switch",
      confidence: "high",
      projectQuery
    };
  }

  if (
    LOCATE_PATTERNS.some((pattern) => pattern.test(normalized)) &&
    /\b(projeto|repo|repositorio|repository)\b/.test(normalized) &&
    projectQuery
  ) {
    return {
      family: "locate",
      confidence: "high",
      projectQuery
    };
  }

  return {
    family: null,
    confidence: "low",
    projectQuery: null
  };
}

function scoreProjectMatch(
  project: WorkspaceProjectEntry,
  projectQuery: string
): number {
  const query = normalizeWorkspaceQuery(projectQuery);
  const collapsedQuery = collapseValue(projectQuery);
  const candidateValues = [
    normalizeWorkspaceQuery(project.name),
    normalizeWorkspaceQuery(project.relativePath)
  ];
  const collapsedCandidates = candidateValues.map((value) =>
    collapseValue(value)
  );

  let score = 0;

  if (candidateValues.some((value) => value === query)) {
    score += 10;
  }

  if (collapsedCandidates.some((value) => value === collapsedQuery)) {
    score += 8;
  }

  if (candidateValues.some((value) => value.includes(query))) {
    score += 6;
  }

  if (collapsedCandidates.some((value) => value.includes(collapsedQuery))) {
    score += 5;
  }

  const queryTokens = query.split(/\s+/).filter(Boolean);
  for (const token of queryTokens) {
    if (candidateValues.some((value) => value.includes(token))) {
      score += 1;
    }
  }

  return score;
}

function findProjectMatches(
  projects: WorkspaceProjectEntry[],
  projectQuery: string
): WorkspaceProjectEntry[] {
  return projects
    .map((project) => ({
      project,
      score: scoreProjectMatch(project, projectQuery)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.project.name.localeCompare(right.project.name);
    })
    .map((entry) => entry.project);
}

function formatProjectLines(
  projects: Array<WorkspaceProjectEntry | WorkspaceProjectHistoryEntry>,
  currentRelativePath: string | null
): string[] {
  return projects.map((project) => {
    const marker =
      project.relativePath === currentRelativePath ? " _(atual)_" : "";
    return `- \`${project.relativePath}\`${marker}`;
  });
}

function buildSwitchResult(
  project: WorkspaceProjectEntry
): WorkspaceSkillResult {
  return {
    parseMode: "markdown",
    text: [
      "*Projeto alterado*",
      "",
      `Agora estou em \`${project.relativePath}\`.`,
      "A proxima mensagem ja pode assumir esse contexto."
    ].join("\n"),
    switchToRepo: project.relativePath
  };
}

function buildLocateResult(
  project: WorkspaceProjectEntry
): WorkspaceSkillResult {
  return {
    parseMode: "markdown",
    text: [
      "*Projeto encontrado*",
      "",
      `Encontrei \`${project.relativePath}\`.`,
      `Se quiser trocar agora, diga: \`mude para ${project.relativePath}\`.`
    ].join("\n")
  };
}

export class ProjectWorkspaceSkill {
  private readonly workspace: WorkspaceResolver;

  constructor({ workspace }: { workspace: WorkspaceResolver }) {
    this.workspace = workspace;
  }

  supports(text: string): boolean {
    const resolution = resolveWorkspaceIntent(text);
    return Boolean(resolution.family) && resolution.confidence !== "low";
  }

  async execute({
    text,
    chatId = ""
  }: ExecuteInput): Promise<WorkspaceSkillResult> {
    const resolution = resolveWorkspaceIntent(text);
    const currentProject = this.workspace.getCurrentProject(chatId);

    if (!resolution.family) {
      return {
        parseMode: "markdown",
        text: "Nao encontrei uma acao clara de projeto nessa mensagem."
      };
    }

    if (resolution.family === "list") {
      const projects = this.workspace.listProjects();
      return {
        parseMode: "markdown",
        text: [
          "*Projetos disponiveis*",
          "",
          ...formatProjectLines(projects, currentProject?.relativePath || null)
        ].join("\n")
      };
    }

    if (resolution.family === "recent") {
      const recentProjects = this.workspace.getRecentProjects(chatId);
      if (!recentProjects.length) {
        return {
          parseMode: "markdown",
          text: "Ainda nao existe historico recente de projetos neste chat."
        };
      }

      return {
        parseMode: "markdown",
        text: [
          "*Projetos recentes*",
          "",
          ...formatProjectLines(
            recentProjects,
            currentProject?.relativePath || null
          )
        ].join("\n")
      };
    }

    if (resolution.family === "previous") {
      const recentProjects = this.workspace.getRecentProjects(chatId);
      const previous = recentProjects.find(
        (project) => project.relativePath !== currentProject?.relativePath
      );

      if (!previous) {
        return {
          parseMode: "markdown",
          text: "Nao encontrei um projeto anterior para este chat ainda."
        };
      }

      return {
        parseMode: "markdown",
        text: [
          "*Projeto anterior selecionado*",
          "",
          `Voltando para \`${previous.relativePath}\`.`
        ].join("\n"),
        switchToRepo: previous.relativePath
      };
    }

    const projects = this.workspace.listProjects();
    const matches = findProjectMatches(projects, resolution.projectQuery || "");

    if (!matches.length) {
      return {
        parseMode: "markdown",
        text: [
          "*Projeto nao encontrado*",
          "",
          `Nao achei um projeto forte o suficiente para \`${resolution.projectQuery || "esse pedido"}\`.`,
          "Se quiser, diga o nome exato ou peça: `liste os projetos`."
        ].join("\n")
      };
    }

    if (matches.length > 1) {
      return {
        parseMode: "markdown",
        text: [
          "*Encontrei mais de um projeto possivel*",
          "",
          ...formatProjectLines(
            matches.slice(0, 5),
            currentProject?.relativePath || null
          ),
          "",
          "Me diga qual deles voce quer usar."
        ].join("\n")
      };
    }

    return resolution.family === "switch"
      ? buildSwitchResult(matches[0])
      : buildLocateResult(matches[0]);
  }
}
