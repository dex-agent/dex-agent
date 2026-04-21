export interface CommandSpec {
  command: string;
  description: string;
  usage: string;
  group:
    | "Projeto"
    | "Execucao"
    | "Fila"
    | "Estado"
    | "Integracoes";
}

export const COMMAND_CATALOG: CommandSpec[] = [
  { command: "menu", description: "Abre o painel de comandos", usage: "/menu", group: "Projeto" },
  { command: "project", description: "Mostra o card do projeto atual", usage: "/project [default|executive|next|sources|steps|commands|prompts|queue]", group: "Projeto" },
  { command: "prompts", description: "Lista e gerencia prompts frequentes do projeto", usage: "/prompts [show|help|add <label> :: <prompt>|add <intent> :: <label> :: <prompt>|run <selector>|remove <selector>]", group: "Projeto" },
  { command: "inbox", description: "Revisa candidatos e propostas duraveis da memoria", usage: "/inbox [show|help|candidates|proposals|promote <id|index>|discard <id|index>|why <id|index>|confirm <id|index>|cancel <id|index>]", group: "Projeto" },
  { command: "memory", description: "Mostra memoria, candidatos, ajuda e promocoes do projeto", usage: "/memory [show|help|candidates|promote <id|index>|discard <id|index>|why <id|index>|remember <text>]", group: "Projeto" },
  { command: "repo", description: "Lista ou troca de projeto", usage: "/repo [nome|recent|-]", group: "Projeto" },
  { command: "pwd", description: "Mostra o projeto atual", usage: "/pwd", group: "Projeto" },
  { command: "new", description: "Reinicia o contexto do projeto atual", usage: "/new", group: "Projeto" },
  { command: "queue", description: "Gerencia a fila do chat", usage: "/queue [list|add <task>|add <projeto> :: <task>|remove <id|index>|clear|run]", group: "Fila" },
  { command: "continue", description: "Continua pedido bloqueado por conflito de projeto", usage: "/continue", group: "Fila" },
  { command: "exec", description: "Executa uma tarefa unica no Codex", usage: "/exec <task>", group: "Execucao" },
  { command: "auto", description: "Executa uma tarefa unica em modo auto", usage: "/auto <task>", group: "Execucao" },
  { command: "plan", description: "Pede plano ao Codex sem editar", usage: "/plan <task>", group: "Execucao" },
  { command: "interrupt", description: "Interrompe a execucao atual", usage: "/interrupt", group: "Execucao" },
  { command: "stop", description: "Encerra a sessao atual", usage: "/stop", group: "Execucao" },
  { command: "status", description: "Mostra o estado do bot neste chat", usage: "/status", group: "Estado" },
  { command: "dev", description: "Controla o servidor de dev do projeto", usage: "/dev [status|start|stop|logs|url]", group: "Estado" },
  { command: "model", description: "Consulta ou fixa o modelo do chat", usage: "/model [name|reset]", group: "Estado" },
  { command: "language", description: "Troca o idioma do bot", usage: "/language [pt-BR|en|zh|zh-HK]", group: "Estado" },
  { command: "verbose", description: "Liga ou desliga avisos do sistema", usage: "/verbose [on|off]", group: "Estado" },
  { command: "gh", description: "Acoes explicitas do GitHub", usage: "/gh ...", group: "Integracoes" },
  { command: "mcp", description: "Acoes explicitas de MCP", usage: "/mcp ...", group: "Integracoes" },
  { command: "sh", description: "Executa shell segura", usage: "/sh <command>", group: "Integracoes" },
  { command: "cron_now", description: "Dispara o resumo diario agora", usage: "/cron_now", group: "Integracoes" },
  { command: "restart", description: "Reinicia o processo do bot", usage: "/restart", group: "Integracoes" },
  { command: "help", description: "Mostra a ajuda completa", usage: "/help", group: "Integracoes" }
];

export function buildHelpText(): string {
  const groups = new Map<string, CommandSpec[]>();
  for (const item of COMMAND_CATALOG) {
    const list = groups.get(item.group) || [];
    list.push(item);
    groups.set(item.group, list);
  }

  const lines: string[] = [
    "Dex Agent com fluxo deterministico:",
    "- texto, audio e imagem vao direto para o Codex",
    "- acoes estruturadas so por comando, menu ou botoes",
    ""
  ];

  for (const [group, items] of groups.entries()) {
    lines.push(`${group}:`);
    lines.push(...items.map((item) => `- ${item.usage} - ${item.description}`));
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function buildMenuText(): string {
  return [
    "Menu deterministico do Dex Agent",
    "",
    "Projeto:",
    "- /project",
    "- /prompts",
    "- /inbox",
    "- /memory",
    "- /repo",
    "- /pwd",
    "- /new",
    "",
    "Fila:",
    "- /queue",
    "- /continue",
    "",
    "Execucao:",
    "- /exec <task>",
    "- /auto <task>",
    "- /plan <task>",
    "- /interrupt",
    "- /stop",
    "",
    "Estado e integracoes:",
    "- /status",
    "- /dev",
    "- /model",
    "- /language",
    "- /verbose",
    "- /gh",
    "- /mcp",
    "- /sh",
    "- /cron_now",
    "- /restart",
    "- /help"
  ].join("\n");
}

export function getTelegramCommands(): Array<{
  command: string;
  description: string;
}> {
  return COMMAND_CATALOG.map((item) => ({
    command: item.command,
    description: item.description
  }));
}

export function buildMenuButtons(): Array<
  Array<{ text: string; callbackData: string }>
> {
  return [
    [
      { text: "Projeto", callbackData: "menu:project" },
      { text: "Inbox", callbackData: "menu:inbox" },
      { text: "Repos", callbackData: "menu:repo" },
      { text: "Fila", callbackData: "menu:queue" }
    ],
    [
      { text: "Status", callbackData: "menu:status" },
      { text: "PWD", callbackData: "menu:pwd" },
      { text: "Dev", callbackData: "menu:dev" },
      { text: "Continuar", callbackData: "menu:continue" }
    ],
    [
      { text: "Novo", callbackData: "menu:new" },
      { text: "Interromper", callbackData: "menu:interrupt" },
      { text: "Parar", callbackData: "menu:stop" },
      { text: "Ajuda", callbackData: "menu:help" }
    ]
  ];
}
