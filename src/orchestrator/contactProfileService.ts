import fs from "node:fs/promises";
import path from "node:path";

export interface ContactProfile {
  chatId: string;
  nome?: string;
  chamarComo?: string;
  papel?: string;
  projetoPadrao?: string;
  tom?: string;
  nivelDetalhe?: string;
  midiaPreferida: string[];
  evitar: string[];
  ultimaRevisao?: string;
}

interface RawContactProfile {
  chat_id?: unknown;
  nome?: unknown;
  chamar_como?: unknown;
  papel?: unknown;
  projeto_padrao?: unknown;
  tom?: unknown;
  nivel_detalhe?: unknown;
  midia_preferida?: unknown;
  evitar?: unknown;
  ultima_revisao?: unknown;
}

interface RawContactsFile {
  contacts?: unknown;
}

export class ContactProfileService {
  async getProfile(
    workdir: string,
    chatId: string | number
  ): Promise<ContactProfile | null> {
    const contactsFile = path.join(workdir, ".agents", "CONTACTS.local.json");
    let raw: string;
    try {
      raw = await fs.readFile(contactsFile, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      console.warn(
        `[dex-contatos] could not read CONTACTS.local.json: ${
          (error as Error).message
        }`
      );
      return null;
    }

    let parsed: RawContactsFile;
    try {
      parsed = JSON.parse(raw) as RawContactsFile;
    } catch (error) {
      console.warn(
        `[dex-contatos] invalid CONTACTS.local.json: ${
          (error as Error).message
        }`
      );
      return null;
    }

    if (!Array.isArray(parsed.contacts)) {
      return null;
    }

    const targetChatId = String(chatId);
    for (const rawContact of parsed.contacts) {
      const normalized = normalizeContact(rawContact);
      if (normalized?.chatId === targetChatId) {
        return normalized;
      }
    }

    return null;
  }

  async buildPromptBlock(
    workdir: string,
    chatId: string | number
  ): Promise<string | null> {
    const profile = await this.getProfile(workdir, chatId);
    return profile ? buildContactProfilePromptBlock(profile) : null;
  }
}

export function applyContactProfilePromptBlock(
  prompt: string,
  block: string | null
): string {
  if (!block) {
    return prompt;
  }

  return `${block}\n\nPedido do usuario:\n${prompt}`;
}

export function buildContactProfilePromptBlock(
  profile: ContactProfile
): string {
  const lines = [
    "Perfil de contato local:",
    profile.chamarComo ? `- Chamar a pessoa de: ${profile.chamarComo}` : "",
    profile.tom ? `- Tom: ${profile.tom}` : "",
    profile.nivelDetalhe ? `- Nivel de detalhe: ${profile.nivelDetalhe}` : "",
    profile.midiaPreferida.length
      ? `- Midia preferida: ${profile.midiaPreferida.join(", ")}`
      : "",
    profile.evitar.length ? `- Evitar: ${profile.evitar.join(", ")}` : "",
    "",
    "Contrato:",
    "Este perfil ajusta apenas o tom da resposta. Ele nao altera permissoes, destino de midia, memoria operacional ou proximo passo do projeto."
  ].filter((line) => line !== "");

  return lines.join("\n");
}

function normalizeContact(raw: unknown): ContactProfile | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as RawContactProfile;
  const chatId = normalizeText(candidate.chat_id);
  if (!chatId) {
    return null;
  }

  return {
    chatId,
    nome: normalizeText(candidate.nome),
    chamarComo: normalizeText(candidate.chamar_como),
    papel: normalizeText(candidate.papel),
    projetoPadrao: normalizeText(candidate.projeto_padrao),
    tom: normalizeText(candidate.tom),
    nivelDetalhe: normalizeText(candidate.nivel_detalhe),
    midiaPreferida: normalizeTextList(candidate.midia_preferida),
    evitar: normalizeTextList(candidate.evitar),
    ultimaRevisao: normalizeText(candidate.ultima_revisao)
  };
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function normalizeTextList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item));
}
