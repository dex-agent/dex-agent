import path from "node:path";
import {
  HistoryAdminService,
  type HistoryAdminCandidateItem,
  type HistoryAdminProposalItem
} from "./historyAdminService.js";
import {
  PromptAdminService,
  type PromptAdminItem
} from "./promptAdminService.js";

export interface DashboardAdminModuleState {
  key: "prompts" | "history" | "operation" | "settings";
  label: string;
  status: "enabled" | "planned";
  mode: "editable" | "read-only";
  reason: string | null;
}

export interface DashboardAdminSnapshot {
  workdir: string;
  modules: DashboardAdminModuleState[];
  prompts: {
    items: PromptAdminItem[];
    capabilities: Array<
      "listBuiltins" | "listCustom" | "createCustom" | "removeCustom"
    >;
  };
  history: {
    candidates: HistoryAdminCandidateItem[];
    proposals: HistoryAdminProposalItem[];
    capabilities: Array<
      | "listCandidates"
      | "listProposals"
      | "explainCandidate"
      | "discardCandidate"
      | "proposePromotion"
      | "cancelProposal"
    >;
  };
  operation: {
    enabled: false;
    reason: string;
  };
  settings: {
    enabled: false;
    reason: string;
  };
}

export class DashboardAdminService {
  constructor(
    private readonly promptAdminService = new PromptAdminService(),
    private readonly historyAdminService = new HistoryAdminService()
  ) {}

  async inspect(workdir: string): Promise<DashboardAdminSnapshot> {
    const resolvedWorkdir = path.resolve(workdir);
    const [promptItems, historyState] = await Promise.all([
      this.promptAdminService.listPromptAdminItems(resolvedWorkdir),
      this.historyAdminService.listHistoryAdminState(resolvedWorkdir)
    ]);

    return {
      workdir: resolvedWorkdir,
      modules: [
        {
          key: "prompts",
          label: "Prompts",
          status: "enabled",
          mode: "editable",
          reason: null
        },
        {
          key: "history",
          label: "Historico",
          status: "enabled",
          mode: "editable",
          reason: null
        },
        {
          key: "operation",
          label: "Operacao",
          status: "planned",
          mode: "read-only",
          reason: "Ainda falta uma fronteira dedicada para mutacoes de fila."
        },
        {
          key: "settings",
          label: "Configuracoes",
          status: "planned",
          mode: "read-only",
          reason:
            "Ainda nao existe um ConfigService proprio para escrita segura."
        }
      ],
      prompts: {
        items: promptItems,
        capabilities: [
          "listBuiltins",
          "listCustom",
          "createCustom",
          "removeCustom"
        ]
      },
      history: {
        candidates: historyState.candidates,
        proposals: historyState.proposals,
        capabilities: [
          "listCandidates",
          "listProposals",
          "explainCandidate",
          "discardCandidate",
          "proposePromotion",
          "cancelProposal"
        ]
      },
      operation: {
        enabled: false,
        reason: "Mutacoes de fila continuam fora do v1."
      },
      settings: {
        enabled: false,
        reason: "Configuracoes seguem em leitura ate existir fronteira segura."
      }
    };
  }
}
