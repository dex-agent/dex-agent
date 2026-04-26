export function extractCommandPayload(
  rawText = "",
  commandName: string
): string {
  const pattern = new RegExp(`^\\/${commandName}(?:@\\w+)?\\s*`, "i");
  return String(rawText).replace(pattern, "").trim();
}

function levenshteinDistance(a: string, b: string): number {
  const left = String(a);
  const right = String(b);
  const dp = Array.from({ length: left.length + 1 }, () =>
    new Array(right.length + 1).fill(0)
  );

  for (let i = 0; i <= left.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[left.length][right.length];
}

export function suggestClosestWord(
  input: string,
  candidates: Iterable<string | null | undefined>,
  maxDistance = 2
): string {
  const normalizedInput = String(input || "")
    .trim()
    .toLowerCase();
  if (!normalizedInput) return "";

  let best = "";
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const normalizedCandidate = String(candidate || "")
      .trim()
      .toLowerCase();
    if (!normalizedCandidate) continue;

    const distance = levenshteinDistance(normalizedInput, normalizedCandidate);
    if (distance < bestDistance) {
      best = normalizedCandidate;
      bestDistance = distance;
    }
  }

  return bestDistance <= maxDistance ? best : "";
}

export interface PlanPromptOptions {
  immediateContext?: string | null;
}

const MAX_PLAN_IMMEDIATE_CONTEXT_CHARS = 9000;

function normalizeForPlanContext(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function compactPlanImmediateContext(value: string): string {
  const normalized = String(value || "")
    .replace(/\r/g, "")
    .trim();

  if (normalized.length <= MAX_PLAN_IMMEDIATE_CONTEXT_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_PLAN_IMMEDIATE_CONTEXT_CHARS - 80).trimEnd()}\n\n[contexto imediato truncado para manter o prompt seguro]`;
}

export function shouldAttachImmediateContextToPlan(task: string): boolean {
  const normalized = normalizeForPlanContext(task);

  return /\b(em cima daqui|a partir daqui|daqui|disso|isso|isto|acima|anterior|ultima resposta|resposta anterior|conversa anterior|conversa acima|achado|achados|finding|findings|review|revisao|relatorio|sugestao|sugestoes|indicacao|indicacoes|levantado|levantados|consolidar tudo|planejamento total)\b/i.test(
    normalized
  );
}

export function buildPlanPrompt(
  task: string,
  options: PlanPromptOptions = {}
): string {
  const immediateContext = options.immediateContext
    ? compactPlanImmediateContext(options.immediateContext)
    : "";
  const contextLines = immediateContext
    ? [
        "Immediate conversation context (primary source for this planning request):",
        immediateContext,
        "",
        "Source priority rules:",
        '- Treat the immediate conversation context above as the primary source when the task mentions findings, achados, review, relatorio, sugestoes, indicacoes, or "daqui".',
        "- Use durable project memory, HANDOFF, ACTIVE, and old backlog only as boundaries or fallback; do not replace the current planning target with older project state.",
        "- Carry each concrete Finding/P0/P1/P2/P3, risk, residue, and next-specialist signal into the plan, or explain explicitly why it is excluded.",
        ""
      ]
    : [];

  return [
    "Planning mode only.",
    "Analyze the request and respond with a concise execution plan.",
    "Do not modify files.",
    "Do not run write commands.",
    "Do not claim you already made changes.",
    ...contextLines,
    "",
    "Task:",
    task
  ].join("\n");
}
