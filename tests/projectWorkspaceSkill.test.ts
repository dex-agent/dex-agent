import test from "node:test";
import assert from "node:assert/strict";
import { ProjectWorkspaceSkill } from "../src/orchestrator/skills/projectWorkspaceSkill.js";

const projects = [
  {
    name: "AgendadorConsultasOticas",
    path: "C:/CodexProjetos/AgendadorConsultasOticas",
    relativePath: "AgendadorConsultasOticas"
  },
  {
    name: "ControlePessoal",
    path: "C:/CodexProjetos/ControlePessoal",
    relativePath: "ControlePessoal"
  }
];

function createSkill() {
  return new ProjectWorkspaceSkill({
    workspace: {
      listProjects: () => projects,
      getRecentProjects: () => [
        {
          path: projects[0].path,
          relativePath: projects[0].relativePath
        },
        {
          path: projects[1].path,
          relativePath: projects[1].relativePath
        }
      ],
      getCurrentProject: () => ({
        path: projects[0].path,
        relativePath: projects[0].relativePath
      })
    }
  });
}

function createFixedInstanceSkill() {
  return new ProjectWorkspaceSkill({
    workspace: {
      listProjects: () => projects,
      getRecentProjects: () => [
        {
          path: projects[0].path,
          relativePath: projects[0].relativePath
        },
        {
          path: projects[1].path,
          relativePath: projects[1].relativePath
        }
      ],
      getCurrentProject: () => ({
        path: projects[0].path,
        relativePath: projects[0].relativePath
      })
    },
    fixedInstance: {
      enabled: true,
      projectLabel: "AgendadorConsultasOticas"
    }
  });
}

test("project workspace skill recognizes standard project navigation intents", () => {
  const skill = createSkill();

  assert.equal(
    skill.supports("Mude agora para o projeto Controle Pessoal."),
    true
  );
  assert.equal(
    skill.supports("Pesquise aonde fica o projeto controle pessoal."),
    true
  );
  assert.equal(skill.supports("liste os projetos"), true);
  assert.equal(skill.supports("volte para o projeto anterior"), true);
  assert.equal(skill.supports("qual sprint atual?"), false);
});

test("project workspace skill switches to a matched project by natural language", async () => {
  const skill = createSkill();

  const result = await skill.execute({
    text: "Mude agora para o projeto Controle Pessoal.",
    chatId: 1
  });

  assert.equal(result.switchToRepo, "ControlePessoal");
  assert.match(result.text, /Projeto alterado/i);
});

test("project workspace skill can locate a project without switching", async () => {
  const skill = createSkill();

  const result = await skill.execute({
    text: "Pesquise aonde fica o projeto controle pessoal.",
    chatId: 1
  });

  assert.equal(result.switchToRepo, undefined);
  assert.match(result.text, /Projeto encontrado/i);
  assert.match(result.text, /ControlePessoal/);
});

test("project workspace skill lists recent projects and can return to the previous one", async () => {
  const skill = createSkill();

  const recent = await skill.execute({
    text: "mostre os projetos recentes",
    chatId: 1
  });
  const previous = await skill.execute({
    text: "volte para o projeto anterior",
    chatId: 1
  });

  assert.match(recent.text, /Projetos recentes/i);
  assert.equal(previous.switchToRepo, "ControlePessoal");
});

test("project workspace skill blocks natural language switching in fixed instance mode", async () => {
  const skill = createFixedInstanceSkill();

  const result = await skill.execute({
    text: "Mude agora para o projeto Controle Pessoal.",
    chatId: 1
  });

  assert.equal(result.switchToRepo, undefined);
  assert.match(result.text, /Instancia fixa/i);
  assert.match(result.text, /AgendadorConsultasOticas/);
});
