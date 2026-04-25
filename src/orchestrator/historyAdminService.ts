import path from "node:path";
import {
  ProjectMemoryService,
  type MemoryCandidate,
  type MemoryStage,
  type MemoryWriteProposal
} from "./memoryService.js";

export interface HistoryAdminCandidateItem {
  selector: string;
  id: string;
  title: string;
  summary: string;
  kind: MemoryCandidate["kind"];
  stage: MemoryStage | null;
  baseKind: MemoryCandidate["baseKind"];
  scope: MemoryCandidate["scope"];
  destination: MemoryCandidate["destination"] | null;
  confidence: number;
  createdAt: string;
}

export interface HistoryAdminProposalItem {
  selector: string;
  id: string;
  candidateSelector: string;
  candidateId: string;
  destination: MemoryWriteProposal["destination"];
  title: string;
  summary: string;
  kind: MemoryWriteProposal["entry"]["kind"];
  stage: MemoryWriteProposal["entry"]["stage"] | null;
  confidence: number;
  createdAt: string;
  reason: string;
  hasSkillDraft: boolean;
}

function toCandidateItem(
  candidate: MemoryCandidate
): HistoryAdminCandidateItem {
  return {
    selector: `candidate:${candidate.id}`,
    id: candidate.id,
    title: candidate.title,
    summary: candidate.summary,
    kind: candidate.kind,
    stage: candidate.stage || null,
    baseKind: candidate.baseKind,
    scope: candidate.scope,
    destination: candidate.destination || null,
    confidence: candidate.confidence,
    createdAt: candidate.createdAt
  };
}

function toProposalItem(
  proposal: MemoryWriteProposal
): HistoryAdminProposalItem {
  return {
    selector: `proposal:${proposal.id}`,
    id: proposal.id,
    candidateSelector: `candidate:${proposal.candidateId}`,
    candidateId: proposal.candidateId,
    destination: proposal.destination,
    title: proposal.entry.title,
    summary: proposal.entry.summary,
    kind: proposal.entry.kind,
    stage: proposal.entry.stage || null,
    confidence: proposal.entry.confidence,
    createdAt: proposal.createdAt,
    reason: proposal.reason,
    hasSkillDraft: Boolean(proposal.skillDraft)
  };
}

function resolveHistorySelector(
  selector: string,
  expectedPrefix: "candidate" | "proposal"
): string {
  const normalized = String(selector || "").trim();
  if (!normalized) {
    throw new Error("history_admin_selector_required");
  }

  const prefixed = `${expectedPrefix}:`;
  if (normalized.startsWith(prefixed)) {
    const id = normalized.slice(prefixed.length).trim();
    if (!id) {
      throw new Error("history_admin_selector_invalid");
    }
    return id;
  }

  throw new Error("history_admin_selector_invalid");
}

export class HistoryAdminService {
  constructor(private readonly memoryService = new ProjectMemoryService()) {}

  async listHistoryAdminState(workdir: string): Promise<{
    candidates: HistoryAdminCandidateItem[];
    proposals: HistoryAdminProposalItem[];
  }> {
    const resolvedWorkdir = path.resolve(workdir);
    const [candidates, proposals] = await Promise.all([
      this.memoryService.listCandidates(resolvedWorkdir),
      this.memoryService.listProposals(resolvedWorkdir)
    ]);

    return {
      candidates: candidates.map(toCandidateItem),
      proposals: proposals.map(toProposalItem)
    };
  }

  async explainHistoryCandidate(
    workdir: string,
    selector: string
  ): Promise<string | null> {
    const resolvedWorkdir = path.resolve(workdir);
    const candidateId = resolveHistorySelector(selector, "candidate");
    return this.memoryService.explainCandidate(resolvedWorkdir, candidateId);
  }

  async discardHistoryCandidate(
    workdir: string,
    selector: string
  ): Promise<HistoryAdminCandidateItem | null> {
    const resolvedWorkdir = path.resolve(workdir);
    const candidateId = resolveHistorySelector(selector, "candidate");
    const discarded = await this.memoryService.discardCandidate(
      resolvedWorkdir,
      candidateId
    );
    return discarded ? toCandidateItem(discarded) : null;
  }

  async proposeHistoryCandidate(
    workdir: string,
    selector: string
  ): Promise<HistoryAdminProposalItem | null> {
    const resolvedWorkdir = path.resolve(workdir);
    const candidateId = resolveHistorySelector(selector, "candidate");
    const proposal = await this.memoryService.proposePromotion(
      resolvedWorkdir,
      candidateId
    );
    return proposal ? toProposalItem(proposal) : null;
  }

  async cancelHistoryProposal(
    workdir: string,
    selector: string
  ): Promise<HistoryAdminProposalItem | null> {
    const resolvedWorkdir = path.resolve(workdir);
    const proposalId = resolveHistorySelector(selector, "proposal");
    const proposal = await this.memoryService.cancelProposal(
      resolvedWorkdir,
      proposalId
    );
    return proposal ? toProposalItem(proposal) : null;
  }
}
