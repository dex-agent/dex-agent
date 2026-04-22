import fs from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import process from "node:process";
import {
  Codex,
  type CodexOptions,
  type Input,
  type ThreadEvent,
  type ThreadItem,
  type ThreadOptions as CodexThreadOptions
} from "@openai/codex-sdk";
import pty from "node-pty";
import throttle from "lodash.throttle";
import stripAnsi from "strip-ansi";
import type { AppConfig } from "../config.js";
import {
  escapeMarkdownV2,
  extractCodexExecResponse,
  formatPtyOutput,
  sanitizeTelegramFacingCodexText,
  splitTelegramMessage
} from "../bot/formatter.js";
import { normalizeLanguage, t, type Locale } from "../bot/i18n.js";
import { toErrorMessage } from "../lib/errors.js";
import { repairNodePtySpawnHelperPermissions } from "./ptyPreflight.js";
type SessionMode = "pty" | "exec" | "sdk";
type ExitSignal = number | NodeJS.Signals | null;
type PromptInput = Input;
type SerializablePromptInput =
  | string
  | Array<
      | {
          type: "text";
          text: string;
        }
      | {
          type: "local_image";
          path: string;
        }
    >;
type WorkflowPhase =
  | "brainstorming"
  | "planning"
  | "implementing"
  | "verifying";

interface PtyProcess {
  write(input: string): void;
  kill(): void;
  onData(listener: (chunk: string) => void): void;
  onExit(listener: (event: { exitCode: number; signal: number }) => void): void;
}

interface TelegramMessage {
  message_id: number;
}

interface TelegramApiLike {
  sendMessage(
    chatId: string | number,
    text: string,
    options?: Record<string, unknown>
  ): Promise<TelegramMessage>;
  editMessageText(
    chatId: string | number,
    messageId: number,
    inlineMessageId: string | undefined,
    text: string,
    options?: Record<string, unknown>
  ): Promise<unknown>;
  deleteMessage(chatId: string | number, messageId: number): Promise<unknown>;
}

interface BotLike {
  telegram: TelegramApiLike;
}

interface CodexThreadLike {
  id: string | null;
  runStreamed(
    input: PromptInput,
    options?: {
      signal?: AbortSignal;
    }
  ): Promise<{
    events: AsyncGenerator<ThreadEvent>;
  }>;
}

interface CodexClientLike {
  startThread(options?: CodexThreadOptions): CodexThreadLike;
  resumeThread(id: string, options?: CodexThreadOptions): CodexThreadLike;
}

interface ProjectConversationState {
  lastSessionId: string;
  lastMode: SessionMode | null;
  lastExitCode: number | null;
  lastExitSignal: ExitSignal;
  lastWorkflowPhase: WorkflowPhase | null;
  lastPromptText: string | null;
  lastPromptAt: string | null;
  lastFinalResponseText: string | null;
  lastFinalizedAt: string | null;
}

interface ChatRuntimeState {
  preferredModel: string | null;
  language: Locale;
  verboseOutput: boolean;
  currentWorkdir: string;
  recentWorkdirs: string[];
  ptySupported: boolean | null;
  pendingPrompt: PendingPromptRequest | null;
  promptQueue: QueuedPromptRequest[];
  projectStates: Map<string, ProjectConversationState>;
}

interface RunnerSession {
  chatId: string;
  mode: SessionMode;
  workdir: string;
  model: string | null;
  sessionId: string;
  trackConversation: boolean;
  proc: PtyProcess | ChildProcessWithoutNullStreams | null;
  thread: CodexThreadLike | null;
  abortController: AbortController | null;
  renderableItems: Map<string, string>;
  renderableItemOrder: string[];
  rawBuffer: string;
  streamMessageIds: number[];
  lastRendered: string;
  flushQueue: Promise<void>;
  throttledFlush: ReturnType<typeof throttle>;
  silentOutput: boolean;
  finalResponseText: string;
  cleanupPaths: string[];
  write: ((input: string) => void) | null;
  interrupt: (() => void) | null;
  close: (() => void) | null;
  workflowPhase: WorkflowPhase | null;
}

interface SessionOptions {
  workdir?: string;
  resumeSessionId?: string;
  initialPrompt?: string;
  fullAuto?: boolean;
  extraArgs?: string[];
  trackConversation?: boolean;
  silentOutput?: boolean;
  cleanupPaths?: string[];
}

interface SendPromptOptions {
  forceExec?: boolean;
  fullAuto?: boolean;
  extraArgs?: string[];
  notice?: string;
  allowWorkspaceConflict?: boolean;
  silentOutput?: boolean;
  cleanupPaths?: string[];
  queueOnBusy?: boolean;
}

interface SendPromptContext {
  chat: {
    id: string | number;
  };
}

interface PendingPromptRequest {
  prompt: PromptInput;
  workdir: string;
  options: SendPromptOptions;
  blockingChatId: string;
}

interface QueuedPromptRequest {
  id: string;
  prompt: PromptInput;
  workdir: string;
  options: SendPromptOptions;
  createdAt: string;
}

interface SendPromptStartedResult {
  started: true;
  mode: SessionMode;
  fallback?: boolean;
  resumed?: boolean;
}

interface SendPromptBusyResult {
  started: false;
  reason: "busy";
  activeMode: SessionMode;
}

interface SendPromptQueuedResult {
  started: false;
  reason: "queued";
  activeMode: SessionMode;
  queueLength: number;
  item: PromptQueueItemSummary;
}

interface SendPromptWorkspaceBusyResult {
  started: false;
  reason: "workspace_busy";
  activeMode: SessionMode;
  blockingChatId: string;
  relativeWorkdir: string;
}

interface NoPendingPromptResult {
  started: false;
  reason: "no_pending_prompt";
}

export type SendPromptResult =
  | SendPromptStartedResult
  | SendPromptBusyResult
  | SendPromptQueuedResult
  | SendPromptWorkspaceBusyResult;

export type ContinuePendingPromptResult =
  | SendPromptStartedResult
  | SendPromptBusyResult
  | NoPendingPromptResult;

interface StoredProjectConversationState {
  lastSessionId?: unknown;
  lastMode?: unknown;
  lastExitCode?: unknown;
  lastExitSignal?: unknown;
  lastWorkflowPhase?: unknown;
  lastPromptText?: unknown;
  lastPromptAt?: unknown;
  lastFinalResponseText?: unknown;
  lastFinalizedAt?: unknown;
}

interface StoredChatRuntimeState {
  preferredModel?: unknown;
  language?: unknown;
  verboseOutput?: unknown;
  currentWorkdir?: unknown;
  recentWorkdirs?: unknown;
  promptQueue?: unknown;
  projects?: Record<string, StoredProjectConversationState>;
}

export interface PtyManagerSnapshot {
  chats: Record<
    string,
    {
      preferredModel: string | null;
      language: Locale;
      verboseOutput: boolean;
      currentWorkdir: string;
      recentWorkdirs: string[];
      promptQueue?: StoredQueuedPromptRequest[];
      projects: Record<
        string,
        {
          lastSessionId: string;
          lastMode: SessionMode | null;
          lastExitCode: number | null;
          lastExitSignal: ExitSignal;
          lastWorkflowPhase: WorkflowPhase | null;
          lastPromptText: string | null;
          lastPromptAt: string | null;
          lastFinalResponseText: string | null;
          lastFinalizedAt: string | null;
        }
      >;
    }
  >;
}

export interface PtyManagerStatus {
  backend: AppConfig["runner"]["backend"];
  active: boolean;
  activeMode: SessionMode | null;
  lastMode: SessionMode | null;
  lastExitCode: number | null;
  lastExitSignal: ExitSignal;
  projectSessionId: string | null;
  preferredModel: string | null;
  language: Locale;
  verboseOutput: boolean;
  ptySupported: boolean | null;
  workdir: string;
  relativeWorkdir: string;
  workspaceRoot: string;
  command: string;
  mcpServers: string[];
  workflowSystem: "superpowers";
  workflowPhase: WorkflowPhase | "working" | "none";
}

export interface OperationalContinuationState {
  active: boolean;
  activeMode: SessionMode | null;
  workflowPhase: WorkflowPhase | "working" | "none";
  workdir: string;
  relativeWorkdir: string;
  pendingPromptText: string | null;
  queuedItems: PromptQueueItemSummary[];
  lastPromptText: string | null;
  lastPromptAt: string | null;
  lastFinalResponseText: string | null;
  lastFinalizedAt: string | null;
}

interface StoredQueuedPromptRequest {
  id: string;
  prompt: SerializablePromptInput;
  workdir: string;
  options: SendPromptOptions;
  createdAt: string;
}

export interface PromptQueueItemSummary {
  id: string;
  index: number;
  text: string;
  workdir: string;
  relativeWorkdir: string;
  createdAt: string;
}

export interface RecoverableQueuedChatSummary {
  chatId: string;
  queueLength: number;
  workdir: string;
  relativeWorkdir: string;
  nextItem: PromptQueueItemSummary;
}

export interface QueueMutationResult {
  ok: boolean;
  item?: PromptQueueItemSummary;
  removed?: PromptQueueItemSummary;
  count?: number;
  reason?: "not_found" | "empty" | "busy" | "full" | "unserializable";
}

interface PtyManagerOptions {
  bot: BotLike;
  config: Pick<AppConfig, "runner" | "workspace" | "reasoning" | "mcp">;
  onChange?: (snapshot: PtyManagerSnapshot) => void;
  onResponseFinalized?: (payload: {
    chatId: string;
    text: string;
    promptText: string | null;
    mode: SessionMode;
    workdir: string;
    exitCode: number | null;
    signal: ExitSignal;
  }) => Promise<void>;
  codexClientFactory?: (options: CodexOptions) => CodexClientLike;
}

function isMessageNotModified(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { description?: unknown; message?: unknown };
  return String(candidate.description || candidate.message || "").includes(
    "message is not modified"
  );
}

function isPtySpawnFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { message?: unknown };
  return String(candidate.message || "").includes("posix_spawnp failed");
}

function extractSessionId(rawText: string): string {
  const matched = String(rawText || "").match(/session id:\s*([0-9a-f-]{36})/i);
  return matched?.[1] || "";
}

const MAX_PROMPT_QUEUE_SIZE = 10;
const INTERRUPT_FORCE_CLOSE_MS = 2000;

function createQueueId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeProjectQuery(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreProjectQueryMatch(
  project: { name: string; relativePath: string },
  query: string
): number {
  const normalizedQuery = normalizeProjectQuery(query);
  if (!normalizedQuery) {
    return 0;
  }

  const collapsedQuery = normalizedQuery.replace(/\s+/g, "");
  const candidates = [project.name, project.relativePath].map((value) =>
    normalizeProjectQuery(value)
  );

  let score = 0;
  if (candidates.some((value) => value === normalizedQuery)) {
    score += 10;
  }
  if (
    candidates.some((value) => value.replace(/\s+/g, "") === collapsedQuery)
  ) {
    score += 8;
  }
  if (candidates.some((value) => value.includes(normalizedQuery))) {
    score += 6;
  }
  if (
    candidates.some((value) =>
      value.replace(/\s+/g, "").includes(collapsedQuery)
    )
  ) {
    score += 5;
  }

  for (const token of normalizedQuery.split(/\s+/).filter(Boolean)) {
    if (candidates.some((value) => value.includes(token))) {
      score += 1;
    }
  }

  return score;
}

function clonePromptOptionsForQueue(
  options: SendPromptOptions
): SendPromptOptions {
  const replayOptions: SendPromptOptions = {};

  if (options.forceExec) {
    replayOptions.forceExec = true;
  }
  if (options.fullAuto) {
    replayOptions.fullAuto = true;
  }
  if (options.extraArgs?.length) {
    replayOptions.extraArgs = [...options.extraArgs];
  }
  if (options.notice) {
    replayOptions.notice = options.notice;
  }
  if (options.silentOutput) {
    replayOptions.silentOutput = true;
  }
  if (options.cleanupPaths?.length) {
    replayOptions.cleanupPaths = [...options.cleanupPaths];
  }

  return replayOptions;
}

function isLocale(value: string): value is Locale {
  return (
    value === "pt-BR" || value === "en" || value === "zh" || value === "zh-HK"
  );
}

function toLocale(value: string): Locale {
  return isLocale(value) ? value : "pt-BR";
}

function extractUserRequestFromMemoryPacket(text: string): string | null {
  const source = String(text || "").trim();
  if (!source.startsWith("Authoritative project memory packet:")) {
    return null;
  }

  const marker = "\nUser request:\n";
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const extracted = source.slice(markerIndex + marker.length).trim();
  return extracted || null;
}

function extractUserRequestFromReusePacket(text: string): string | null {
  const source = String(text || "").trim();
  if (!source.startsWith("Project skills available for direct reuse:")) {
    return null;
  }

  const marker = "\nRequest:\n";
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const extracted = source.slice(markerIndex + marker.length).trim();
  return extracted || null;
}

function normalizeDeferredPromptInput(prompt: PromptInput): PromptInput {
  if (typeof prompt !== "string") {
    return prompt;
  }

  return (
    extractUserRequestFromMemoryPacket(prompt) ||
    extractUserRequestFromReusePacket(prompt) ||
    prompt
  );
}

function toPromptSnapshotText(prompt: PromptInput): string {
  if (typeof prompt === "string") {
    return prompt.replace(/\s+/g, " ").trim();
  }

  return prompt
    .map((item) =>
      item.type === "text"
        ? item.text
        : `Analyze the attached local image at: ${item.path}`
    )
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSnapshotText(
  value: string | null | undefined,
  limit = 1200
): string | null {
  const compact = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!compact) {
    return null;
  }

  return compact.length <= limit
    ? compact
    : `${compact.slice(0, limit - 3).trimEnd()}...`;
}

function summarizeOperationalResultSnapshot(
  value: string | null | undefined,
  limit = 420
): string | null {
  const lines = String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const normalized = line
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase();
      return !/^(validacao|validation|o que sobra depois|what remains|fontes|sources|logs?)\s*:?$/i.test(
        normalized
      );
    });

  if (!lines.length) {
    return null;
  }

  const summary = lines.slice(0, 4).join(" ");
  return compactSnapshotText(summary, limit);
}

function isWorkflowPhase(value: unknown): value is WorkflowPhase {
  return (
    value === "brainstorming" ||
    value === "planning" ||
    value === "implementing" ||
    value === "verifying"
  );
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { name?: unknown; message?: unknown };
  const name = String(candidate.name || "");
  const message = String(candidate.message || "");
  return name === "AbortError" || /aborted/i.test(message);
}

function summarizeSdkItem(item: ThreadItem, verbose: boolean): string | null {
  switch (item.type) {
    case "agent_message":
      return item.text?.trim() ? item.text : null;
    case "reasoning":
      return item.text?.trim() ? `<think>${item.text}</think>` : null;
    case "error":
      return item.message?.trim() ? `[error] ${item.message}` : null;
    case "command_execution":
      return verbose && item.command ? `[command] ${item.command}` : null;
    case "mcp_tool_call":
      return verbose
        ? `[mcp] ${item.server}/${item.tool} (${item.status})`
        : null;
    case "web_search":
      return verbose ? `[web] ${item.query}` : null;
    case "todo_list":
      return verbose && item.items.length
        ? item.items
            .map((entry) => `- [${entry.completed ? "x" : " "}] ${entry.text}`)
            .join("\n")
        : null;
    case "file_change":
      return verbose && item.changes.length
        ? `[files] ${item.changes.map((change) => `${change.kind}:${change.path}`).join(", ")}`
        : null;
    default:
      return null;
  }
}

const WORKFLOW_PHASE_MARKERS: ReadonlyArray<{
  phase: WorkflowPhase;
  markers: readonly string[];
}> = [
  {
    phase: "brainstorming",
    markers: [
      "using `brainstorming`",
      "brainstorming gate",
      "offer visual companion",
      "ask one clarifying question",
      "propose 2-3 approaches",
      "present design and get approval"
    ]
  },
  {
    phase: "planning",
    markers: [
      "implementation plan",
      "plan complete",
      "write the implementation plan",
      "writing the implementation plan",
      "moving into implementation planning",
      "implementation steps"
    ]
  },
  {
    phase: "implementing",
    markers: [
      "moving into file edits",
      "i'm implementing",
      "i’m implementing",
      "i'm adding",
      "i’m adding",
      "[files]",
      "apply_patch"
    ]
  },
  {
    phase: "verifying",
    markers: [
      "verification-before-completion",
      "running validation",
      "full verification",
      "fresh verification",
      "final verification",
      "all green",
      "all passed"
    ]
  }
];

function detectWorkflowPhase(rawText: string): WorkflowPhase | null {
  const normalized = String(rawText || "").toLowerCase();
  if (!normalized) {
    return null;
  }

  let bestMatch: { phase: WorkflowPhase; index: number } | null = null;

  for (const entry of WORKFLOW_PHASE_MARKERS) {
    for (const marker of entry.markers) {
      const index = normalized.lastIndexOf(marker);
      if (index === -1) {
        continue;
      }

      if (!bestMatch || index >= bestMatch.index) {
        bestMatch = {
          phase: entry.phase,
          index
        };
      }
    }
  }

  return bestMatch?.phase || null;
}

export class PtyManager {
  readonly bot: BotLike;
  readonly config: Pick<
    AppConfig,
    "runner" | "workspace" | "reasoning" | "mcp"
  >;
  readonly sessions: Map<string, RunnerSession>;
  readonly chatState: Map<string, ChatRuntimeState>;
  readonly ptyPreflight: {
    path: string;
    changed: boolean;
    executable: boolean;
    error?: string;
  };
  private readonly codexClientFactory: (
    options: CodexOptions
  ) => CodexClientLike;
  private codexClient: CodexClientLike | null;
  private readonly onChange?: (snapshot: PtyManagerSnapshot) => void;
  private readonly onResponseFinalized?: PtyManagerOptions["onResponseFinalized"];

  constructor({
    bot,
    config,
    onChange,
    onResponseFinalized,
    codexClientFactory
  }: PtyManagerOptions) {
    this.bot = bot;
    this.config = config;
    this.onChange = onChange;
    this.codexClientFactory =
      codexClientFactory ??
      ((options: CodexOptions) =>
        new Codex(options) as unknown as CodexClientLike);
    this.codexClient = null;
    this.sessions = new Map();
    this.chatState = new Map();
    this.ptyPreflight = repairNodePtySpawnHelperPermissions();
    this.onResponseFinalized = onResponseFinalized;

    if (this.ptyPreflight.error) {
      console.warn(
        `[runner] node-pty preflight failed: ${this.ptyPreflight.error}`
      );
    } else if (this.ptyPreflight.changed) {
      console.info(
        `[runner] repaired node-pty helper permissions: ${this.ptyPreflight.path}`
      );
    }
  }

  ensureChatState(chatId: string | number): ChatRuntimeState {
    const key = String(chatId);
    const existing = this.chatState.get(key);
    if (existing) return existing;

    const state: ChatRuntimeState = {
      preferredModel: null,
      language: "pt-BR",
      verboseOutput: false,
      currentWorkdir: this.config.runner.cwd,
      recentWorkdirs: [this.config.runner.cwd],
      ptySupported: null,
      pendingPrompt: null,
      promptQueue: [],
      projectStates: new Map([
        [
          this.config.runner.cwd,
          {
            lastSessionId: "",
            lastMode: null,
            lastExitCode: null,
            lastExitSignal: null,
            lastWorkflowPhase: null,
            lastPromptText: null,
            lastPromptAt: null,
            lastFinalResponseText: null,
            lastFinalizedAt: null
          }
        ]
      ])
    };

    this.chatState.set(key, state);
    return state;
  }

  ensureProjectState(
    chatId: string | number,
    workdir = this.getWorkdir(chatId)
  ): ProjectConversationState {
    const key = String(chatId);
    const state = this.ensureChatState(key);
    const resolvedWorkdir = path.resolve(
      workdir || state.currentWorkdir || this.config.runner.cwd
    );
    const existing = state.projectStates.get(resolvedWorkdir);
    if (existing) return existing;

    const projectState: ProjectConversationState = {
      lastSessionId: "",
      lastMode: null,
      lastExitCode: null,
      lastExitSignal: null,
      lastWorkflowPhase: null,
      lastPromptText: null,
      lastPromptAt: null,
      lastFinalResponseText: null,
      lastFinalizedAt: null
    };

    state.projectStates.set(resolvedWorkdir, projectState);
    return projectState;
  }

  getCommandArgsForSession(chatId: string | number): string[] {
    const state = this.ensureChatState(chatId);
    const args = [...this.config.runner.args];
    if (state.preferredModel) {
      args.push("-m", state.preferredModel);
    }
    return args;
  }

  getCodexClient(): CodexClientLike {
    if (this.codexClient) {
      return this.codexClient;
    }

    const childEnv = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined
      )
    );
    delete childEnv.CODEX_API_KEY;
    delete childEnv.OPENAI_API_KEY;
    delete childEnv.OPENAI_BASE_URL;
    delete childEnv.OPENROUTER_API_KEY;
    delete childEnv.OPENROUTER_APP_TITLE;

    if (this.config.runner.apiKey) {
      childEnv.CODEX_API_KEY = this.config.runner.apiKey;
      childEnv.OPENAI_API_KEY = this.config.runner.apiKey;
      childEnv.OPENROUTER_API_KEY = this.config.runner.apiKey;
    }

    if (this.config.runner.baseUrl) {
      childEnv.OPENAI_BASE_URL = this.config.runner.baseUrl;
    }

    const options: CodexOptions = {
      config: this.config.runner.sdkConfig,
      env: childEnv
    };

    if (this.config.runner.command !== "codex") {
      options.codexPathOverride = this.config.runner.command;
    }

    if (this.config.runner.baseUrl) {
      options.baseUrl = this.config.runner.baseUrl;
    }

    if (this.config.runner.apiKey) {
      options.apiKey = this.config.runner.apiKey;
    }

    this.codexClient = this.codexClientFactory(options);
    return this.codexClient;
  }

  getSdkThreadOptions(
    chatId: string | number,
    workdir: string,
    overrides: Partial<CodexThreadOptions> = {}
  ): CodexThreadOptions {
    const state = this.ensureChatState(chatId);
    const baseOptions = this.config.runner.sdkThreadOptions;
    const threadOptions: CodexThreadOptions = {
      workingDirectory: workdir,
      skipGitRepoCheck: baseOptions.skipGitRepoCheck,
      additionalDirectories: [...baseOptions.additionalDirectories]
    };

    if (baseOptions.sandboxMode) {
      threadOptions.sandboxMode = baseOptions.sandboxMode;
    }
    if (baseOptions.approvalPolicy) {
      threadOptions.approvalPolicy = baseOptions.approvalPolicy;
    }
    if (baseOptions.modelReasoningEffort) {
      threadOptions.modelReasoningEffort = baseOptions.modelReasoningEffort;
    }
    if (typeof baseOptions.networkAccessEnabled === "boolean") {
      threadOptions.networkAccessEnabled = baseOptions.networkAccessEnabled;
    }
    if (baseOptions.webSearchMode) {
      threadOptions.webSearchMode = baseOptions.webSearchMode;
    }
    if (state.preferredModel) {
      threadOptions.model = state.preferredModel;
    }

    const merged = {
      ...threadOptions,
      ...overrides,
      workingDirectory: workdir
    };

    if (merged.approvalPolicy === undefined) {
      delete merged.approvalPolicy;
    }
    if (merged.sandboxMode === undefined) {
      delete merged.sandboxMode;
    }
    if (merged.modelReasoningEffort === undefined) {
      delete merged.modelReasoningEffort;
    }
    if (merged.networkAccessEnabled === undefined) {
      delete merged.networkAccessEnabled;
    }
    if (merged.webSearchMode === undefined) {
      delete merged.webSearchMode;
    }
    if (!merged.model) {
      delete merged.model;
    }
    if (!merged.additionalDirectories?.length) {
      delete merged.additionalDirectories;
    }

    return merged;
  }

  rememberSessionId(session: RunnerSession, sessionId: string): void {
    if (!sessionId || sessionId === session.sessionId) return;

    session.sessionId = sessionId;
    if (!session.trackConversation) return;

    const projectState = this.ensureProjectState(
      session.chatId,
      session.workdir
    );
    projectState.lastSessionId = sessionId;
    this.onChange?.(this.exportState());
  }

  isVerbose(chatId: string | number): boolean {
    const state = this.ensureChatState(chatId);
    return Boolean(state.verboseOutput);
  }

  getLanguage(chatId: string | number): Locale {
    const state = this.ensureChatState(chatId);
    return toLocale(normalizeLanguage(state.language) || "pt-BR");
  }

  setLanguage(chatId: string | number, language: string): Locale {
    const normalized = normalizeLanguage(language);
    if (!normalized) {
      throw new Error("Unsupported language.");
    }

    const state = this.ensureChatState(chatId);
    state.language = toLocale(normalized);
    this.onChange?.(this.exportState());
    return state.language;
  }

  setVerbose(chatId: string | number, enabled: boolean): boolean {
    const state = this.ensureChatState(chatId);
    state.verboseOutput = Boolean(enabled);
    this.onChange?.(this.exportState());
    return state.verboseOutput;
  }

  getWorkdir(chatId: string | number): string {
    const state = this.ensureChatState(chatId);
    return state.currentWorkdir || this.config.runner.cwd;
  }

  getRelativeWorkdir(chatId: string | number): string {
    const workdir = this.getWorkdir(chatId);
    const relative = path.relative(this.config.workspace.root, workdir);
    return relative || ".";
  }

  getProjectState(
    chatId: string | number,
    workdir = this.getWorkdir(chatId)
  ): ProjectConversationState {
    return this.ensureProjectState(chatId, workdir);
  }

  getOperationalContinuationState(
    chatId: string | number,
    workdir = this.getWorkdir(chatId)
  ): OperationalContinuationState {
    const key = String(chatId);
    const state = this.ensureChatState(key);
    const projectState = this.ensureProjectState(key, workdir);
    const session = this.sessions.get(key);

    return {
      active: Boolean(session),
      activeMode: session?.mode || null,
      workflowPhase: session
        ? (session.workflowPhase ?? "working")
        : (projectState.lastWorkflowPhase ?? "none"),
      workdir,
      relativeWorkdir: this.serializeWorkdir(workdir),
      pendingPromptText: state.pendingPrompt
        ? compactSnapshotText(toPromptSnapshotText(state.pendingPrompt.prompt))
        : null,
      queuedItems: this.listPromptQueue(key),
      lastPromptText: compactSnapshotText(projectState.lastPromptText),
      lastPromptAt: projectState.lastPromptAt,
      lastFinalResponseText: compactSnapshotText(
        projectState.lastFinalResponseText,
        1800
      ),
      lastFinalizedAt: projectState.lastFinalizedAt
    };
  }

  rememberWorkdir(state: ChatRuntimeState, workdir: string): void {
    const history = [
      workdir,
      ...(state.recentWorkdirs || []).filter((item) => item !== workdir)
    ];
    state.recentWorkdirs = history.slice(0, 6);
  }

  rememberPromptForProject(
    chatId: string | number,
    workdir: string,
    prompt: PromptInput
  ): void {
    const projectState = this.ensureProjectState(chatId, workdir);
    projectState.lastPromptText = compactSnapshotText(
      toPromptSnapshotText(normalizeDeferredPromptInput(prompt))
    );
    projectState.lastPromptAt = new Date().toISOString();
  }

  clearPendingPrompt(chatId: string | number): void {
    const state = this.ensureChatState(chatId);
    state.pendingPrompt = null;
  }

  storePendingPrompt(
    chatId: string | number,
    prompt: PromptInput,
    workdir: string,
    options: SendPromptOptions,
    blockingChatId: string
  ): void {
    const state = this.ensureChatState(chatId);
    const normalizedPrompt = normalizeDeferredPromptInput(prompt);

    state.pendingPrompt = {
      prompt: normalizedPrompt,
      workdir,
      options: clonePromptOptionsForQueue(options),
      blockingChatId
    };
  }

  enqueuePrompt(
    chatId: string | number,
    prompt: PromptInput,
    workdir: string,
    options: SendPromptOptions = {}
  ): QueueMutationResult {
    const state = this.ensureChatState(chatId);
    const normalizedPrompt = normalizeDeferredPromptInput(prompt);
    if (state.promptQueue.length >= MAX_PROMPT_QUEUE_SIZE) {
      return {
        ok: false,
        reason: "full",
        count: state.promptQueue.length
      };
    }

    const item: QueuedPromptRequest = {
      id: createQueueId(),
      prompt: normalizedPrompt,
      workdir,
      options: clonePromptOptionsForQueue(options),
      createdAt: new Date().toISOString()
    };

    state.promptQueue.push(item);
    this.onChange?.(this.exportState());

    return {
      ok: true,
      item: this.summarizeQueueItem(item, state.promptQueue.length)
    };
  }

  listPromptQueue(chatId: string | number): PromptQueueItemSummary[] {
    const state = this.ensureChatState(chatId);
    return state.promptQueue.map((item, index) =>
      this.summarizeQueueItem(item, index + 1)
    );
  }

  listRecoverableQueuedChats(): RecoverableQueuedChatSummary[] {
    const recoverable: RecoverableQueuedChatSummary[] = [];

    for (const [chatId, state] of this.chatState.entries()) {
      if (this.sessions.has(chatId) || !state.promptQueue.length) {
        continue;
      }

      const [nextItem] = state.promptQueue;
      if (!nextItem) {
        continue;
      }

      recoverable.push({
        chatId,
        queueLength: state.promptQueue.length,
        workdir: nextItem.workdir,
        relativeWorkdir: this.serializeWorkdir(nextItem.workdir),
        nextItem: this.summarizeQueueItem(nextItem, 1)
      });
    }

    return recoverable;
  }

  removeQueuedPrompt(
    chatId: string | number,
    selector: string
  ): QueueMutationResult {
    const state = this.ensureChatState(chatId);
    const normalized = String(selector || "").trim();
    if (!normalized || !state.promptQueue.length) {
      return {
        ok: false,
        reason: "empty"
      };
    }

    const numericIndex = /^\d+$/.test(normalized)
      ? Number.parseInt(normalized, 10) - 1
      : -1;
    const index =
      numericIndex >= 0
        ? numericIndex
        : state.promptQueue.findIndex((item) =>
            item.id.toLowerCase().startsWith(normalized.toLowerCase())
          );

    if (index < 0 || index >= state.promptQueue.length) {
      return {
        ok: false,
        reason: "not_found"
      };
    }

    const [removed] = state.promptQueue.splice(index, 1);
    this.onChange?.(this.exportState());

    return {
      ok: true,
      removed: this.summarizeQueueItem(removed, index + 1),
      count: state.promptQueue.length
    };
  }

  clearPromptQueue(chatId: string | number): QueueMutationResult {
    const state = this.ensureChatState(chatId);
    const count = state.promptQueue.length;
    state.promptQueue = [];
    this.onChange?.(this.exportState());

    return {
      ok: true,
      count
    };
  }

  async runNextQueuedPrompt(
    ctx: SendPromptContext
  ): Promise<SendPromptResult | NoPendingPromptResult> {
    return this.startNextQueuedPrompt(String(ctx.chat.id), {
      announce: true
    });
  }

  private summarizeQueueItem(
    item: QueuedPromptRequest,
    index: number
  ): PromptQueueItemSummary {
    const text = this.stringifyPromptInput(
      normalizeDeferredPromptInput(item.prompt)
    )
      .replace(/\s+/g, " ")
      .trim();

    return {
      id: item.id,
      index,
      text: text.length > 160 ? `${text.slice(0, 157)}...` : text || "(empty)",
      workdir: item.workdir,
      relativeWorkdir: this.serializeWorkdir(item.workdir),
      createdAt: item.createdAt
    };
  }

  private async startNextQueuedPrompt(
    chatId: string,
    { announce = false }: { announce?: boolean } = {}
  ): Promise<SendPromptResult | NoPendingPromptResult> {
    const state = this.ensureChatState(chatId);
    if (!state.promptQueue.length) {
      return {
        started: false,
        reason: "no_pending_prompt"
      };
    }

    if (this.sessions.has(chatId)) {
      return {
        started: false,
        reason: "busy",
        activeMode: this.sessions.get(chatId)?.mode || "sdk"
      };
    }

    const next = state.promptQueue.shift();
    if (!next) {
      return {
        started: false,
        reason: "no_pending_prompt"
      };
    }
    this.onChange?.(this.exportState());

    const previousWorkdir = state.currentWorkdir;
    const switchedWorkdir = next.workdir !== previousWorkdir;
    if (switchedWorkdir) {
      this.ensureProjectState(chatId, next.workdir);
      state.currentWorkdir = next.workdir;
      this.rememberWorkdir(state, next.workdir);
      this.onChange?.(this.exportState());
    }

    const result = await this.sendPrompt(
      { chat: { id: chatId } },
      normalizeDeferredPromptInput(next.prompt),
      {
        ...next.options,
        queueOnBusy: false
      }
    );

    if (announce && result.started) {
      await this.bot.telegram
        .sendMessage(
          chatId,
          `Executando item da fila: ${this.summarizeQueueItem(next, 1).text}`
        )
        .catch(() => {});
    }

    if (!result.started) {
      if (switchedWorkdir) {
        state.currentWorkdir = previousWorkdir;
        this.rememberWorkdir(state, previousWorkdir);
      }
      state.promptQueue.unshift(next);
      this.onChange?.(this.exportState());
    }

    return result;
  }

  findWorkspaceConflict(
    chatId: string | number,
    workdir: string
  ): RunnerSession | null {
    const key = String(chatId);
    const resolvedWorkdir = path.resolve(workdir);

    for (const session of this.sessions.values()) {
      if (session.chatId === key) {
        continue;
      }

      if (path.resolve(session.workdir) === resolvedWorkdir) {
        return session;
      }
    }

    return null;
  }

  isInsideWorkspaceRoot(candidate: string): boolean {
    const root = path.resolve(this.config.workspace.root);
    const target = path.resolve(candidate);
    const relative = path.relative(root, target);
    return (
      relative === "" ||
      (!relative.startsWith("..") && !path.isAbsolute(relative))
    );
  }

  isProjectDirectory(candidate: string): boolean {
    const projectMarkers = [
      ".git",
      ".agents",
      ".codex",
      "package.json",
      "AGENTS.md"
    ];

    return projectMarkers.some((marker) =>
      fs.existsSync(path.join(candidate, marker))
    );
  }

  listProjects(): Array<{ name: string; path: string; relativePath: string }> {
    const root = this.config.workspace.root;
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const projects: Array<{
      name: string;
      path: string;
      relativePath: string;
    }> = [];

    if (this.isProjectDirectory(root)) {
      projects.push({
        name: path.basename(root),
        path: root,
        relativePath: "."
      });
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(root, entry.name);
      if (!this.isProjectDirectory(fullPath)) continue;

      projects.push({
        name: entry.name,
        path: fullPath,
        relativePath: entry.name
      });
    }

    return projects.sort((a, b) => a.name.localeCompare(b.name));
  }

  resolveProjectWorkdir(
    targetName: string
  ): { workdir: string; relativePath: string } | null {
    const requested = String(targetName || "").trim();
    if (!requested) {
      return null;
    }

    const root = this.config.workspace.root;
    const candidatePath =
      requested === "." || requested === path.basename(root)
        ? root
        : path.resolve(root, requested);

    if (
      this.isInsideWorkspaceRoot(candidatePath) &&
      fs.existsSync(candidatePath) &&
      fs.statSync(candidatePath).isDirectory() &&
      this.isProjectDirectory(candidatePath)
    ) {
      return {
        workdir: candidatePath,
        relativePath: path.relative(root, candidatePath) || "."
      };
    }

    const matches = this.listProjects()
      .map((project) => ({
        project,
        score: scoreProjectQueryMatch(project, requested)
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.project.name.localeCompare(right.project.name);
      });

    if (!matches.length) {
      return null;
    }

    return {
      workdir: matches[0].project.path,
      relativePath: matches[0].project.relativePath
    };
  }

  getRecentProjects(
    chatId: string | number
  ): Array<{ path: string; relativePath: string }> {
    const state = this.ensureChatState(chatId);
    return (state.recentWorkdirs || [])
      .filter(
        (workdir) =>
          fs.existsSync(workdir) && this.isInsideWorkspaceRoot(workdir)
      )
      .map((workdir) => ({
        path: workdir,
        relativePath: path.relative(this.config.workspace.root, workdir) || "."
      }));
  }

  switchWorkdir(
    chatId: string | number,
    targetName: string
  ): { workdir: string; relativePath: string } {
    const key = String(chatId);
    const requested = String(targetName || "").trim();
    if (!requested) {
      throw new Error(t(this.getLanguage(key), "projectNameRequired"));
    }

    const root = this.config.workspace.root;
    let targetPath: string;

    if (requested === "." || requested === path.basename(root)) {
      targetPath = root;
    } else {
      targetPath = path.resolve(root, requested);
    }

    if (!this.isInsideWorkspaceRoot(targetPath)) {
      throw new Error(t(this.getLanguage(key), "targetOutsideWorkspaceRoot"));
    }

    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
      throw new Error(
        t(this.getLanguage(key), "projectDirDoesNotExist", { path: targetPath })
      );
    }

    if (!this.isProjectDirectory(targetPath)) {
      throw new Error(
        t(this.getLanguage(key), "targetNotGitRepository", { path: targetPath })
      );
    }

    const state = this.ensureChatState(key);
    this.ensureProjectState(key, targetPath);
    state.currentWorkdir = targetPath;
    this.rememberWorkdir(state, targetPath);
    state.pendingPrompt = null;
    this.closeSession(key);
    this.onChange?.(this.exportState());

    return {
      workdir: targetPath,
      relativePath: path.relative(root, targetPath) || "."
    };
  }

  switchToPreviousWorkdir(chatId: string | number): {
    workdir: string;
    relativePath: string;
  } {
    const key = String(chatId);
    const state = this.ensureChatState(key);
    const previous = (state.recentWorkdirs || []).find(
      (workdir) => workdir !== state.currentWorkdir
    );

    if (!previous) {
      throw new Error(t(this.getLanguage(key), "noPreviousProject"));
    }

    return this.switchWorkdir(key, previous);
  }

  getExecArgs(
    chatId: string | number,
    prompt: string,
    options: SessionOptions = {}
  ): string[] {
    const state = this.ensureChatState(chatId);
    const args = options.resumeSessionId ? ["exec", "resume"] : ["exec"];

    if (options.fullAuto) {
      args.push("--full-auto");
    }

    if (state.preferredModel) {
      args.push("-m", state.preferredModel);
    }

    if (Array.isArray(options.extraArgs) && options.extraArgs.length) {
      args.push(...options.extraArgs);
    }

    if (options.resumeSessionId) {
      args.push(options.resumeSessionId);
    }

    args.push(prompt);
    return args;
  }

  getInteractiveArgs(
    chatId: string | number,
    options: SessionOptions = {}
  ): string[] {
    const args = options.resumeSessionId
      ? ["resume", options.resumeSessionId]
      : this.getCommandArgsForSession(chatId);

    if (options.resumeSessionId && options.initialPrompt) {
      args.push(options.initialPrompt);
    }

    return args;
  }

  createBaseSession(
    chatId: string | number,
    mode: SessionMode,
    options: SessionOptions = {}
  ): RunnerSession {
    const key = String(chatId);
    const state = this.ensureChatState(key);
    const workdir = path.resolve(
      options.workdir || state.currentWorkdir || this.config.runner.cwd
    );
    const projectState = this.ensureProjectState(key, workdir);
    const session: RunnerSession = {
      chatId: key,
      mode,
      workdir,
      model: state.preferredModel,
      sessionId: projectState.lastSessionId || "",
      trackConversation: options.trackConversation !== false,
      proc: null,
      thread: null,
      abortController: null,
      renderableItems: new Map(),
      renderableItemOrder: [],
      rawBuffer: "",
      streamMessageIds: [],
      lastRendered: "",
      flushQueue: Promise.resolve(),
      throttledFlush: throttle(
        () => this.enqueueFlush(key),
        this.config.runner.throttleMs,
        { leading: true, trailing: true }
      ),
      silentOutput: Boolean(options.silentOutput),
      finalResponseText: "",
      cleanupPaths: [...(options.cleanupPaths || [])],
      write: null,
      interrupt: null,
      close: null,
      workflowPhase: null
    };

    this.sessions.set(key, session);
    return session;
  }

  captureSessionMetadata(session: RunnerSession): void {
    if (!session.trackConversation) return;

    const sessionId = extractSessionId(session.rawBuffer);
    this.rememberSessionId(session, sessionId);
  }

  captureWorkflowPhase(session: RunnerSession): void {
    const workflowPhase = detectWorkflowPhase(session.rawBuffer);
    if (workflowPhase) {
      session.workflowPhase = workflowPhase;
    }
  }

  updateSdkRenderableItem(session: RunnerSession, item: ThreadItem): void {
    const text = summarizeSdkItem(item, this.isVerbose(session.chatId));
    const hasEntry = session.renderableItems.has(item.id);

    if (item.type === "agent_message" && item.text?.trim()) {
      session.finalResponseText = item.text.trim();
    }

    if (!text) {
      if (hasEntry) {
        session.renderableItems.delete(item.id);
        session.renderableItemOrder = session.renderableItemOrder.filter(
          (entryId) => entryId !== item.id
        );
      }
      session.rawBuffer = this.composeSdkRawBuffer(session);
      this.captureWorkflowPhase(session);
      return;
    }

    if (!hasEntry) {
      session.renderableItemOrder.push(item.id);
    }

    session.renderableItems.set(item.id, text);
    session.rawBuffer = this.composeSdkRawBuffer(session);
    this.captureWorkflowPhase(session);
  }

  composeSdkRawBuffer(session: RunnerSession): string {
    return session.renderableItemOrder
      .map((itemId) => session.renderableItems.get(itemId) || "")
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  extractFinalResponseText(session: RunnerSession): string {
    if (session.mode === "sdk" && session.finalResponseText.trim()) {
      return sanitizeTelegramFacingCodexText(session.finalResponseText.trim());
    }

    const fallback =
      session.mode === "exec"
        ? extractCodexExecResponse(session.rawBuffer)
        : session.rawBuffer;

    return sanitizeTelegramFacingCodexText(String(fallback || "").trim());
  }

  async sendFinalOnlyOutput(session: RunnerSession): Promise<void> {
    const finalText = this.extractFinalResponseText(session);
    if (!finalText) {
      return;
    }

    const chunks = splitTelegramMessage(escapeMarkdownV2(finalText));
    for (const chunk of chunks) {
      const sent = await this.bot.telegram.sendMessage(session.chatId, chunk, {
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true
      });
      session.streamMessageIds.push(sent.message_id);
    }
  }

  async finalizeSession(
    session: RunnerSession,
    exitCode: number | null,
    signal: ExitSignal
  ): Promise<void> {
    this.captureSessionMetadata(session);
    const projectState = this.ensureProjectState(
      session.chatId,
      session.workdir
    );
    projectState.lastMode = session.mode;
    projectState.lastExitCode = exitCode;
    projectState.lastExitSignal = signal;
    projectState.lastWorkflowPhase = session.workflowPhase;
    this.onChange?.(this.exportState());

    if (this.sessions.get(session.chatId) === session) {
      await session.flushQueue.catch(() => {});
      if (session.silentOutput) {
        await this.sendFinalOnlyOutput(session).catch(() => {});
      } else {
        await this.flushToTelegram(session.chatId).catch(() => {});
      }
    }

    const finalResponseText = this.extractFinalResponseText(session);
    projectState.lastFinalResponseText =
      summarizeOperationalResultSnapshot(finalResponseText);
    projectState.lastFinalizedAt = new Date().toISOString();
    const finalRendered = session.silentOutput
      ? finalResponseText
      : session.lastRendered;

    if (this.isVerbose(session.chatId)) {
      await this.bot.telegram
        .sendMessage(
          session.chatId,
          t(this.getLanguage(session.chatId), "codexSessionExited", {
            mode: session.mode,
            exitCode,
            signal
          })
        )
        .catch(() => {});
    }

    if (finalRendered && this.onResponseFinalized) {
      await this.onResponseFinalized({
        chatId: session.chatId,
        text: finalResponseText || finalRendered,
        promptText: projectState.lastPromptText || null,
        mode: session.mode,
        workdir: session.workdir,
        exitCode,
        signal
      }).catch(() => {});
    }

    session.throttledFlush.cancel();
    if (this.sessions.get(session.chatId) === session) {
      this.sessions.delete(session.chatId);
    }
    if (session.cleanupPaths.length) {
      await Promise.all(
        session.cleanupPaths.map((cleanupPath) =>
          fs.promises.rm(cleanupPath, { force: true }).catch(() => {})
        )
      );
    }

    await this.startNextQueuedPrompt(session.chatId, {
      announce: true
    }).catch(() => {});
  }

  stringifyPromptInput(prompt: PromptInput): string {
    if (typeof prompt === "string") {
      return prompt;
    }

    return prompt
      .map((item) =>
        item.type === "text"
          ? item.text
          : `Analyze the attached local image at: ${item.path}`
      )
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  serializePromptInput(prompt: PromptInput): SerializablePromptInput | null {
    if (typeof prompt === "string") {
      return prompt;
    }

    const items: SerializablePromptInput = [];
    for (const item of prompt) {
      if (item.type === "text") {
        items.push({
          type: "text",
          text: item.text
        });
        continue;
      }

      if (item.type === "local_image") {
        items.push({
          type: "local_image",
          path: item.path
        });
        continue;
      }

      return null;
    }

    return items;
  }

  restorePromptInput(raw: unknown): PromptInput | null {
    if (typeof raw === "string") {
      return raw;
    }

    if (!Array.isArray(raw)) {
      return null;
    }

    const items: Array<
      { type: "text"; text: string } | { type: "local_image"; path: string }
    > = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as {
        type?: unknown;
        text?: unknown;
        path?: unknown;
      };
      if (candidate.type === "text" && typeof candidate.text === "string") {
        items.push({
          type: "text",
          text: candidate.text
        });
        continue;
      }

      if (
        candidate.type === "local_image" &&
        typeof candidate.path === "string" &&
        fs.existsSync(candidate.path)
      ) {
        items.push({
          type: "local_image",
          path: candidate.path
        });
        continue;
      }

      return null;
    }

    return items;
  }

  attachOutput(
    session: RunnerSession,
    stream:
      | NodeJS.ReadableStream
      | { on: (event: "data", listener: (chunk: unknown) => void) => void }
  ): void {
    stream.on("data", (chunk: unknown) => {
      session.rawBuffer += stripAnsi(String(chunk || "")).replace(/\r/g, "");
      if (session.rawBuffer.length > this.config.runner.maxBufferChars) {
        session.rawBuffer = session.rawBuffer.slice(
          -this.config.runner.maxBufferChars
        );
      }
      this.captureSessionMetadata(session);
      this.captureWorkflowPhase(session);
      session.throttledFlush();
    });
  }

  attachExit(
    session: RunnerSession,
    handler: (
      listener: (payload: {
        exitCode: number | null;
        signal: ExitSignal;
      }) => void
    ) => void
  ): void {
    handler(async ({ exitCode, signal }) => {
      await this.finalizeSession(session, exitCode, signal);
    });
  }

  startPtySession(
    chatId: string | number,
    options: SessionOptions = {}
  ): RunnerSession {
    const session = this.createBaseSession(chatId, "pty", options);
    const proc = pty.spawn(
      this.config.runner.command,
      this.getInteractiveArgs(chatId, options),
      {
        name: "xterm-256color",
        cols: 120,
        rows: 32,
        cwd: session.workdir,
        env: {
          ...process.env,
          FORCE_COLOR: "1"
        }
      }
    ) as PtyProcess;

    this.ensureChatState(chatId).ptySupported = true;
    session.proc = proc;
    session.write = (input: string) => proc.write(input);
    session.interrupt = () => proc.write("\u0003");
    session.close = () => proc.kill();

    proc.onData((chunk) => {
      session.rawBuffer += stripAnsi(String(chunk || "")).replace(/\r/g, "");
      if (session.rawBuffer.length > this.config.runner.maxBufferChars) {
        session.rawBuffer = session.rawBuffer.slice(
          -this.config.runner.maxBufferChars
        );
      }
      this.captureSessionMetadata(session);
      this.captureWorkflowPhase(session);
      session.throttledFlush();
    });

    this.attachExit(session, (listener) => proc.onExit(listener));
    return session;
  }

  startExecSessionWithOptions(
    chatId: string | number,
    prompt: string,
    options: SessionOptions = {}
  ): RunnerSession {
    const session = this.createBaseSession(chatId, "exec", options);
    const proc = spawn(
      this.config.runner.command,
      this.getExecArgs(chatId, prompt, options),
      {
        cwd: session.workdir,
        env: process.env
      }
    );

    session.proc = proc;
    session.write = null;
    session.interrupt = () => proc.kill("SIGINT");
    session.close = () => proc.kill("SIGTERM");

    if (proc.stdout) {
      this.attachOutput(session, proc.stdout);
    }
    if (proc.stderr) {
      this.attachOutput(session, proc.stderr);
    }
    this.attachExit(session, (listener) =>
      proc.on("close", (exitCode, signal) => listener({ exitCode, signal }))
    );

    proc.on("error", async (error) => {
      await this.bot.telegram
        .sendMessage(
          session.chatId,
          t(this.getLanguage(session.chatId), "codexExecFailed", {
            error: error.message
          })
        )
        .catch(() => {});
      session.throttledFlush.cancel();
      this.sessions.delete(session.chatId);
    });

    return session;
  }

  startSdkSessionWithOptions(
    chatId: string | number,
    prompt: PromptInput,
    options: SessionOptions = {}
  ): RunnerSession {
    const session = this.createBaseSession(chatId, "sdk", options);
    const controller = new AbortController();

    session.abortController = controller;
    session.interrupt = () => controller.abort();
    session.close = () => controller.abort();

    void this.runSdkTurn(session, prompt, options);
    return session;
  }

  async runSdkTurn(
    session: RunnerSession,
    prompt: PromptInput,
    options: SessionOptions = {}
  ): Promise<void> {
    let exitCode: number | null = 0;
    let signal: ExitSignal = null;

    try {
      const threadOptions = this.getSdkThreadOptions(
        session.chatId,
        session.workdir,
        {
          approvalPolicy: options.fullAuto ? "never" : undefined
        }
      );
      const codex = this.getCodexClient();
      const thread = options.resumeSessionId
        ? codex.resumeThread(options.resumeSessionId, threadOptions)
        : codex.startThread(threadOptions);

      session.thread = thread;
      if (thread.id) {
        this.rememberSessionId(session, thread.id);
      }

      const streamed = await thread.runStreamed(prompt, {
        signal: session.abortController?.signal
      });

      for await (const event of streamed.events) {
        if (event.type === "thread.started") {
          this.rememberSessionId(session, event.thread_id);
          continue;
        }

        if (
          event.type === "item.started" ||
          event.type === "item.updated" ||
          event.type === "item.completed"
        ) {
          this.updateSdkRenderableItem(session, event.item);
          session.throttledFlush();
          continue;
        }

        if (event.type === "turn.failed") {
          exitCode = 1;
          session.rawBuffer = [session.rawBuffer, event.error.message]
            .filter(Boolean)
            .join("\n\n");
          session.throttledFlush();
          continue;
        }

        if (event.type === "error") {
          exitCode = 1;
          session.rawBuffer = [session.rawBuffer, event.message]
            .filter(Boolean)
            .join("\n\n");
          session.throttledFlush();
        }
      }
    } catch (error) {
      if (isAbortError(error) || session.abortController?.signal.aborted) {
        exitCode = null;
        signal = "SIGINT";
      } else {
        exitCode = 1;
        await this.bot.telegram
          .sendMessage(
            session.chatId,
            t(this.getLanguage(session.chatId), "codexExecFailed", {
              error: toErrorMessage(error)
            })
          )
          .catch(() => {});
      }
    } finally {
      await this.finalizeSession(session, exitCode, signal);
    }
  }

  ensureSession(
    chatId: string | number,
    options: SessionOptions = {}
  ): RunnerSession | null {
    if (this.config.runner.backend !== "cli") {
      return null;
    }

    const key = String(chatId);
    const existing = this.sessions.get(key);
    if (existing) return existing;

    try {
      return this.startPtySession(key, options);
    } catch (error) {
      if (!isPtySpawnFailure(error)) {
        throw error;
      }

      this.ensureChatState(key).ptySupported = false;
      console.warn(
        `[runner] PTY spawn failed for chat ${key}; falling back to codex exec mode.`
      );
      return null;
    }
  }

  enqueueFlush(chatId: string | number): void {
    const key = String(chatId);
    const session = this.sessions.get(key);
    if (!session) return;

    session.flushQueue = session.flushQueue
      .then(() => this.flushToTelegram(key))
      .catch(() => {});
  }

  async flushToTelegram(chatId: string | number): Promise<void> {
    const session = this.sessions.get(String(chatId));
    if (!session) return;
    if (session.silentOutput) return;

    const rawTail = session.rawBuffer.slice(-60000);
    const rendered = formatPtyOutput(rawTail, {
      mode: this.config.reasoning.mode,
      sessionMode: session.mode
    });
    if (rendered === session.lastRendered) return;
    session.lastRendered = rendered;

    const chunks = splitTelegramMessage(
      rendered,
      this.config.runner.telegramChunkSize
    );
    const existing = session.streamMessageIds;
    const nextIds: number[] = [];

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      const existingMessageId = existing[i];

      if (existingMessageId) {
        try {
          await this.bot.telegram.editMessageText(
            chatId,
            existingMessageId,
            undefined,
            chunk,
            {
              parse_mode: "MarkdownV2",
              disable_web_page_preview: true
            }
          );
          nextIds.push(existingMessageId);
        } catch (error) {
          if (!isMessageNotModified(error)) {
            const sent = await this.bot.telegram.sendMessage(chatId, chunk, {
              parse_mode: "MarkdownV2",
              disable_web_page_preview: true
            });
            nextIds.push(sent.message_id);
          } else {
            nextIds.push(existingMessageId);
          }
        }
      } else {
        const sent = await this.bot.telegram.sendMessage(chatId, chunk, {
          parse_mode: "MarkdownV2",
          disable_web_page_preview: true
        });
        nextIds.push(sent.message_id);
      }
    }

    for (let i = chunks.length; i < existing.length; i += 1) {
      const staleId = existing[i];
      await this.bot.telegram.deleteMessage(chatId, staleId).catch(() => {});
    }

    session.streamMessageIds = nextIds;
  }

  async sendPrompt(
    ctx: SendPromptContext,
    prompt: PromptInput,
    options: SendPromptOptions = {}
  ): Promise<SendPromptResult> {
    const chatId = String(ctx.chat.id);
    const workdir = this.getWorkdir(chatId);
    const projectState = this.ensureProjectState(chatId);
    const state = this.ensureChatState(chatId);
    const promptText = this.stringifyPromptInput(prompt);
    this.rememberPromptForProject(chatId, workdir, prompt);

    if (!options.allowWorkspaceConflict) {
      const conflict = this.findWorkspaceConflict(chatId, workdir);
      if (conflict) {
        this.storePendingPrompt(
          chatId,
          prompt,
          workdir,
          options,
          conflict.chatId
        );
        return {
          started: false,
          reason: "workspace_busy",
          activeMode: conflict.mode,
          blockingChatId: conflict.chatId,
          relativeWorkdir: this.serializeWorkdir(workdir)
        };
      }
    }

    state.pendingPrompt = null;

    if (this.config.runner.backend === "sdk") {
      const running = this.sessions.get(chatId);
      if (running) {
        if (options.queueOnBusy !== false) {
          const queued = this.enqueuePrompt(chatId, prompt, workdir, options);
          if (queued.ok && queued.item) {
            return {
              started: false,
              reason: "queued",
              activeMode: running.mode,
              queueLength: this.listPromptQueue(chatId).length,
              item: queued.item
            };
          }
        }

        if (options.cleanupPaths?.length) {
          await Promise.all(
            options.cleanupPaths.map((cleanupPath) =>
              fs.promises.rm(cleanupPath, { force: true }).catch(() => {})
            )
          );
        }
        return {
          started: false,
          reason: "busy",
          activeMode: running.mode
        };
      }

      const resumed = Boolean(projectState.lastSessionId && !options.forceExec);
      const session = this.startSdkSessionWithOptions(chatId, prompt, {
        fullAuto: Boolean(options.fullAuto),
        extraArgs: options.extraArgs || [],
        silentOutput: Boolean(options.silentOutput),
        cleanupPaths: options.cleanupPaths || [],
        workdir,
        resumeSessionId:
          options.forceExec || !projectState.lastSessionId
            ? ""
            : projectState.lastSessionId,
        trackConversation: !options.forceExec
      });

      if (options.notice && this.isVerbose(chatId)) {
        await this.bot.telegram
          .sendMessage(chatId, options.notice)
          .catch(() => {});
      }

      if (!session.streamMessageIds.length && this.isVerbose(chatId)) {
        const sent = await this.bot.telegram.sendMessage(
          chatId,
          resumed
            ? t(this.getLanguage(chatId), "sessionRestored", {
                project: this.getRelativeWorkdir(chatId),
                mode: session.mode
              })
            : t(this.getLanguage(chatId), "sessionStarted", {
                mode: session.mode
              })
        );
        session.streamMessageIds.push(sent.message_id);
      }

      return {
        started: true,
        mode: "sdk",
        resumed
      };
    }

    if (options.forceExec) {
      const running = this.sessions.get(chatId);
      if (running) {
        if (options.queueOnBusy !== false) {
          const queued = this.enqueuePrompt(chatId, prompt, workdir, options);
          if (queued.ok && queued.item) {
            return {
              started: false,
              reason: "queued",
              activeMode: running.mode,
              queueLength: this.listPromptQueue(chatId).length,
              item: queued.item
            };
          }
        }

        if (options.cleanupPaths?.length) {
          await Promise.all(
            options.cleanupPaths.map((cleanupPath) =>
              fs.promises.rm(cleanupPath, { force: true }).catch(() => {})
            )
          );
        }
        return {
          started: false,
          reason: "busy",
          activeMode: running.mode
        };
      }

      this.startExecSessionWithOptions(chatId, promptText, {
        fullAuto: Boolean(options.fullAuto),
        extraArgs: options.extraArgs || [],
        silentOutput: Boolean(options.silentOutput),
        cleanupPaths: options.cleanupPaths || [],
        workdir,
        trackConversation: false
      });

      if (options.notice && this.isVerbose(chatId)) {
        await this.bot.telegram.sendMessage(chatId, options.notice);
      }

      return {
        started: true,
        mode: "exec"
      };
    }

    const existingSession = this.sessions.get(chatId);
    if (existingSession) {
      if (existingSession.mode === "pty") {
        if (options.cleanupPaths?.length) {
          existingSession.cleanupPaths.push(...options.cleanupPaths);
        }
        existingSession.write?.(`${promptText}\r`);
        return {
          started: true,
          mode: "pty"
        };
      }

      if (existingSession.mode === "exec") {
        if (options.queueOnBusy !== false) {
          const queued = this.enqueuePrompt(chatId, prompt, workdir, options);
          if (queued.ok && queued.item) {
            return {
              started: false,
              reason: "queued",
              activeMode: existingSession.mode,
              queueLength: this.listPromptQueue(chatId).length,
              item: queued.item
            };
          }
        }

        if (options.cleanupPaths?.length) {
          await Promise.all(
            options.cleanupPaths.map((cleanupPath) =>
              fs.promises.rm(cleanupPath, { force: true }).catch(() => {})
            )
          );
        }
        return {
          started: false,
          reason: "busy",
          activeMode: existingSession.mode
        };
      }

      if (options.queueOnBusy !== false) {
        const queued = this.enqueuePrompt(chatId, prompt, workdir, options);
        if (queued.ok && queued.item) {
          return {
            started: false,
            reason: "queued",
            activeMode: existingSession.mode,
            queueLength: this.listPromptQueue(chatId).length,
            item: queued.item
          };
        }
      }

      if (options.cleanupPaths?.length) {
        existingSession.cleanupPaths.push(...options.cleanupPaths);
      }
      existingSession.write?.(`${promptText}\r`);
      return {
        started: true,
        mode: "pty"
      };
    }

    let session = this.ensureSession(
      chatId,
      projectState.lastSessionId
        ? {
            workdir,
            resumeSessionId: projectState.lastSessionId,
            initialPrompt: promptText
          }
        : {
            workdir
          }
    );

    if (!session) {
      session = this.startExecSessionWithOptions(chatId, promptText, {
        fullAuto: Boolean(options.fullAuto),
        extraArgs: options.extraArgs || [],
        silentOutput: Boolean(options.silentOutput),
        cleanupPaths: options.cleanupPaths || [],
        workdir,
        resumeSessionId: projectState.lastSessionId || ""
      });
      if (this.isVerbose(chatId)) {
        await this.bot.telegram.sendMessage(
          chatId,
          projectState.lastSessionId
            ? t(this.getLanguage(chatId), "execFallbackResume")
            : t(this.getLanguage(chatId), "execFallbackSingle")
        );
      }
      return {
        started: true,
        mode: "exec",
        fallback: true,
        resumed: Boolean(projectState.lastSessionId)
      };
    }

    if (!session.streamMessageIds.length && this.isVerbose(chatId)) {
      const sent = await this.bot.telegram.sendMessage(
        chatId,
        projectState.lastSessionId
          ? t(this.getLanguage(chatId), "sessionRestored", {
              project: this.getRelativeWorkdir(chatId),
              mode: session.mode
            })
          : t(this.getLanguage(chatId), "sessionStarted", {
              mode: session.mode
            })
      );
      session.streamMessageIds.push(sent.message_id);
    }

    if (projectState.lastSessionId) {
      return {
        started: true,
        mode: "pty",
        resumed: true
      };
    }

    session.write?.(`${promptText}\r`);
    return {
      started: true,
      mode: "pty"
    };
  }

  async continuePendingPrompt(
    ctx: SendPromptContext
  ): Promise<ContinuePendingPromptResult> {
    const chatId = String(ctx.chat.id);
    const state = this.ensureChatState(chatId);
    const pending = state.pendingPrompt;

    if (!pending) {
      return {
        started: false,
        reason: "no_pending_prompt"
      };
    }

    state.pendingPrompt = null;

    try {
      const result = await this.sendPrompt(
        ctx,
        normalizeDeferredPromptInput(pending.prompt),
        {
          ...pending.options,
          allowWorkspaceConflict: true
        }
      );

      if (!result.started) {
        state.pendingPrompt = pending;
        return {
          started: false,
          reason: "busy",
          activeMode: result.activeMode
        };
      }

      return result;
    } catch (error) {
      state.pendingPrompt = pending;
      throw error;
    }
  }

  interrupt(chatId: string | number): boolean {
    const key = String(chatId);
    const session = this.sessions.get(key);
    if (!session) return false;
    session.interrupt?.();
    globalThis.setTimeout(() => {
      if (this.sessions.get(key) === session) {
        this.closeSession(key);
      }
    }, INTERRUPT_FORCE_CLOSE_MS);
    return true;
  }

  resetCurrentProjectConversation(chatId: string | number): {
    closed: boolean;
    workdir: string;
  } {
    const key = String(chatId);
    const workdir = this.getWorkdir(key);
    const projectState = this.ensureProjectState(key, workdir);
    const closed = this.closeSession(key);

    projectState.lastSessionId = "";
    projectState.lastMode = null;
    projectState.lastExitCode = null;
    projectState.lastExitSignal = null;
    projectState.lastWorkflowPhase = null;
    this.onChange?.(this.exportState());

    return {
      closed,
      workdir
    };
  }

  closeSession(chatId: string | number): boolean {
    const key = String(chatId);
    const session = this.sessions.get(key);
    if (!session) return false;

    session.throttledFlush.cancel();
    session.close?.();
    this.sessions.delete(key);
    return true;
  }

  async shutdown(): Promise<void> {
    for (const chatId of this.sessions.keys()) {
      this.closeSession(chatId);
    }
  }

  serializeWorkdir(workdir: string): string {
    const relative = path.relative(this.config.workspace.root, workdir);
    if (!relative) return ".";
    return !relative.startsWith("..") && !path.isAbsolute(relative)
      ? relative
      : workdir;
  }

  resolveStoredWorkdir(stored: unknown): string | null {
    if (!stored || typeof stored !== "string") return null;
    const candidate = path.isAbsolute(stored)
      ? path.resolve(stored)
      : path.resolve(this.config.workspace.root, stored);

    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) {
      return null;
    }

    if (!this.isInsideWorkspaceRoot(candidate)) {
      return null;
    }

    return candidate;
  }

  exportState(): PtyManagerSnapshot {
    const chats: PtyManagerSnapshot["chats"] = {};

    for (const [chatId, state] of this.chatState.entries()) {
      const projects: PtyManagerSnapshot["chats"][string]["projects"] = {};
      for (const [workdir, projectState] of state.projectStates.entries()) {
        projects[this.serializeWorkdir(workdir)] = {
          lastSessionId: projectState.lastSessionId || "",
          lastMode: projectState.lastMode,
          lastExitCode: projectState.lastExitCode,
          lastExitSignal: projectState.lastExitSignal,
          lastWorkflowPhase: projectState.lastWorkflowPhase,
          lastPromptText: projectState.lastPromptText,
          lastPromptAt: projectState.lastPromptAt,
          lastFinalResponseText: projectState.lastFinalResponseText,
          lastFinalizedAt: projectState.lastFinalizedAt
        };
      }

      chats[chatId] = {
        preferredModel: state.preferredModel,
        language: this.getLanguage(chatId),
        verboseOutput: Boolean(state.verboseOutput),
        currentWorkdir: this.serializeWorkdir(state.currentWorkdir),
        recentWorkdirs: (state.recentWorkdirs || []).map((workdir) =>
          this.serializeWorkdir(workdir)
        ),
        promptQueue: state.promptQueue
          .map((item) => {
            const prompt = this.serializePromptInput(item.prompt);
            if (!prompt) {
              return null;
            }

            return {
              id: item.id,
              prompt,
              workdir: this.serializeWorkdir(item.workdir),
              options: clonePromptOptionsForQueue(item.options),
              createdAt: item.createdAt
            };
          })
          .filter((item): item is StoredQueuedPromptRequest => item !== null),
        projects
      };
    }

    return {
      chats
    };
  }

  restoreState(snapshot: Partial<PtyManagerSnapshot> = {}): void {
    const chats = snapshot?.chats;
    if (!chats || typeof chats !== "object") return;

    this.chatState.clear();

    for (const [chatId, rawState] of Object.entries(
      chats as Record<string, StoredChatRuntimeState>
    )) {
      const currentWorkdir =
        this.resolveStoredWorkdir(rawState?.currentWorkdir) ||
        this.config.runner.cwd;

      const recentWorkdirs = Array.isArray(rawState?.recentWorkdirs)
        ? rawState.recentWorkdirs
            .map((stored) => this.resolveStoredWorkdir(stored))
            .filter((workdir): workdir is string => Boolean(workdir))
        : [];

      const projectStates = new Map<string, ProjectConversationState>();
      const rawProjects = rawState?.projects;
      if (rawProjects && typeof rawProjects === "object") {
        for (const [storedWorkdir, rawProjectState] of Object.entries(
          rawProjects
        )) {
          const resolvedWorkdir = this.resolveStoredWorkdir(storedWorkdir);
          if (!resolvedWorkdir) continue;

          projectStates.set(resolvedWorkdir, {
            lastSessionId: String(rawProjectState?.lastSessionId || "").trim(),
            lastMode:
              rawProjectState?.lastMode === "pty" ||
              rawProjectState?.lastMode === "exec" ||
              rawProjectState?.lastMode === "sdk"
                ? rawProjectState.lastMode
                : null,
            lastExitCode:
              rawProjectState?.lastExitCode === null ||
              rawProjectState?.lastExitCode === undefined
                ? null
                : Number(rawProjectState.lastExitCode),
            lastExitSignal:
              rawProjectState?.lastExitSignal === null ||
              rawProjectState?.lastExitSignal === undefined
                ? null
                : (rawProjectState.lastExitSignal as ExitSignal),
            lastWorkflowPhase: isWorkflowPhase(
              rawProjectState?.lastWorkflowPhase
            )
              ? rawProjectState.lastWorkflowPhase
              : null,
            lastPromptText:
              typeof rawProjectState?.lastPromptText === "string" &&
              rawProjectState.lastPromptText.trim()
                ? rawProjectState.lastPromptText.trim()
                : null,
            lastPromptAt:
              typeof rawProjectState?.lastPromptAt === "string" &&
              rawProjectState.lastPromptAt.trim()
                ? rawProjectState.lastPromptAt.trim()
                : null,
            lastFinalResponseText:
              typeof rawProjectState?.lastFinalResponseText === "string" &&
              rawProjectState.lastFinalResponseText.trim()
                ? rawProjectState.lastFinalResponseText.trim()
                : null,
            lastFinalizedAt:
              typeof rawProjectState?.lastFinalizedAt === "string" &&
              rawProjectState.lastFinalizedAt.trim()
                ? rawProjectState.lastFinalizedAt.trim()
                : null
          });
        }
      }

      if (!projectStates.has(currentWorkdir)) {
        projectStates.set(currentWorkdir, {
          lastSessionId: "",
          lastMode: null,
          lastExitCode: null,
          lastExitSignal: null,
          lastWorkflowPhase: null,
          lastPromptText: null,
          lastPromptAt: null,
          lastFinalResponseText: null,
          lastFinalizedAt: null
        });
      }

      const promptQueue: QueuedPromptRequest[] = [];
      if (Array.isArray(rawState?.promptQueue)) {
        for (const rawQueueItem of rawState.promptQueue) {
          if (!rawQueueItem || typeof rawQueueItem !== "object") {
            continue;
          }

          const candidate = rawQueueItem as Partial<StoredQueuedPromptRequest>;
          const workdir = this.resolveStoredWorkdir(candidate.workdir);
          const prompt = this.restorePromptInput(candidate.prompt);
          if (!workdir || !prompt) {
            continue;
          }

          promptQueue.push({
            id:
              typeof candidate.id === "string" && candidate.id.trim()
                ? candidate.id.trim()
                : createQueueId(),
            prompt,
            workdir,
            options:
              candidate.options && typeof candidate.options === "object"
                ? clonePromptOptionsForQueue(candidate.options)
                : {},
            createdAt:
              typeof candidate.createdAt === "string" &&
              candidate.createdAt.trim()
                ? candidate.createdAt.trim()
                : new Date().toISOString()
          });
        }
      }

      this.chatState.set(String(chatId), {
        preferredModel:
          typeof rawState?.preferredModel === "string" &&
          rawState.preferredModel.trim()
            ? rawState.preferredModel.trim()
            : null,
        language: toLocale(
          normalizeLanguage(String(rawState?.language || "")) || "pt-BR"
        ),
        verboseOutput: Boolean(rawState?.verboseOutput),
        currentWorkdir,
        recentWorkdirs: [
          currentWorkdir,
          ...recentWorkdirs.filter((workdir) => workdir !== currentWorkdir)
        ].slice(0, 6),
        ptySupported: null,
        pendingPrompt: null,
        promptQueue: promptQueue.slice(0, MAX_PROMPT_QUEUE_SIZE),
        projectStates
      });
    }
  }

  getStatus(chatId: string | number): PtyManagerStatus {
    const key = String(chatId);
    const state = this.ensureChatState(key);
    const projectState = this.ensureProjectState(key, state.currentWorkdir);
    const session = this.sessions.get(key);

    return {
      backend: this.config.runner.backend,
      active: Boolean(session),
      activeMode: session?.mode || null,
      lastMode: projectState.lastMode,
      lastExitCode: projectState.lastExitCode,
      lastExitSignal: projectState.lastExitSignal,
      projectSessionId: projectState.lastSessionId || null,
      preferredModel: state.preferredModel,
      language: this.getLanguage(key),
      verboseOutput: Boolean(state.verboseOutput),
      ptySupported:
        this.config.runner.backend === "sdk" ? null : state.ptySupported,
      workdir: this.getWorkdir(key),
      relativeWorkdir: this.getRelativeWorkdir(key),
      workspaceRoot: this.config.workspace.root,
      command: this.config.runner.command,
      mcpServers: this.config.mcp.servers.map((server) => server.name),
      workflowSystem: "superpowers",
      workflowPhase: session
        ? (session.workflowPhase ?? "working")
        : (projectState.lastWorkflowPhase ?? "none")
    };
  }

  setPreferredModel(chatId: string | number, model: string): string | null {
    const state = this.ensureChatState(chatId);
    state.preferredModel = model?.trim() || null;
    this.onChange?.(this.exportState());
    return state.preferredModel;
  }

  clearPreferredModel(chatId: string | number): void {
    const state = this.ensureChatState(chatId);
    state.preferredModel = null;
    this.onChange?.(this.exportState());
  }
}
