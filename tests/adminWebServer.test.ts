import test from "node:test";
import assert from "node:assert/strict";
import { AdminWebServer } from "../src/lib/adminWebServer.js";

test("admin web server renders the dashboard snapshot as HTML", async () => {
  const server = new AdminWebServer({
    inspect: async (workdir: string) => ({
      workdir,
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
        items: [
          {
            source: "builtin",
            selector: "builtin:0",
            label: "Retomar trabalho",
            intent: "continue",
            removable: false
          }
        ],
        capabilities: [
          "listBuiltins",
          "listCustom",
          "createCustom",
          "removeCustom"
        ]
      },
      history: {
        candidates: [
          {
            selector: "candidate:cand-1",
            id: "cand-1",
            title: "Bloco validado",
            summary: "Resumo curto",
            kind: "task_state",
            stage: "durable_memory",
            baseKind: "task_state",
            scope: "project",
            destination: "memory",
            confidence: 0.8,
            createdAt: "2026-04-22T00:00:00.000Z"
          }
        ],
        proposals: [
          {
            selector: "proposal:prop-1",
            id: "prop-1",
            candidateSelector: "candidate:cand-1",
            candidateId: "cand-1",
            destination: "memory",
            title: "Promover bloco",
            summary: "Resumo curto",
            kind: "task_state",
            stage: "proposal_review",
            confidence: 0.8,
            createdAt: "2026-04-22T00:00:00.000Z",
            reason: "Manual review requested.",
            hasSkillDraft: false
          }
        ],
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
    })
  } as any);

  try {
    const link = await server.getLink("C:/CodexProjetos/dex-agent");
    const response = await fetch(link);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /Dashboard admin funcionando/i);
    assert.match(html, /candidate:cand-1/i);
    assert.match(html, /proposal:prop-1/i);
    assert.match(html, /Retomar trabalho/i);
  } finally {
    await server.shutdown();
  }
});
