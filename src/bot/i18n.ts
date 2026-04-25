export const SUPPORTED_LANGUAGES = ["pt-BR", "en", "zh", "zh-HK"] as const;
export type Locale = (typeof SUPPORTED_LANGUAGES)[number];

type TranslationParams = Record<string, any>;
type TranslationEntry =
  | string
  | ((params: TranslationParams) => string | string[]);
type TranslationCatalog = Record<string, TranslationEntry>;
type TranslateFn = {
  (locale: string, key: ArrayMessageKey, params?: TranslationParams): string[];
  (locale: string, key: string, params?: TranslationParams): string;
};

const DEFAULT_LANGUAGE: Locale = "pt-BR";

const LANGUAGE_LABELS: Record<Locale, Record<Locale, string>> = {
  "pt-BR": {
    "pt-BR": "Português (Brasil)",
    en: "Inglês",
    zh: "Chinês simplificado",
    "zh-HK": "Chinês tradicional (Hong Kong)"
  },
  en: {
    "pt-BR": "Portuguese (Brazil)",
    en: "English",
    zh: "Simplified Chinese",
    "zh-HK": "Traditional Chinese (Hong Kong)"
  },
  zh: {
    "pt-BR": "葡萄牙语（巴西）",
    en: "英文",
    zh: "简体中文",
    "zh-HK": "繁体中文（香港）"
  },
  "zh-HK": {
    "pt-BR": "葡萄牙語（巴西）",
    en: "英文",
    zh: "簡體中文",
    "zh-HK": "繁體中文（香港）"
  }
};

function joinLines(lines: readonly string[] = []): string {
  return lines.join("\n");
}

const MESSAGES: Record<string, TranslationCatalog> = {
  en: {
    buttonRefreshTestStatus: "Refresh test status",
    emptyResponse: "(empty response)",
    startLines: () => [
      "Dex Agent ready.",
      "Plain messages, voice notes, and coding tasks route to Codex.",
      "Bot-side MCP only runs through explicit /mcp commands.",
      "Try: /status, /repo, /pwd, /exec, /auto, /plan, /model, /language, /verbose, /skill, /new, /sh",
      'GitHub example: /gh commit "feat: init"'
    ],
    helpLines: () => [
      "Commands:",
      "/help - Show help",
      "/status - Show runtime status for this chat",
      "/pwd - Show the current project directory",
      "/repo - List switchable projects",
      "/repo <name> - Switch the current chat to another project",
      "/repo <keyword> - Match projects by keyword and switch or show candidates",
      "/repo recent - Show recent projects for this chat",
      "/repo - - Switch back to the previous project",
      "/new - Clear the current project's saved conversation",
      "/exec <task> - Force a one-off Codex run without saving project context",
      "/auto <task> - Force a one-off fully automatic Codex run",
      "/plan <task> - Generate a plan only, without direct file modification intent",
      "/continue - Replay the last blocked same-workdir request once",
      "/queue [list|add|remove|clear|run] - Manage queued Codex requests for this chat",
      "/fila [listar|adicionar|remover|limpar|executar] - Alias for /queue",
      "/model [name|reset] - Show or set the model for this chat",
      "/language [en|zh|zh-HK] - Show or set the system language for this chat",
      "/verbose [on|off] - Show or hide system notices for this chat",
      "/skill list - Show skill switches for this chat",
      "/skill status - Alias of /skill list",
      "/skill on <name> - Enable a skill",
      "/skill off <name> - Disable a skill",
      "/dev start|stop|status|logs|url - Manage a repo frontend dev server",
      "/sh <command> - Run a restricted Linux command (disabled by default)",
      "/sh --confirm <command> - Confirm a dangerous shell command",
      "/restart - Restart the bot process",
      "/interrupt - Interrupt the active Codex run",
      "/stop - Terminate the active Codex run",
      "/cron_now - Trigger the daily summary immediately",
      "/gh ... - GitHub skill",
      "/mcp ... - MCP control and explicit tool calls",
      "Voice notes and audio files - transcribed to text before routing to Codex"
    ],
    statusLines: ({
      status,
      recentProjects,
      shellSummary,
      skillsSummary,
      mcpSummary
    }) => [
      "Status:",
      `backend: ${status.backend}`,
      `active: ${status.active ? "yes" : "no"}`,
      `active mode: ${status.activeMode || "idle"}`,
      `last mode: ${status.lastMode || "none"}`,
      `last exit: ${status.lastExitCode === null ? "n/a" : status.lastExitCode}`,
      `pty supported: ${
        status.backend === "sdk"
          ? "n/a (sdk backend)"
          : status.ptySupported === null
            ? "unknown"
            : status.ptySupported
              ? "yes"
              : "no (exec fallback)"
      }`,
      `preferred model: ${status.preferredModel || "inherit codex default"}`,
      `language: ${status.language} (${languageLabel(status.language, "en")})`,
      `verbose: ${status.verboseOutput ? "on" : "off"}`,
      `command: ${status.command}`,
      `workspace root: ${status.workspaceRoot}`,
      `workdir: ${status.workdir}`,
      `recent projects: ${recentProjects || "."}`,
      `project context: ${status.projectSessionId ? `resumable (${status.projectSessionId})` : "fresh"}`,
      `workflow system: ${status.workflowSystem} (internal)`,
      `workflow phase: ${status.workflowPhase}`,
      `safe shell: ${shellSummary}`,
      `skills: ${skillsSummary}`,
      `mcp servers: ${mcpSummary}`
    ],
    statusObservabilityHeader: "observability:",
    statusOperationalPosture: ({ value }) => `runtime posture: ${value}`,
    statusPostureWorking: "working now",
    statusPosturePendingReplay: "waiting for replay approval",
    statusPostureQueued: "queued work pending",
    statusPostureAwaitingCloseout: "awaiting closeout",
    statusPostureRecentFinish: "recently finalized",
    statusPostureProlongedSilence: "prolonged silence",
    statusPostureIdle: "idle",
    statusPendingPromptSignal: ({ text }) => `pending replay: ${text}`,
    statusQueueSignal: ({ count, next }) =>
      next
        ? `queue: ${count} pending (next: ${next})`
        : `queue: ${count} pending`,
    statusLastPromptSignal: ({ value }) => `last prompt: ${value}`,
    statusLastFinalizedSignal: ({ value }) => `last finalized: ${value}`,
    statusLastFinalResponseSignal: ({ text }) => `last final response: ${text}`,
    pwdLines: ({ status, recent }) => [
      `workspace root: ${status.workspaceRoot}`,
      `current project: ${status.relativeWorkdir}`,
      `workdir: ${status.workdir}`,
      `recent: ${recent || "."}`
    ],
    repoList: ({ workspaceRoot, projectLines, recentLines }) =>
      joinLines([
        `workspace root: ${workspaceRoot}`,
        "Available projects:",
        ...(projectLines.length
          ? projectLines
          : ["- (no git repositories found under the workspace root)"]),
        "",
        "Recent projects:",
        ...(recentLines.length ? recentLines : ["- ."]),
        "",
        "Usage: /repo <name> | /repo recent | /repo -"
      ]),
    repoRecent: ({ recentLines }) =>
      joinLines([
        "Recent projects:",
        ...(recentLines.length ? recentLines : ["- ."]),
        "",
        "Use /repo <name> to switch."
      ]),
    repoNoMatch: ({ value }) => `No matching project: ${value}`,
    repoSuggestion: ({ value, suggestion }) =>
      joinLines([
        `No matching project: ${value}`,
        `Did you mean: ${suggestion}`,
        `Try: /repo ${suggestion}`
      ]),
    repoMultipleMatches: ({ value, projectLines }) =>
      joinLines([
        `Multiple projects match: ${value}`,
        ...projectLines,
        "",
        "Use a more specific name."
      ]),
    repoSwitched: ({ relativePath, workdir }) =>
      joinLines([
        "Project switched successfully.",
        `active project: ${relativePath}`,
        `workdir: ${workdir}`
      ]),
    repoAlreadyCurrent: ({ relativePath, workdir }) =>
      joinLines([
        "The requested project is already active.",
        `active project: ${relativePath}`,
        `workdir: ${workdir}`
      ]),
    repoSwitchFailed: ({ error }) => `Project switch failed: ${error}`,
    instanceRepoSwitchBlocked: ({ project }) =>
      joinLines([
        "This Dex Agent instance is fixed to one project.",
        `fixed project: ${project}`,
        "Repository switching is blocked in instance mode."
      ]),
    skillList: ({ skillLines }) =>
      joinLines([
        "Skills:",
        ...skillLines,
        "internal workflow: superpowers (not toggleable from /skill)",
        "",
        "Usage: /skill list | /skill on <name> | /skill off <name>"
      ]),
    skillUsage: "Usage: /skill list | /skill on <name> | /skill off <name>",
    skillStateChanged: ({ name, enabled, changed, skillLines }) =>
      joinLines([
        changed
          ? `skill ${name} ${enabled ? "enabled" : "disabled"}.`
          : `skill ${name} is already ${enabled ? "enabled" : "disabled"}.`,
        ...skillLines
      ]),
    skillManagementFailed: ({ error }) => `Skill update failed: ${error}`,
    usageDev:
      "Usage: /dev start | /dev stop | /dev status | /dev logs | /dev url",
    devStarted: ({ command, scriptName, relativeWorkdir }) =>
      joinLines([
        "Frontend dev server started.",
        `project: ${relativeWorkdir}`,
        `script: ${scriptName}`,
        `command: ${command}`
      ]),
    devAlreadyRunning: ({ relativeWorkdir, startedByChatId, command }) =>
      joinLines([
        "A frontend dev server is already running for this repo.",
        `project: ${relativeWorkdir}`,
        `started by chat: ${startedByChatId}`,
        `command: ${command}`
      ]),
    devNoPackageJson: ({ relativeWorkdir }) =>
      `No package.json found in this repo: ${relativeWorkdir}`,
    devNoScript: ({ relativeWorkdir, availableScripts }) =>
      joinLines([
        `No frontend start script found in this repo: ${relativeWorkdir}`,
        `available scripts: ${availableScripts}`
      ]),
    devSpawnFailed: ({ error }) =>
      `Failed to start the frontend dev server: ${error}`,
    devStopped: ({ relativeWorkdir }) =>
      `Stopped the frontend dev server for ${relativeWorkdir}.`,
    devNotRunning: ({ relativeWorkdir }) =>
      `No frontend dev server is running for ${relativeWorkdir}.`,
    devStatus: ({ devStatus, relativeWorkdir }) =>
      joinLines([
        "Frontend dev server:",
        `project: ${relativeWorkdir}`,
        `status: ${devStatus.status}`,
        `running: ${devStatus.running ? "yes" : "no"}`,
        `started by chat: ${devStatus.startedByChatId || "n/a"}`,
        `command: ${devStatus.command || "n/a"}`,
        `pid: ${devStatus.pid ?? "n/a"}`,
        `url: ${devStatus.detectedUrl || "not detected"}`
      ]),
    devLogs: ({ relativeWorkdir, logs }) =>
      joinLines([`Frontend dev logs for ${relativeWorkdir}:`, "", logs]),
    devUrl: ({ relativeWorkdir, url }) =>
      joinLines([`Frontend dev URL for ${relativeWorkdir}:`, url]),
    devNoUrl: ({ relativeWorkdir }) =>
      `No frontend dev URL detected yet for ${relativeWorkdir}. Check /dev logs.`,
    conversationReset: ({ closed }) =>
      closed
        ? "The current project's conversation was cleared and the active session was closed. The next message will start a fresh Codex conversation in this project."
        : "The current project's conversation was cleared. The next message will start a fresh Codex conversation in this project.",
    restartUnavailable:
      "Bot restart control is not enabled in this environment.",
    restarting: "Restarting the bot process...",
    startupReady: ({ relativeWorkdir }) =>
      joinLines([
        "Dex Agent started and is ready.",
        `current project: ${relativeWorkdir}`
      ]),
    restartReady: ({ relativeWorkdir }) =>
      joinLines([
        "Bot restart finished.",
        `current project: ${relativeWorkdir}`,
        "If you sent a command during the restart window, please send it again now."
      ]),
    usageExec: "Usage: /exec <task>",
    usageSh: "Usage: /sh <command>",
    usageAuto: "Usage: /auto <task>",
    usagePlan: "Usage: /plan <task>",
    usageQueue:
      "Usage: /queue [list|add <task>|add <project> :: <task>|remove <id|index>|clear|run]",
    usageVerbose: "Usage: /verbose [on|off]",
    usageLanguage: "Usage: /language [en|zh|zh-HK]",
    execNotice: "Running one-off Codex task...",
    autoNotice: "Running one-off fully automatic Codex task...",
    planNotice: "Running planning-only Codex task...",
    taskBusy: ({ mode }) =>
      `A ${mode || "unknown"} task is already running. Wait for it to finish or use /interrupt first.`,
    queueQueued: ({ index, id, queueLength, text }) =>
      joinLines([
        "Recebi. Coloquei na fila para executar quando o Codex terminar.",
        `posicao: ${index}`,
        `id: ${id}`,
        `itens na fila: ${queueLength}`,
        `pedido: ${text}`,
        "Use /queue para consultar ou /queue remove <id|posicao> para remover."
      ]),
    queueAdded: ({ index, id, text }) =>
      joinLines([
        "Item adicionado na fila.",
        `posicao: ${index}`,
        `id: ${id}`,
        `pedido: ${text}`
      ]),
    queueAddFailed: ({ reason }) =>
      `Nao consegui adicionar na fila: ${reason}.`,
    queueEmpty: "A fila deste chat esta vazia.",
    queueList: ({ queueLines }) =>
      joinLines(["Fila deste chat:", ...queueLines]),
    queueRemoved: ({ id, text, count }) =>
      joinLines([
        "Item removido da fila.",
        `id: ${id}`,
        `pedido: ${text}`,
        `itens restantes: ${count}`
      ]),
    queueRemoveFailed: ({ selector, reason }) =>
      `Nao encontrei o item ${selector} na fila (${reason}).`,
    queueCleared: ({ count }) => `Fila limpa. ${count} item(ns) removido(s).`,
    queueStartupRecovery: ({ count, relativeWorkdir, text }) =>
      joinLines([
        "Encontrei uma fila pendente deste chat apos o restart do bot.",
        `projeto: ${relativeWorkdir}`,
        `itens pendentes: ${count}`,
        `proximo item: ${text}`,
        "Escolha abaixo se quer rodar agora, revisar a fila ou limpar."
      ]),
    buttonQueueRunNow: "▶️ Rodar agora",
    buttonQueueView: "📋 Ver fila",
    buttonQueueClear: "🗑️ Limpar fila",
    operationalStatusHeader: "Estado operacional atual:",
    interruptWithQueueStatus: "Execucao interrompida. Estado atual da fila:",
    workspaceContention: ({
      relativeWorkdir,
      mode,
      blockingChatId,
      continueCommand
    }) =>
      joinLines([
        `Another chat (${blockingChatId}) already has an active Codex ${mode || "task"} in this same workdir: ${relativeWorkdir}.`,
        "Starting another Codex run in the same workdir can conflict.",
        `Send ${continueCommand} to replay this blocked request once anyway.`
      ]),
    continueStarted: ({ mode }) =>
      `Replaying the blocked request once (${mode}).`,
    queueRunStarted: ({ mode }) =>
      `Queued item sent to Codex (${mode}). I will show progress here.`,
    continueNothingPending: "No blocked request is pending for this chat.",
    codexBusyForShell:
      "A Codex task is currently running. Wait for it to finish or use /interrupt or /new first.",
    shellRequiresConfirmation: ({ command, confirmationCommand }) =>
      joinLines([
        "This command is marked as high risk and requires confirmation.",
        `command: ${command}`,
        `confirm with: ${confirmationCommand}`
      ]),
    runningSafeShell: ({ workdir, command }) =>
      joinLines([
        "Running safe shell command...",
        `workdir: ${workdir}`,
        `command: ${command}`
      ]),
    shellBusy: "A shell command is already running for this chat.",
    shellResult: ({ result }) =>
      joinLines([
        `shell status: ${result.status}`,
        `command: ${result.command}`,
        `workdir: ${result.workdir}`,
        `exitCode: ${result.exitCode === null ? "n/a" : result.exitCode}`,
        `signal: ${result.signal || "none"}`,
        "",
        "output:",
        result.output
      ]),
    shellCloneSucceeded: ({ relativePath, workdir, repoCommand }) =>
      joinLines([
        "Clone completed.",
        `project: ${relativePath}`,
        `workdir: ${workdir}`,
        repoCommand
          ? `next: switch to it with ${repoCommand}`
          : "next: switch to the cloned repo with /repo <name>"
      ]),
    modelCurrent: ({ model }) =>
      `Current model: ${model || "inherit codex default"}`,
    modelReset: ({ closed }) =>
      closed
        ? "Model reset to the Codex default and the current session was rebuilt."
        : "Model reset to the Codex default.",
    modelSet: ({ value, closed }) =>
      closed
        ? `Model set to ${value} and the current session was rebuilt.`
        : `Model set to ${value}.`,
    verboseCurrent: ({ enabled }) =>
      `System notices: ${enabled ? "on" : "off"}`,
    verboseSet: ({ enabled }) =>
      `System notices ${enabled ? "enabled" : "disabled"}.`,
    languageCurrent: ({ language }) =>
      `Current language: ${language} (${languageLabel(language, "en")})`,
    languageSet: ({ language }) =>
      `Language set to ${language} (${languageLabel(language, "en")}).`,
    languageInvalid: "Supported languages: en, zh, zh-HK.",
    interruptResult: ({ ok }) =>
      ok
        ? "Interrupted the active Codex run."
        : "There is no active Codex run for this chat.",
    stopResult: ({ ok }) =>
      ok
        ? "The active Codex run was terminated."
        : "There is no active Codex run for this chat.",
    cronTriggered: "The daily summary was triggered and sent.",
    triggerFailed: ({ error }) => `Trigger failed: ${error}`,
    githubDisabled:
      "GitHub skill is disabled for this chat. Use /skill on github to enable it again.",
    githubFailed: ({ error }) => `GitHub skill failed: ${error}`,
    mcpDisabled:
      "MCP skill is disabled for this chat. Use /skill on mcp to enable it again.",
    mcpFailed: ({ error }) => `MCP skill failed: ${error}`,
    callbackRefreshed: "Status refreshed",
    buttonAudioSummary: "🔊 Resumo em audio",
    buttonAudioSummaryConcise: "🎧 Conciso",
    buttonAudioSummaryDetailed: "🔊 Detalhado",
    audioSummaryOffer:
      "Essa resposta ficou longa. Quer um resumo curto em audio?",
    finalActionsOffer:
      "How should I proceed from here?\nEach button sends one specific follow-up action. You can also type your own reply.",
    buttonQuickExecute: "▶️ Execute next step",
    buttonQuickReview: "🧠 Start review",
    buttonQuickOrganize: "📥 Open inbox now",
    buttonQuickExecuteRecommended: "✅ Execute next step",
    buttonQuickReviewRecommended: "✅ Start review",
    buttonQuickOrganizeRecommended: "✅ Open inbox now",
    audioSummaryCaption: "Resumo curto em audio",
    audioSummaryUnavailable: "Audio summaries are not enabled right now.",
    audioSummaryGenerating: "Gerando resumo em audio...",
    audioSummaryExpired:
      "Esse pedido de audio expirou. Me peça de novo e eu regenero.",
    audioSummaryFailed: ({ error }) => `Audio summary failed: ${error}`,
    testJobNotFound: ({ jobId }) => `Test job not found: ${jobId}`,
    useRestartCommand:
      "Use /restart instead of sending that as a plain message.",
    slashSpaceError: ({ fixed }) =>
      joinLines([
        "Invalid command format: do not put spaces after `/`.",
        `Try: ${fixed}`
      ]),
    skillNotFound: ({ name }) => `Skill not found: ${name}`,
    processingFailed: ({ error }) => `Message handling failed: ${error}`,
    audioTranscriptionUnavailable:
      "Audio understanding is not configured yet. Set OPENAI_API_KEY or OPENROUTER_API_KEY in the bot environment to enable voice transcription.",
    audioTranscriptionStarted:
      "Received your audio. Transcribing it before sending it to Codex...",
    audioTranscriptPreview: ({ text }) =>
      joinLines(["I heard this from your audio:", text]),
    audioTranscriptionFailed: ({ error }) =>
      `Audio transcription failed: ${error}`,
    projectNameRequired: "Project name is required.",
    targetOutsideWorkspaceRoot: "Target path is outside WORKSPACE_ROOT.",
    projectDirDoesNotExist: ({ path }) =>
      `Project directory does not exist: ${path}`,
    targetNotGitRepository: ({ path }) =>
      `Target is not a git repository: ${path}`,
    noPreviousProject: "There is no previous project for this chat.",
    codexSessionExited: ({ mode, exitCode, signal }) =>
      `Codex session exited (mode=${mode}, code=${exitCode}, signal=${signal}).`,
    codexExecFailed: ({ error }) => `Codex exec failed: ${error}`,
    execFallbackResume:
      "Interactive terminal is unavailable here. Using fallback mode and resuming this project's context.",
    execFallbackSingle:
      "Interactive terminal is unavailable here. Using fallback mode for this request.",
    sessionRestored: ({ project, mode }) =>
      `Resumed Codex for ${project} (${mode}).`,
    sessionStarted: ({ mode }) => `Started Codex (${mode}).`,
    mcpServerNotConfigured:
      "No MCP servers are configured. Add server definitions to MCP_SERVERS in .env first.",
    mcpExplicitOnly:
      "Only explicit MCP commands are supported here. Use /mcp tools <server> or /mcp call <server> <tool> <jsonArgs>.",
    mcpHelp: () =>
      joinLines([
        "MCP command examples:",
        "/mcp list",
        "/mcp status [server]",
        "/mcp reconnect <server>",
        "/mcp enable <server>",
        "/mcp disable <server>",
        "/mcp tools <server>",
        '/mcp call <server> <tool> {"query":"hello"}'
      ]),
    mcpNoServers: "No MCP servers are configured.",
    mcpList: ({ servers }) =>
      joinLines([
        "MCP servers:",
        ...servers.map(
          (server: any) =>
            `- ${server.name}: ${server.enabled ? "enabled" : "disabled"}, ${server.connected ? "connected" : "disconnected"}`
        )
      ]),
    mcpUnknownServer: ({ name }) => `MCP server not found: ${name}`,
    mcpStatus: ({ servers }) =>
      servers
        .map((server: any) =>
          [
            `server: ${server.name}`,
            `enabled: ${server.enabled ? "yes" : "no"}`,
            `connected: ${server.connected ? "yes" : "no"}`,
            `command: ${server.command}`,
            `args: ${server.args.length ? server.args.join(" ") : "(none)"}`,
            `cwd: ${server.cwd}`
          ].join("\n")
        )
        .join("\n\n"),
    mcpUsageReconnect: "Usage: /mcp reconnect <server>",
    mcpReconnected: ({ result }) =>
      `${result.name} reconnected. enabled: ${result.enabled ? "yes" : "no"}, connected: ${result.connected ? "yes" : "no"}`,
    mcpUsageEnable: "Usage: /mcp enable <server>",
    mcpEnableResult: ({ result }) =>
      result.changed
        ? `${result.name} enabled. connected: ${result.connected ? "yes" : "no"}`
        : `${result.name} is already enabled. connected: ${result.connected ? "yes" : "no"}`,
    mcpUsageDisable: "Usage: /mcp disable <server>",
    mcpDisableResult: ({ result }) =>
      result.changed
        ? `${result.name} disabled. connected: ${result.connected ? "yes" : "no"}`
        : `${result.name} is already disabled. connected: ${result.connected ? "yes" : "no"}`,
    mcpUsageTools: "Usage: /mcp tools <server>",
    mcpNoTools: ({ server }) => `${server} has no available tools.`,
    mcpTools: ({ server, lines }) => joinLines([`${server} tools:`, ...lines]),
    mcpUsageCall: "Usage: /mcp call <server> <tool> <jsonArgs>",
    mcpJsonParseFailed: ({ error }) =>
      `Failed to parse JSON arguments: ${error}`,
    mcpUnknownSubcommand: ({ subcommand, suggested, supported }) =>
      suggested
        ? `Unknown MCP subcommand: ${subcommand}. Did you mean \`/mcp ${suggested}\`?`
        : `Unknown MCP subcommand: ${subcommand}. Supported: ${supported.join(", ")}.`,
    githubHelp: () =>
      joinLines([
        "GitHub Skill commands:",
        '/gh commit "feat: your message"',
        "/gh push",
        "/gh create repo my-new-repo",
        "/gh confirm",
        "/gh run tests",
        "/gh test status <jobId>"
      ]),
    githubExplicitWriteRequired: joinLines([
      "GitHub write actions are blocked in plain text.",
      "Use an explicit command instead:",
      '- /gh commit "feat: your message"',
      "- /gh push",
      "- /gh create repo my-new-repo"
    ]),
    githubWriteConfirmationRequired: ({ command }) =>
      joinLines([
        "This GitHub write action requires confirmation.",
        `Send: ${command}`
      ]),
    githubNoPendingConfirmation:
      "There is no pending GitHub write action to confirm.",
    githubNoChanges: "No changes detected. Commit skipped.",
    githubCommitAndPushSucceeded: ({ workdir, branch, message }) =>
      joinLines([
        "Commit and push succeeded.",
        `workdir: ${workdir}`,
        `branch: ${branch}`,
        `message: ${message}`
      ]),
    githubCommitSucceededPushFailed: ({ workdir, branch, message, error }) =>
      joinLines([
        "Commit succeeded, but push failed.",
        `workdir: ${workdir}`,
        `branch: ${branch}`,
        `message: ${message}`,
        `error: ${error}`
      ]),
    githubPushSucceeded: ({ workdir, branch }) =>
      joinLines([
        "Push succeeded.",
        `workdir: ${workdir}`,
        `branch: ${branch}`
      ]),
    githubMissingToken:
      "GITHUB_TOKEN is missing, so the GitHub API cannot create a repository.",
    githubRepoNameParseFailed:
      "Could not parse a repository name. Example: /gh create repo dex-agent-demo",
    githubRepoLocalPathExists: ({ path }) =>
      `A local directory already exists for that repository: ${path}`,
    githubRepoCreated: ({ workdir, relativeWorkdir, repo, url, branch }) =>
      joinLines([
        "Repository created and linked successfully.",
        `workdir: ${workdir}`,
        `current project: ${relativeWorkdir}`,
        `repo: ${repo}`,
        `url: ${url}`,
        `branch: ${branch}`,
        "Current chat has been switched to the new repository."
      ]),
    githubEmptyTestCommand:
      "E2E_TEST_COMMAND is empty, so no test job can be started.",
    githubTestsStarted: ({ jobId, workdir, command }) =>
      joinLines([
        "Automated test job started.",
        `jobId: ${jobId}`,
        `workdir: ${workdir}`,
        `command: ${command}`,
        "Use /gh test status <jobId> to query the result."
      ]),
    githubNoTestJobs:
      "No test jobs are available yet. Run /gh run tests first.",
    githubTestJobNotFound: ({ jobId }) => `Test job not found: ${jobId}`,
    githubTestStatus: ({ job }) =>
      joinLines([
        `jobId: ${job.jobId}`,
        `status: ${job.status}`,
        `workdir: ${job.workdir}`,
        `startedAt: ${job.startedAt}`,
        job.finishedAt
          ? `finishedAt: ${job.finishedAt}`
          : "finishedAt: running",
        job.exitCode === null
          ? "exitCode: running"
          : `exitCode: ${job.exitCode}`,
        "",
        "output tail:",
        job.output || "(no output yet)"
      ]),
    shellDisabled:
      "Restricted shell is not enabled. Set SHELL_ENABLED=true in .env first.",
    shellForbiddenSyntax:
      "Pipes, redirection, command substitution, and multi-command shell syntax are not supported.",
    shellCannotParse: "Failed to parse the command.",
    shellNotAllowlisted: ({ allowed }) =>
      `Command is not allowlisted. Allowed prefixes: ${allowed}`,
    shellReadonly:
      "The /sh channel is currently read-only. Write commands are blocked.",
    shellNeedsConfirmation: ({ command }) =>
      `This command requires confirmation. Send: ${command}`,
    memoryInboxTitle: "Memory inbox",
    memoryCandidatesCountLabel: "candidates",
    memoryProposalsCountLabel: "proposals",
    memoryRecentContextCountLabel: "recent context",
    memoryDurableCountLabel: "durable memory",
    memorySkillCandidateCountLabel: "skill candidates",
    memoryRecentCandidatesTitle: "Recent candidates",
    memoryRecentProposalsTitle: "Recent proposals",
    memoryInboxEmpty: "No pending memory candidates or proposals.",
    memoryInboxCandidatesTitle: "Inbox candidates",
    memoryCandidatesTitle: "Pending memory candidates",
    memoryNoPendingCandidates: "No pending candidates.",
    memoryInboxProposalsTitle: "Inbox proposals",
    memoryNoPendingProposals: "No pending memory proposals.",
    memorySummaryLabel: "summary",
    memoryInboxProposalTitle: "Proposal details",
    memoryCandidateDetailTitle: "Candidate details",
    memoryTypeLabel: "type",
    memoryKindLabel: "type",
    memoryStageLabel: "stage",
    memoryBaseKindLabel: "base type",
    memoryTitleLabel: "title",
    memoryReasonDefault: "No clear reason was recorded.",
    memoryWhyLabel: "why review this",
    memorySourceLabel: "source",
    memoryCapturedFromLabel: "captured from",
    memoryDestinationLabel: "suggested destination",
    memoryAutoPromoteLabel: "auto promotion",
    memoryPromotionProposalTitle: "Proposal ready for review",
    memoryProjectTitle: "Project memory",
    memoryNoRelevantProjectMemory: "No relevant project memory was found.",
    memoryObjectiveLabel: "objective",
    memoryLatestClosedBlockLabel: "latest closed block",
    memoryNextEligibleBlockLabel: "next eligible block",
    memoryConfidenceLabel: "confidence",
    memoryNotRecorded: "not recorded",
    memoryTacticalNotesTitle: "Tactical notes",
    memoryDurableMemoryTitle: "Durable memory",
    memorySourcesLabel: "sources",
    memoryEvidenceLabel: "evidence",
    memoryNone: "none",
    memoryUntitledCandidate: "Untitled candidate",
    memoryResumePromptTitle: "Project resumption prompt",
    memoryYes: "yes",
    memoryNo: "no",
    memoryDestinationMemory: "Memory only",
    memoryDestinationProjectSkill: "Project skill",
    memoryDestinationGlobalSkill: "Global skill",
    memoryDestinationReview: "Needs review",
    memoryStageRecentContext: "Recent context",
    memoryStageDurableMemory: "Durable memory",
    memoryStageSkillCandidate: "Skill candidate",
    memoryStageRealSkill: "Real skill",
    memoryKindSkillCandidate: "Skill candidate",
    memoryKindDecision: "Decision",
    memoryKindRule: "Rule",
    memoryKindProcedure: "Procedure",
    memoryKindException: "Exception",
    memoryKindFact: "Fact",
    memoryKindTaskState: "Task state",
    memoryReasonExplicitSkillRequest:
      "There was an explicit request to turn this into a reusable skill.",
    memoryReasonStrongSignals:
      "The signals are already strong enough to treat this as a reusable workflow.",
    memoryReasonWorkflowRepeated:
      "A similar workflow has already appeared before.",
    memoryReasonThreeSteps: "The workflow has three or more explicit steps.",
    memoryReasonOperationalReferences:
      "The workflow references commands, files, scripts, or operational contracts.",
    memoryReasonProjectSpecific:
      "The destination looks clearly specific to this project.",
    memoryReasonGlobalScope:
      "The destination appears reusable across multiple projects.",
    memoryReasonAutoPromoteStrong:
      "The signal is strong and clear enough for automatic promotion.",
    memoryReasonNeedsManualReview:
      "The workflow looks reusable, but it still needs manual review.",
    memoryReasonReuseSignalWeak:
      "The reuse signal is still too weak to promote automatically.",
    memoryReasonProcedureFlow:
      "It looks like a procedure or repeatable command flow.",
    memoryReasonDecisionLanguage:
      "The text carries explicit decision language.",
    memoryReasonRuleLanguage: "The text looks like a stable rule.",
    memoryReasonExceptionGuardrail:
      "The text describes an exception or guardrail.",
    memoryReasonTaskState: "The text describes active project state.",
    memoryReasonReusableFact:
      "The text looks like a useful fact with reusable project context.",
    memoryReasonExplicitClassification:
      "This item was explicitly classified by the caller.",
    memoryReasonRuntimeEvidence:
      "This item was captured from runtime evidence.",
    memoryReasonTextTooShort:
      "The text is still too short to become durable memory.",
    buttonMemoryPromote: ({ index }) => `Promote #${index}`,
    buttonMemoryWhy: ({ index }) => `Why #${index}`,
    buttonMemoryDismiss: ({ index }) => `Dismiss #${index}`,
    buttonMemoryConfirmWrite: "Confirm write",
    buttonMemoryCancel: "Cancel",
    buttonMemoryCandidates: "Candidates",
    buttonMemoryProposals: "Proposals",
    buttonMemoryActive: "ACTIVE",
    buttonMemoryHandoff: "HANDOFF",
    buttonMemoryIndex: "INDEX",
    buttonMemoryProject: "PROJECT",
    buttonMemoryInbox: "Inbox",
    buttonMemoryRefresh: "Refresh",
    buttonMemoryConfirm: ({ index }) => `Confirm #${index}`,
    buttonMemoryCancelIndexed: ({ index }) => `Cancel #${index}`
  },
  zh: {
    buttonRefreshTestStatus: "刷新测试状态",
    emptyResponse: "(空响应)",
    startLines: () => [
      "Dex Agent 已就绪。",
      "普通消息和编码任务会路由到 Codex。",
      "Bot 侧 MCP 仅通过显式 /mcp 命令调用。",
      "试试: /status, /repo, /pwd, /exec, /auto, /plan, /model, /language, /verbose, /skill, /new, /sh",
      'GitHub 示例: /gh commit "feat: init"'
    ],
    helpLines: () => [
      "命令列表:",
      "/help - 显示帮助",
      "/status - 查看当前 chat 的运行状态",
      "/pwd - 查看当前项目目录",
      "/repo - 列出可切换项目",
      "/repo <name> - 切换当前 chat 的项目",
      "/repo <keyword> - 关键词匹配项目并切换或列出候选",
      "/repo recent - 查看最近项目",
      "/repo - - 切回上一个项目",
      "/new - 清空当前项目保存的会话上下文",
      "/exec <task> - 强制执行一次性 Codex 任务，不保存项目上下文",
      "/auto <task> - 强制执行一次性全自动 Codex 任务",
      "/plan <task> - 仅生成计划，不直接修改文件",
      "/continue - 仅一次继续执行最近一次被同 workdir 冲突拦下的请求",
      "/model [name|reset] - 查看或设置当前 chat 模型",
      "/language [en|zh|zh-HK] - 查看或设置当前 chat 的系统语言",
      "/verbose [on|off] - 显示或隐藏系统提示",
      "/skill list - 查看当前 chat 的 skill 开关",
      "/skill status - 同 /skill list",
      "/skill on <name> - 启用 skill",
      "/skill off <name> - 禁用 skill",
      "/dev start|stop|status|logs|url - 管理当前项目的前端开发服务",
      "/sh <command> - 执行受限 Linux 命令（默认关闭）",
      "/sh --confirm <command> - 确认执行高风险命令",
      "/restart - 重启 bot 进程",
      "/interrupt - 中断当前 Codex 任务",
      "/stop - 终止当前 Codex 任务",
      "/cron_now - 立即触发日报",
      "/gh ... - GitHub skill",
      "/mcp ... - MCP 控制与显式工具调用"
    ],
    statusLines: ({
      status,
      recentProjects,
      shellSummary,
      skillsSummary,
      mcpSummary
    }) => [
      "状态:",
      `backend: ${status.backend}`,
      `active: ${status.active ? "yes" : "no"}`,
      `active mode: ${status.activeMode || "idle"}`,
      `last mode: ${status.lastMode || "none"}`,
      `last exit: ${status.lastExitCode === null ? "n/a" : status.lastExitCode}`,
      `pty supported: ${
        status.backend === "sdk"
          ? "n/a (sdk backend)"
          : status.ptySupported === null
            ? "unknown"
            : status.ptySupported
              ? "yes"
              : "no (exec fallback)"
      }`,
      `preferred model: ${status.preferredModel || "inherit codex default"}`,
      `language: ${status.language} (${languageLabel(status.language, "zh")})`,
      `verbose: ${status.verboseOutput ? "on" : "off"}`,
      `command: ${status.command}`,
      `workspace root: ${status.workspaceRoot}`,
      `workdir: ${status.workdir}`,
      `recent projects: ${recentProjects || "."}`,
      `project context: ${status.projectSessionId ? `可恢复 (${status.projectSessionId})` : "全新"}`,
      `workflow system: ${status.workflowSystem}（内部）`,
      `workflow phase: ${status.workflowPhase}`,
      `safe shell: ${shellSummary}`,
      `skills: ${skillsSummary}`,
      `mcp servers: ${mcpSummary}`
    ],
    pwdLines: ({ status, recent }) => [
      `workspace root: ${status.workspaceRoot}`,
      `current project: ${status.relativeWorkdir}`,
      `workdir: ${status.workdir}`,
      `recent: ${recent || "."}`
    ],
    repoList: ({ workspaceRoot, projectLines, recentLines }) =>
      joinLines([
        `workspace root: ${workspaceRoot}`,
        "可用项目:",
        ...(projectLines.length
          ? projectLines
          : ["- (workspace root 下未发现 git 仓库)"]),
        "",
        "最近项目:",
        ...(recentLines.length ? recentLines : ["- ."]),
        "",
        "用法: /repo <name> | /repo recent | /repo -"
      ]),
    repoRecent: ({ recentLines }) =>
      joinLines([
        "最近项目:",
        ...(recentLines.length ? recentLines : ["- ."]),
        "",
        "使用 /repo <name> 切换。"
      ]),
    repoNoMatch: ({ value }) => `没有匹配的项目: ${value}`,
    repoSuggestion: ({ value, suggestion }) =>
      joinLines([
        `没有匹配的项目: ${value}`,
        `你是不是想找: ${suggestion}`,
        `try: /repo ${suggestion}`
      ]),
    repoMultipleMatches: ({ value, projectLines }) =>
      joinLines([
        `找到多个匹配项目: ${value}`,
        ...projectLines,
        "",
        "请使用更精确的名称。"
      ]),
    repoSwitched: ({ relativePath, workdir }) =>
      joinLines([
        "项目已切换。",
        `active project: ${relativePath}`,
        `workdir: ${workdir}`
      ]),
    repoAlreadyCurrent: ({ relativePath, workdir }) =>
      joinLines([
        "The requested project is already active.",
        `active project: ${relativePath}`,
        `workdir: ${workdir}`
      ]),
    repoSwitchFailed: ({ error }) => `切换项目失败: ${error}`,
    skillList: ({ skillLines }) =>
      joinLines([
        "Skills:",
        ...skillLines,
        "内部工作流: superpowers（不能通过 /skill 开关）",
        "",
        "用法: /skill list | /skill on <name> | /skill off <name>"
      ]),
    skillUsage: "用法: /skill list | /skill on <name> | /skill off <name>",
    skillStateChanged: ({ name, enabled, changed, skillLines }) =>
      joinLines([
        changed
          ? `skill ${name} 已${enabled ? "启用" : "禁用"}。`
          : `skill ${name} 已处于${enabled ? "启用" : "禁用"}状态。`,
        ...skillLines
      ]),
    skillManagementFailed: ({ error }) => `Skill 管理失败: ${error}`,
    usageDev:
      "用法: /dev start | /dev stop | /dev status | /dev logs | /dev url",
    devStarted: ({ command, scriptName, relativeWorkdir }) =>
      joinLines([
        "前端开发服务已启动。",
        `project: ${relativeWorkdir}`,
        `script: ${scriptName}`,
        `command: ${command}`
      ]),
    devAlreadyRunning: ({ relativeWorkdir, startedByChatId, command }) =>
      joinLines([
        "这个仓库已经有一个前端开发服务在运行。",
        `project: ${relativeWorkdir}`,
        `started by chat: ${startedByChatId}`,
        `command: ${command}`
      ]),
    devNoPackageJson: ({ relativeWorkdir }) =>
      `当前仓库没有 package.json: ${relativeWorkdir}`,
    devNoScript: ({ relativeWorkdir, availableScripts }) =>
      joinLines([
        `当前仓库没有可用的前端启动脚本: ${relativeWorkdir}`,
        `available scripts: ${availableScripts}`
      ]),
    devSpawnFailed: ({ error }) => `启动前端开发服务失败: ${error}`,
    devStopped: ({ relativeWorkdir }) =>
      `已停止 ${relativeWorkdir} 的前端开发服务。`,
    devNotRunning: ({ relativeWorkdir }) =>
      `${relativeWorkdir} 当前没有前端开发服务在运行。`,
    devStatus: ({ devStatus, relativeWorkdir }) =>
      joinLines([
        "Frontend dev server:",
        `project: ${relativeWorkdir}`,
        `status: ${devStatus.status}`,
        `running: ${devStatus.running ? "yes" : "no"}`,
        `started by chat: ${devStatus.startedByChatId || "n/a"}`,
        `command: ${devStatus.command || "n/a"}`,
        `pid: ${devStatus.pid ?? "n/a"}`,
        `url: ${devStatus.detectedUrl || "not detected"}`
      ]),
    devLogs: ({ relativeWorkdir, logs }) =>
      joinLines([`Frontend dev logs for ${relativeWorkdir}:`, "", logs]),
    devUrl: ({ relativeWorkdir, url }) =>
      joinLines([`Frontend dev URL for ${relativeWorkdir}:`, url]),
    devNoUrl: ({ relativeWorkdir }) =>
      `${relativeWorkdir} 还没有识别到前端开发地址。请先查看 /dev logs。`,
    conversationReset: ({ closed }) =>
      closed
        ? "当前项目的会话上下文已清空，并关闭了活动会话。下一条消息会在当前项目启动全新 Codex 会话。"
        : "当前项目的会话上下文已清空。下一条消息会在当前项目启动全新 Codex 会话。",
    restartUnavailable: "当前环境未启用 bot 重启控制。",
    restarting: "正在重启 bot 进程...",
    usageExec: "用法: /exec <task>",
    usageSh: "用法: /sh <command>",
    usageAuto: "用法: /auto <task>",
    usagePlan: "用法: /plan <task>",
    usageVerbose: "用法: /verbose [on|off]",
    usageLanguage: "用法: /language [en|zh|zh-HK]",
    execNotice: "正在执行一次性 Codex 任务...",
    autoNotice: "正在执行一次性全自动 Codex 任务...",
    planNotice: "正在执行仅规划模式的 Codex 任务...",
    taskBusy: ({ mode }) =>
      `当前已有 ${mode || "unknown"} 任务在运行。请等待完成或先使用 /interrupt。`,
    operationalStatusHeader: "当前运行状态：",
    interruptWithQueueStatus: "执行已中断。当前队列状态：",
    workspaceContention: ({
      relativeWorkdir,
      mode,
      blockingChatId,
      continueCommand
    }) =>
      joinLines([
        `另一个 chat (${blockingChatId}) 已在同一个 workdir 中运行 Codex ${mode || "task"}: ${relativeWorkdir}。`,
        "在同一 workdir 再启动一个 Codex 任务可能产生冲突。",
        `如果你确认要继续，只执行一次请发送 ${continueCommand}。`
      ]),
    continueStarted: ({ mode }) => `已继续执行这条被拦下的请求一次 (${mode})。`,
    queueRunStarted: ({ mode }) =>
      `队列中的项目已发送给 Codex (${mode})。我会在这里继续显示进度。`,
    continueNothingPending: "当前 chat 没有待继续的被拦截请求。",
    codexBusyForShell:
      "当前有 Codex 任务正在运行。先等待完成，或使用 /interrupt 或 /new。",
    shellRequiresConfirmation: ({ command, confirmationCommand }) =>
      joinLines([
        "该命令被标记为高风险，需要二次确认。",
        `command: ${command}`,
        `confirm with: ${confirmationCommand}`
      ]),
    runningSafeShell: ({ workdir, command }) =>
      joinLines([
        "正在执行受限 shell 命令...",
        `workdir: ${workdir}`,
        `command: ${command}`
      ]),
    shellBusy: "当前 chat 已有一个 shell 命令在运行。",
    shellResult: ({ result }) =>
      joinLines([
        `shell status: ${result.status}`,
        `command: ${result.command}`,
        `workdir: ${result.workdir}`,
        `exitCode: ${result.exitCode === null ? "n/a" : result.exitCode}`,
        `signal: ${result.signal || "none"}`,
        "",
        "output:",
        result.output
      ]),
    shellCloneSucceeded: ({ relativePath, workdir, repoCommand }) =>
      joinLines([
        "仓库拉取完成。",
        `project: ${relativePath}`,
        `workdir: ${workdir}`,
        repoCommand
          ? `下一步: 使用 ${repoCommand} 切换到这个仓库`
          : "下一步: 使用 /repo <name> 切换到新仓库"
      ]),
    modelCurrent: ({ model }) =>
      `当前模型: ${model || "inherit codex default"}`,
    modelReset: ({ closed }) =>
      closed
        ? "模型已重置为 Codex 默认值，并重建了当前会话。"
        : "模型已重置为 Codex 默认值。",
    modelSet: ({ value, closed }) =>
      closed
        ? `模型已设置为 ${value}，并重建了当前会话。`
        : `模型已设置为 ${value}。`,
    verboseCurrent: ({ enabled }) =>
      `当前系统提示输出: ${enabled ? "on" : "off"}`,
    verboseSet: ({ enabled }) => `系统提示输出已${enabled ? "开启" : "关闭"}。`,
    languageCurrent: ({ language }) =>
      `当前语言: ${language} (${languageLabel(language, "zh")})`,
    languageSet: ({ language }) =>
      `语言已切换为 ${language} (${languageLabel(language, "zh")})。`,
    languageInvalid: "支持的语言: en, zh, zh-HK。",
    interruptResult: ({ ok }) =>
      ok ? "已中断当前 Codex 任务。" : "当前 chat 没有活动 Codex 任务。",
    stopResult: ({ ok }) =>
      ok ? "当前 Codex 任务已终止。" : "当前 chat 没有活动 Codex 任务。",
    cronTriggered: "日报已触发并推送。",
    triggerFailed: ({ error }) => `触发失败: ${error}`,
    githubDisabled:
      "GitHub skill 当前 chat 已禁用。使用 /skill on github 重新启用。",
    githubFailed: ({ error }) => `GitHub skill 执行失败: ${error}`,
    mcpDisabled: "MCP skill 当前 chat 已禁用。使用 /skill on mcp 重新启用。",
    mcpFailed: ({ error }) => `MCP skill 执行失败: ${error}`,
    callbackRefreshed: "状态已刷新",
    testJobNotFound: ({ jobId }) => `找不到测试任务: ${jobId}`,
    useRestartCommand: "请使用 /restart，而不是把它当作普通消息发送。",
    slashSpaceError: ({ fixed }) =>
      joinLines(["命令格式错误：`/` 后面不要加空格。", `try: ${fixed}`]),
    skillNotFound: ({ name }) => `未找到 skill: ${name}`,
    processingFailed: ({ error }) => `处理消息失败: ${error}`,
    projectNameRequired: "项目名不能为空。",
    targetOutsideWorkspaceRoot: "目标路径超出 WORKSPACE_ROOT。",
    projectDirDoesNotExist: ({ path }) => `项目目录不存在: ${path}`,
    targetNotGitRepository: ({ path }) => `目标不是 git 仓库: ${path}`,
    noPreviousProject: "当前 chat 没有可回退的上一个项目。",
    codexSessionExited: ({ mode, exitCode, signal }) =>
      `Codex session exited (mode=${mode}, code=${exitCode}, signal=${signal}).`,
    codexExecFailed: ({ error }) => `Codex exec 执行失败: ${error}`,
    execFallbackResume:
      "当前环境不支持交互终端，已切到回退模式并恢复当前项目上下文。",
    execFallbackSingle: "当前环境不支持交互终端，本次请求已切到回退模式。",
    sessionRestored: ({ project, mode }) =>
      `已恢复 ${project} 的 Codex 会话 (${mode})。`,
    sessionStarted: ({ mode }) => `Codex 会话已启动 (${mode})。`,
    mcpServerNotConfigured:
      "MCP server 未配置。请先在 .env 的 MCP_SERVERS 中添加服务定义。",
    mcpExplicitOnly:
      "当前仅支持显式 MCP 命令。请使用 /mcp tools <server> 或 /mcp call <server> <tool> <jsonArgs>。",
    mcpHelp: () =>
      joinLines([
        "MCP 指令示例：",
        "/mcp list",
        "/mcp status [server]",
        "/mcp reconnect <server>",
        "/mcp enable <server>",
        "/mcp disable <server>",
        "/mcp tools <server>",
        '/mcp call <server> <tool> {"query":"hello"}'
      ]),
    mcpNoServers: "没有配置 MCP server。",
    mcpList: ({ servers }) =>
      joinLines([
        "MCP servers:",
        ...servers.map(
          (server: any) =>
            `- ${server.name}: ${server.enabled ? "enabled" : "disabled"}, ${server.connected ? "connected" : "disconnected"}`
        )
      ]),
    mcpUnknownServer: ({ name }) => `找不到 MCP server: ${name}`,
    mcpStatus: ({ servers }) =>
      servers
        .map((server: any) =>
          [
            `server: ${server.name}`,
            `enabled: ${server.enabled ? "yes" : "no"}`,
            `connected: ${server.connected ? "yes" : "no"}`,
            `command: ${server.command}`,
            `args: ${server.args.length ? server.args.join(" ") : "(none)"}`,
            `cwd: ${server.cwd}`
          ].join("\n")
        )
        .join("\n\n"),
    mcpUsageReconnect: "用法: /mcp reconnect <server>",
    mcpReconnected: ({ result }) =>
      `${result.name} 已重连。enabled: ${result.enabled ? "yes" : "no"}, connected: ${result.connected ? "yes" : "no"}`,
    mcpUsageEnable: "用法: /mcp enable <server>",
    mcpEnableResult: ({ result }) =>
      result.changed
        ? `${result.name} 已启用。connected: ${result.connected ? "yes" : "no"}`
        : `${result.name} 已处于启用状态。connected: ${result.connected ? "yes" : "no"}`,
    mcpUsageDisable: "用法: /mcp disable <server>",
    mcpDisableResult: ({ result }) =>
      result.changed
        ? `${result.name} 已禁用。connected: ${result.connected ? "yes" : "no"}`
        : `${result.name} 已处于禁用状态。connected: ${result.connected ? "yes" : "no"}`,
    mcpUsageTools: "用法: /mcp tools <server>",
    mcpNoTools: ({ server }) => `${server} 没有可用工具。`,
    mcpTools: ({ server, lines }) => joinLines([`${server} tools:`, ...lines]),
    mcpUsageCall: "用法: /mcp call <server> <tool> <jsonArgs>",
    mcpJsonParseFailed: ({ error }) => `JSON 参数解析失败: ${error}`,
    mcpUnknownSubcommand: ({ subcommand, suggested, supported }) =>
      suggested
        ? `未知 MCP 子命令: ${subcommand}。你是不是想输入 \`/mcp ${suggested}\`?`
        : `未知 MCP 子命令: ${subcommand}。支持: ${supported.join(", ")}。`,
    githubHelp: () =>
      joinLines([
        "GitHub Skill commands:",
        '/gh commit "feat: your message"',
        "/gh push",
        "/gh create repo my-new-repo",
        "/gh confirm",
        "/gh run tests",
        "/gh test status <jobId>"
      ]),
    githubExplicitWriteRequired: joinLines([
      "普通文本里的 GitHub 写操作已被拦截。",
      "请改用显式命令：",
      '- /gh commit "feat: your message"',
      "- /gh push",
      "- /gh create repo my-new-repo"
    ]),
    githubWriteConfirmationRequired: ({ command }) =>
      joinLines(["这个 GitHub 写操作需要确认。", `发送：${command}`]),
    githubNoPendingConfirmation: "当前没有待确认的 GitHub 写操作。",
    githubNoChanges: "没有检测到变更，跳过 commit。",
    githubCommitAndPushSucceeded: ({ workdir, branch, message }) =>
      joinLines([
        "提交并推送成功。",
        `workdir: ${workdir}`,
        `branch: ${branch}`,
        `message: ${message}`
      ]),
    githubCommitSucceededPushFailed: ({ workdir, branch, message, error }) =>
      joinLines([
        "提交完成，但推送失败。",
        `workdir: ${workdir}`,
        `branch: ${branch}`,
        `message: ${message}`,
        `error: ${error}`
      ]),
    githubPushSucceeded: ({ workdir, branch }) =>
      joinLines(["推送成功。", `workdir: ${workdir}`, `branch: ${branch}`]),
    githubMissingToken: "缺少 GITHUB_TOKEN，无法调用 GitHub API 创建仓库。",
    githubRepoNameParseFailed:
      "无法解析仓库名。示例: /gh create repo dex-agent-demo",
    githubRepoLocalPathExists: ({ path }) =>
      `同名本地目录已存在，无法创建新仓库: ${path}`,
    githubRepoCreated: ({ workdir, relativeWorkdir, repo, url, branch }) =>
      joinLines([
        "仓库创建并关联成功。",
        `workdir: ${workdir}`,
        `current project: ${relativeWorkdir}`,
        `repo: ${repo}`,
        `url: ${url}`,
        `branch: ${branch}`,
        "当前 chat 已切换到新仓库。"
      ]),
    githubEmptyTestCommand: "E2E_TEST_COMMAND 为空，无法启动测试。",
    githubTestsStarted: ({ jobId, workdir, command }) =>
      joinLines([
        "已触发自动化测试任务。",
        `jobId: ${jobId}`,
        `workdir: ${workdir}`,
        `command: ${command}`,
        "使用 /gh test status <jobId> 查询状态。"
      ]),
    githubNoTestJobs: "没有可查询的测试任务。先执行 /gh run tests。",
    githubTestJobNotFound: ({ jobId }) => `找不到测试任务: ${jobId}`,
    githubTestStatus: ({ job }) =>
      joinLines([
        `jobId: ${job.jobId}`,
        `status: ${job.status}`,
        `workdir: ${job.workdir}`,
        `startedAt: ${job.startedAt}`,
        job.finishedAt
          ? `finishedAt: ${job.finishedAt}`
          : "finishedAt: running",
        job.exitCode === null
          ? "exitCode: running"
          : `exitCode: ${job.exitCode}`,
        "",
        "output tail:",
        job.output || "(no output yet)"
      ]),
    shellDisabled:
      "受限 Shell 功能未启用。先在 .env 中设置 SHELL_ENABLED=true。",
    shellForbiddenSyntax: "不支持管道、重定向、命令替换或多条 shell 语句。",
    shellCannotParse: "无法解析命令。",
    shellNotAllowlisted: ({ allowed }) =>
      `命令不在白名单中。允许前缀: ${allowed}`,
    shellReadonly: "当前 /sh 处于只读模式，禁止执行写操作命令。",
    shellNeedsConfirmation: ({ command }) =>
      `该命令需要二次确认。请发送: ${command}`
  },
  "zh-HK": {}
};

MESSAGES["pt-BR"] = {
  ...MESSAGES.en,
  instanceRepoSwitchBlocked: ({ project }) =>
    joinLines([
      "Esta instancia do Dex Agent e fixa em um projeto.",
      `projeto fixo: ${project}`,
      "Troca de repositorio esta bloqueada no modo instance."
    ]),
  startLines: () => [
    "Dex Agent pronto.",
    "Mensagens, áudios e tarefas de código vão para o Codex.",
    "MCP do bot só roda por comandos explícitos com /mcp.",
    "Use: /status, /repo, /pwd, /exec, /auto, /plan, /model, /language, /verbose, /skill, /new, /sh",
    'Exemplo GitHub: /gh commit "feat: init"'
  ],
  helpLines: () => [
    "Comandos:",
    "/help - Mostra a ajuda",
    "/status - Mostra o estado do runtime neste chat",
    "/pwd - Mostra o diretório atual do projeto",
    "/repo - Lista projetos disponíveis",
    "/repo <name> - Troca o projeto atual deste chat",
    "/repo <keyword> - Procura projeto por palavra-chave e troca ou lista candidatos",
    "/repo recent - Mostra projetos recentes deste chat",
    "/repo - - Volta para o projeto anterior",
    "/new - Limpa a conversa salva do projeto atual",
    "/exec <task> - Força uma execução isolada do Codex sem salvar contexto do projeto",
    "/auto <task> - Força uma execução isolada totalmente automática",
    "/plan <task> - Gera apenas um plano, sem intenção direta de editar arquivos",
    "/continue - Reenvia uma vez o último pedido bloqueado por conflito no mesmo workdir",
    "/queue [list|add|remove|clear|run] - Gerencia a fila de pedidos do chat",
    "/fila [listar|adicionar|remover|limpar|executar] - Alias de /queue",
    "/model [name|reset] - Consulta ou fixa o modelo deste chat",
    "/language [pt-BR|en|zh|zh-HK] - Consulta ou troca o idioma deste chat",
    "/verbose [on|off] - Mostra ou esconde avisos do sistema",
    "/skill list - Mostra os skills deste chat",
    "/skill status - Alias de /skill list",
    "/skill on <name> - Ativa um skill",
    "/skill off <name> - Desativa um skill",
    "/dev start|stop|status|logs|url - Controla o servidor de dev do projeto",
    "/sh <command> - Executa um comando Linux restrito",
    "/sh --confirm <command> - Confirma um comando shell de alto risco",
    "/restart - Reinicia o processo do bot",
    "/interrupt - Interrompe a execução atual do Codex",
    "/stop - Encerra a execução atual do Codex",
    "/cron_now - Dispara o resumo diário agora",
    "/gh ... - Skill do GitHub",
    "/mcp ... - Controle MCP e chamadas explícitas",
    "Áudios - são transcritos antes de seguir para o Codex"
  ],
  statusLines: ({
    status,
    recentProjects,
    shellSummary,
    skillsSummary,
    mcpSummary
  }) => [
    "Status:",
    `backend: ${status.backend}`,
    `situacao: ${status.active ? "trabalhando" : "parado"}`,
    `ativo: ${status.active ? "sim" : "nao"}`,
    `modo ativo: ${status.activeMode || "idle"}`,
    `ultimo modo: ${status.lastMode || "none"}`,
    `ultima saida: ${status.lastExitCode === null ? "n/a" : status.lastExitCode}`,
    `pty suportado: ${
      status.backend === "sdk"
        ? "n/a (backend sdk)"
        : status.ptySupported === null
          ? "desconhecido"
          : status.ptySupported
            ? "sim"
            : "nao (fallback exec)"
    }`,
    `modelo preferido: ${status.preferredModel || "herdar padrao do Codex"}`,
    `idioma: ${status.language} (${languageLabel(status.language, "pt-BR")})`,
    `avisos do sistema: ${status.verboseOutput ? "on" : "off"}`,
    `comando: ${status.command}`,
    `raiz do workspace: ${status.workspaceRoot}`,
    `workdir: ${status.workdir}`,
    `projetos recentes: ${recentProjects || "."}`,
    `contexto do projeto: ${status.projectSessionId ? `retomavel (${status.projectSessionId})` : "novo"}`,
    `sistema de workflow: ${status.workflowSystem} (interno)`,
    `fase do workflow: ${status.workflowPhase}`,
    `shell seguro: ${shellSummary}`,
    `skills: ${skillsSummary}`,
    `servidores MCP: ${mcpSummary}`
  ],
  statusObservabilityHeader: "observabilidade:",
  statusOperationalPosture: ({ value }) => `postura operacional: ${value}`,
  statusPostureWorking: "trabalhando agora",
  statusPosturePendingReplay: "aguardando replay aprovado",
  statusPostureQueued: "fila pendente",
  statusPostureAwaitingCloseout: "aguardando fechamento",
  statusPostureRecentFinish: "recem-finalizado",
  statusPostureProlongedSilence: "silencio prolongado",
  statusPostureIdle: "ocioso",
  statusPendingPromptSignal: ({ text }) => `replay pendente: ${text}`,
  statusQueueSignal: ({ count, next }) =>
    next
      ? `fila viva: ${count} pendente(s) (proximo: ${next})`
      : `fila viva: ${count} pendente(s)`,
  statusLastPromptSignal: ({ value }) => `ultimo pedido: ${value}`,
  statusLastFinalizedSignal: ({ value }) => `ultimo fechamento: ${value}`,
  statusLastFinalResponseSignal: ({ text }) => `ultima resposta final: ${text}`,
  usageLanguage: "Uso: /language [pt-BR|en|zh|zh-HK]",
  languageCurrent: ({ language }) =>
    `Idioma atual: ${language} (${languageLabel(language, "pt-BR")})`,
  languageSet: ({ language }) =>
    `Idioma alterado para ${language} (${languageLabel(language, "pt-BR")}).`,
  continueStarted: ({ mode }) =>
    `Retomando uma vez o pedido bloqueado (${mode}).`,
  startupReady: ({ relativeWorkdir }) =>
    joinLines([
      "Dex Agent iniciou e esta pronto.",
      `projeto atual: ${relativeWorkdir}`
    ]),
  restartReady: ({ relativeWorkdir }) =>
    joinLines([
      "Restart do bot concluido.",
      `projeto atual: ${relativeWorkdir}`,
      "Se voce enviou algum comando durante a janela de restart, envie de novo agora."
    ]),
  queueRunStarted: ({ mode }) =>
    `Item da fila enviado ao Codex (${mode}). Vou mostrar o andamento aqui.`,
  finalActionsOffer:
    "Como seguir daqui?\nCada botao envia uma acao especifica. Voce tambem pode responder com seu proprio texto.",
  buttonQuickExecute: "▶️ Executar proximo passo",
  buttonQuickReview: "🧠 Iniciar revisao",
  buttonQuickOrganize: "📥 Abrir inbox agora",
  buttonQuickExecuteRecommended: "✅ Executar proximo passo",
  buttonQuickReviewRecommended: "✅ Iniciar revisao",
  buttonQuickOrganizeRecommended: "✅ Abrir inbox agora",
  interruptResult: ({ ok }) =>
    ok
      ? "Interrompendo a execucao atual do Codex."
      : "Nao existe execucao ativa do Codex neste chat.",
  stopResult: ({ ok }) =>
    ok
      ? "A execucao ativa do Codex foi encerrada."
      : "Nao existe execucao ativa do Codex neste chat.",
  languageInvalid: "Idiomas suportados: pt-BR, en, zh, zh-HK.",
  callbackRefreshed: "Status atualizado",
  emptyResponse: "(resposta vazia)",
  memoryInboxTitle: "Inbox de memoria",
  memoryCandidatesCountLabel: "candidatos",
  memoryProposalsCountLabel: "propostas",
  memoryRecentContextCountLabel: "contexto recente",
  memoryDurableCountLabel: "memoria duravel",
  memorySkillCandidateCountLabel: "skill candidates",
  memoryRecentCandidatesTitle: "Candidatos recentes",
  memoryRecentProposalsTitle: "Propostas recentes",
  memoryInboxEmpty: "Nao ha candidatos ou propostas pendentes.",
  memoryInboxCandidatesTitle: "Candidatos da inbox",
  memoryCandidatesTitle: "Candidatos de memoria pendentes",
  memoryNoPendingCandidates: "Nao ha candidatos pendentes.",
  memoryInboxProposalsTitle: "Propostas da inbox",
  memoryNoPendingProposals: "Nao ha propostas pendentes.",
  memorySummaryLabel: "resumo",
  memoryInboxProposalTitle: "Detalhe da proposta",
  memoryCandidateDetailTitle: "Detalhe do candidato",
  memoryTypeLabel: "tipo",
  memoryKindLabel: "tipo",
  memoryStageLabel: "estagio",
  memoryBaseKindLabel: "tipo base",
  memoryTitleLabel: "titulo",
  memoryReasonDefault: "Nenhuma justificativa clara foi registrada.",
  memoryWhyLabel: "por que revisar isso",
  memorySourceLabel: "origem",
  memoryCapturedFromLabel: "capturado a partir de",
  memoryDestinationLabel: "destino sugerido",
  memoryAutoPromoteLabel: "promocao automatica",
  memoryPromotionProposalTitle: "Proposta pronta para revisar",
  memoryProjectTitle: "Memoria do projeto",
  memoryNoRelevantProjectMemory:
    "Nenhuma memoria relevante do projeto foi encontrada.",
  memoryObjectiveLabel: "objetivo",
  memoryLatestClosedBlockLabel: "ultimo bloco fechado",
  memoryNextEligibleBlockLabel: "proximo bloco elegivel",
  memoryConfidenceLabel: "confianca",
  memoryNotRecorded: "nao registrado",
  memoryTacticalNotesTitle: "Notas taticas",
  memoryDurableMemoryTitle: "Memoria duravel",
  memorySourcesLabel: "fontes",
  memoryEvidenceLabel: "evidencia",
  memoryNone: "nenhum",
  memoryUntitledCandidate: "Candidato sem titulo",
  memoryResumePromptTitle: "Prompt de retomada do projeto",
  memoryYes: "sim",
  memoryNo: "nao",
  memoryDestinationMemory: "Memoria apenas",
  memoryDestinationProjectSkill: "Skill do projeto",
  memoryDestinationGlobalSkill: "Skill global",
  memoryDestinationReview: "Precisa de revisao",
  memoryStageRecentContext: "Contexto recente",
  memoryStageDurableMemory: "Memoria duravel",
  memoryStageSkillCandidate: "Skill candidata",
  memoryStageRealSkill: "Skill real",
  memoryKindSkillCandidate: "Skill candidata",
  memoryKindDecision: "Decisao",
  memoryKindRule: "Regra",
  memoryKindProcedure: "Procedimento",
  memoryKindException: "Excecao",
  memoryKindFact: "Fato",
  memoryKindTaskState: "Estado da tarefa",
  memoryReasonExplicitSkillRequest:
    "Houve um pedido explicito para transformar isso em skill reutilizavel.",
  memoryReasonStrongSignals:
    "Os sinais ja sao fortes o bastante para tratar isso como fluxo reutilizavel.",
  memoryReasonWorkflowRepeated: "Um fluxo semelhante ja apareceu antes.",
  memoryReasonThreeSteps: "O fluxo tem tres ou mais passos explicitos.",
  memoryReasonOperationalReferences:
    "O fluxo referencia comandos, arquivos, scripts ou contratos operacionais.",
  memoryReasonProjectSpecific:
    "O destino parece claramente especifico deste projeto.",
  memoryReasonGlobalScope:
    "O destino parece reutilizavel em mais de um projeto.",
  memoryReasonAutoPromoteStrong:
    "O sinal esta forte e claro o bastante para promocao automatica.",
  memoryReasonNeedsManualReview:
    "O fluxo parece reutilizavel, mas ainda precisa de revisao manual.",
  memoryReasonReuseSignalWeak:
    "O sinal de reuso ainda esta fraco para promover automaticamente.",
  memoryReasonProcedureFlow:
    "Isso parece um procedimento ou fluxo de comando repetivel.",
  memoryReasonDecisionLanguage: "O texto carrega linguagem clara de decisao.",
  memoryReasonRuleLanguage: "O texto parece uma regra estavel.",
  memoryReasonExceptionGuardrail: "O texto descreve uma excecao ou guardrail.",
  memoryReasonTaskState: "O texto descreve estado ativo do projeto.",
  memoryReasonReusableFact:
    "O texto parece um fato util com contexto reutilizavel do projeto.",
  memoryReasonExplicitClassification:
    "Este item foi classificado explicitamente por quem chamou.",
  memoryReasonRuntimeEvidence:
    "Este item foi capturado a partir de evidencia do runtime.",
  memoryReasonTextTooShort:
    "O texto ainda esta curto demais para virar memoria duravel.",
  buttonMemoryPromote: ({ index }) => `Promover #${index}`,
  buttonMemoryWhy: ({ index }) => `Motivo #${index}`,
  buttonMemoryDismiss: ({ index }) => `Descartar #${index}`,
  buttonMemoryConfirmWrite: "Confirmar escrita",
  buttonMemoryCancel: "Cancelar",
  buttonMemoryCandidates: "Candidatos",
  buttonMemoryProposals: "Propostas",
  buttonMemoryActive: "ACTIVE",
  buttonMemoryHandoff: "HANDOFF",
  buttonMemoryIndex: "INDEX",
  buttonMemoryProject: "PROJECT",
  buttonMemoryInbox: "Inbox",
  buttonMemoryRefresh: "Atualizar",
  buttonMemoryConfirm: ({ index }) => `Confirmar #${index}`,
  buttonMemoryCancelIndexed: ({ index }) => `Cancelar #${index}`
};

type ArrayMessageKey = "startLines" | "helpLines" | "statusLines" | "pwdLines";

export function normalizeLanguage(value = ""): Locale | "" {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_LANGUAGE;
  const lower = raw.toLowerCase();
  if (lower === "pt" || lower === "pt-br" || lower === "pt_br") return "pt-BR";
  if (lower === "en") return "en";
  if (lower === "zh") return "zh";
  if (lower === "zh-hk" || lower === "zh_hk") return "zh-HK";
  return "";
}

export function languageLabel(
  language: string,
  locale: string = DEFAULT_LANGUAGE
): string {
  const resolvedLocale = normalizeLanguage(locale) || DEFAULT_LANGUAGE;
  const resolvedLanguage = normalizeLanguage(language) || DEFAULT_LANGUAGE;
  return (
    LANGUAGE_LABELS[resolvedLocale]?.[resolvedLanguage] ||
    LANGUAGE_LABELS.zh?.[resolvedLanguage] ||
    LANGUAGE_LABELS.en[resolvedLanguage]
  );
}

export const t: TranslateFn = ((
  locale: string,
  key: string,
  params: TranslationParams = {}
): string | string[] => {
  const resolvedLocale = normalizeLanguage(locale) || DEFAULT_LANGUAGE;
  const catalogs = [
    MESSAGES[resolvedLocale],
    resolvedLocale === "pt-BR" ? MESSAGES.en : null,
    resolvedLocale === "zh-HK" ? MESSAGES.zh : null,
    MESSAGES.en
  ].filter((catalog): catalog is TranslationCatalog => Boolean(catalog));

  for (const catalog of catalogs) {
    if (!(key in catalog)) continue;
    const entry = catalog[key];
    return typeof entry === "function" ? entry(params) : entry;
  }

  throw new Error(`Missing i18n message: ${key}`);
}) as TranslateFn;
