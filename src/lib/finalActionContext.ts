function stripInlineFormatting(input: string): string {
  return String(input || "")
    .replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, "$1")
    .replace(/[*~]/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLine(line: string): string {
  return stripInlineFormatting(
    String(line || "")
      .replace(/^(?:[-*\u2022\u2013\u2014]\s*)+/, "")
      .trim()
  );
}

function normalizeHeadingLabel(value: string): string {
  return stripInlineFormatting(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractLabeledValue(
  input: string,
  labels: Set<string>
): string | null {
  const lines = String(input || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const normalizedLine = cleanLine(lines[index] || "");
    const inlineMatch = normalizedLine.match(/^([^:]+):\s*(.*)$/);

    if (inlineMatch) {
      const label = normalizeHeadingLabel(inlineMatch[1] || "");
      const value = inlineMatch[2] || "";
      if (labels.has(label)) {
        if (value.trim()) {
          return cleanLine(value);
        }
        const nextLine = lines[index + 1];
        if (nextLine) {
          return cleanLine(nextLine);
        }
      }
      continue;
    }

    if (labels.has(normalizeHeadingLabel(normalizedLine))) {
      const nextLine = lines[index + 1];
      if (nextLine) {
        return cleanLine(nextLine);
      }
    }
  }

  return null;
}

const NEXT_STEP_LABELS = new Set([
  "proximo passo",
  "proximo passo indicado",
  "immediate next step"
]);

const RECOMMENDED_STEP_LABELS = new Set([
  "proximo passo recomendado",
  "recommended next step",
  "recommended action"
]);

const NEXT_SPECIALIST_LABELS = new Set([
  "proximo especialista indicado",
  "next specialist indicated"
]);

export function extractFinalResponseNextStep(input: string): string | null {
  return extractLabeledValue(input, NEXT_STEP_LABELS);
}

export function extractFinalResponseRecommendedStep(
  input: string
): string | null {
  return extractLabeledValue(input, RECOMMENDED_STEP_LABELS);
}

export function extractFinalResponseNextSpecialist(
  input: string
): string | null {
  return extractLabeledValue(input, NEXT_SPECIALIST_LABELS);
}
