# Dex Agent Index

Atualizado em: `2026-04-22T10:03:33-03:00`
Surface version: `7`
Papel: `camada 1 - superficie canonica de retomada`

## Agora

- Projeto atual: `Dex Agent`
- Objetivo atual: usar este workspace como projeto dedicado do bot, com continuidade propria e retomada sem depender da thread de `ConfiguracoesWindows`
- Estado do runtime: bot validado nesta maquina; confirmar por `scripts/status-dex-agent.ps1` quando a retomada exigir prova viva
- Bloco mais recente: `ux Telegram - semantica deterministica dos botoes`
- Status do bloco mais recente: `100% concluido`
- Proximo passo indicado: `publicacao GitHub`

## Como usar este arquivo

1. Leia este `INDEX.md` primeiro para decidir o caminho.
2. Escolha uma entrada abaixo pelo `entry_id` ou pelo titulo.
3. So depois abra a camada 2 ou a camada 3 correspondente.
4. Use busca textual apenas como fallback; o metodo padrao aqui e navegar por ponteiros explicitos.

## Mapa de camadas

- Camada 1: `INDEX.md`
- Camada 2: `.agents/PROJECT.md`, `.agents/ACTIVE.md`, `.agents/HANDOFF.md`, `.codex/napkin.md`
- Camada 3: `docs/`, `skills/`, `.agents/sprints/`, `.agents/archive/`
- Ledger operacional: `.agents/MEMORY.ndjson`

## Entradas ativas

### `resume.current-state`

- updated_at: `2026-04-22T06:40:32-03:00`
- status: `ativo`
- resumo: estado atual do repo, loops abertos, blockers e contexto minimo para retomar sem depender da thread
- camada 2:
  - `.agents/PROJECT.md`
  - `.agents/ACTIVE.md`
  - `.agents/HANDOFF.md`
  - `.codex/napkin.md`
- camada 3:
  - `docs/context/001-dex-agent-separacao.md`

### `memory.layered-recall`

- updated_at: `2026-04-22T06:40:32-03:00`
- status: `ativo`
- resumo: contrato canonico de memoria em camadas, incluindo superficie, camada 2 de uso e profundidade
- camada 2:
  - `.agents/PROJECT.md`
  - `.agents/ACTIVE.md`
  - `.agents/HANDOFF.md`
  - `.codex/napkin.md`
- camada 3:
  - `docs/memory-system/README.md`
  - `.agents/sprints/2026-04-22-memoria-em-camadas-e-index-de-retomada.md`
  - `.agents/sprints/2026-04-22-camada-2-contexto-de-uso-e-fechamento-padrao.md`

### `progress.closeout-standard`

- updated_at: `2026-04-22T06:40:32-03:00`
- status: `ativo`
- resumo: metodo padrao para fechar sprint ou bloco com quadro completo de progresso, proximo passo e retrocesso padrao
- camada 2:
  - `.agents/HANDOFF.md`
  - `.agents/ACTIVE.md`
- camada 3:
  - `docs/memory-system/README.md`
  - `.agents/sprints/2026-04-22-camada-2-contexto-de-uso-e-fechamento-padrao.md`

### `docs.recovery-governance`

- updated_at: `2026-04-22T06:40:32-03:00`
- status: `ativo`
- resumo: entrypoints humanos e regra de governanca que ligam retomada, metodo e contrato
- camada 2:
  - `.agents/HANDOFF.md`
  - `.agents/ACTIVE.md`
  - `.codex/napkin.md`
- camada 3:
  - `README.md`
  - `docs/memory-system/README.md`
  - `skills/README.md`
  - `.agents/sprints/2026-04-22-docs-e-governanca-alinhamento.md`

### `engine.recovery-runtime`

- updated_at: `2026-04-22T07:10:10-03:00`
- status: `ativo`
- resumo: o motor agora consome `INDEX`, `PROJECT` e `Current block status`, expoe essas superficies no bot e endurece auto-promocao por `metodo + contrato`
- camada 2:
  - `.agents/PROJECT.md`
  - `.agents/ACTIVE.md`
  - `.agents/HANDOFF.md`
  - `.codex/napkin.md`
- camada 3:
  - `README.md`
  - `docs/memory-system/README.md`
  - `.agents/sprints/2026-04-22-alinhamento-do-motor-de-retomada.md`

### `memory.legacy-normalization`

- updated_at: `2026-04-22T08:44:00-03:00`
- status: `concluido`
- resumo: sprint fechado com lote 1 e lote 2 triados, inbox viva protegida fora do corte, nenhum item promovido para camada 1 e metodo repetivel registrado para novos lotes
- camada 2:
  - `.agents/ACTIVE.md`
  - `.agents/HANDOFF.md`
- camada 3:
  - `.agents/sprints/2026-04-22-normalizacao-recorrente-de-memorias-antigas.md`

### `memory.inbox-skill-candidate-triage`

- updated_at: `2026-04-22T16:35:00-03:00`
- status: `concluido`
- resumo: a triagem limpou os falsos positivos de `skill_candidate`; a inbox ficou sem candidato de skill pendente e o proximo corte passa a ser heuristica
- camada 2:
  - `.agents/ACTIVE.md`
  - `.agents/HANDOFF.md`
- camada 3:
  - `.agents/sprints/2026-04-22-triagem-da-inbox-skill-candidate.md`

### `memory.skill-candidate-heuristics`

- updated_at: `2026-04-22T08:54:41-03:00`
- status: `concluido`
- resumo: o `memoryService` agora bloqueia respostas finalizadas com cara de fechamento, veredito, reuniao, plano ou cabecalho de fase antes que elas virem `skill_candidate`
- camada 2:
  - `.agents/ACTIVE.md`
  - `.agents/HANDOFF.md`
- camada 3:
  - `.agents/sprints/2026-04-22-memoryservice-heuristica-skill-candidate.md`

### `memory.candidate-deep-review`

- updated_at: `2026-04-22T12:24:00-03:00`
- status: `ativo`
- resumo: skill dedicada para revisao profunda de `memory candidate` e `skill_candidate`, ja validada em uma rodada real; a limpeza manual inicial funcionou, mas a captura viva reabriu a inbox e o bloqueio agora e o writer/runtime
- camada 2:
  - `.agents/ACTIVE.md`
  - `.agents/HANDOFF.md`
- camada 3:
  - `skills/avaliador-memory-candidate/SKILL.md`
  - `.agents/sprints/2026-04-22-avaliador-memory-candidate.md`
  - `.agents/sprints/2026-04-22-avaliador-memory-candidate-primeira-rodada-real.md`
  - `.agents/sprints/2026-04-22-captura-viva-reabre-inbox.md`

### `runtime.status-observability`

- updated_at: `2026-04-22T15:10:00-03:00`
- status: `concluido`
- resumo: `/status` e o status rapido agora combinam runtime bruto com estado operacional vivo, distinguindo trabalho ativo, fila, espera de fechamento e silencio prolongado
- camada 2:
  - `.agents/ACTIVE.md`
  - `.agents/HANDOFF.md`
  - `.codex/napkin.md`
- camada 3:
  - `.agents/sprints/2026-04-22-status-e-observabilidade.md`
  - `README.md`

### `ux.telegram.response-clarity`

- updated_at: `2026-04-22T16:05:00-03:00`
- status: `concluido`
- resumo: a frente de UX final agora ficou com texto curto, preview sanitizado e botoes que prometem exatamente uma acao especifica de follow-up, sem vender aprovacao total do plano
- camada 2:
  - `.agents/ACTIVE.md`
  - `.agents/HANDOFF.md`
- camada 3:
  - `.agents/sprints/2026-04-22-ux-telegram-acoes-finais-claras.md`
  - `.agents/sprints/2026-04-22-ux-telegram-poluicao-visual-residual.md`
  - `.agents/sprints/2026-04-22-ux-telegram-semantica-deterministica-dos-botoes.md`

### `skills.governance`

- updated_at: `2026-04-22T06:40:32-03:00`
- status: `ativo`
- resumo: classificacao entre skill local, skill global espelhada e metodo padrao de promocao
- camada 2:
  - `.agents/ACTIVE.md`
  - `.agents/HANDOFF.md`
- camada 3:
  - `skills/README.md`
  - `skills/promocao-memoria-para-skill/SKILL.md`
  - `skills/promocao-memoria-para-skill/README.md`

### `audio.explicativo`

- updated_at: `2026-04-22T06:40:32-03:00`
- status: `ativo`
- resumo: fluxo canonico para enviar audio explicativo pelo proprio bot com prova por `message_id`
- camada 2:
  - `.agents/HANDOFF.md`
  - `.agents/ACTIVE.md`
- camada 3:
  - `.agents/sprints/2026-04-22-audio-explicativo-reuso.md`
  - `skills/dex-agent-audio-summary/SKILL.md`

### `worktree.cleanup-boundary`

- updated_at: `2026-04-22T06:27:45-03:00`
- status: `estacionado`
- resumo: snapshot do que esta estacionado e do que nao deve ser limpo destrutivamente
- camada 2:
  - `.agents/ACTIVE.md`
  - `.agents/HANDOFF.md`
- camada 3:
  - `.agents/archive/2026-04-22-worktree-sujeira-estacionada-revisao-2.md`

## Quando abrir qual arquivo

- Quer entender o projeto e as restricoes estaveis: abra `.agents/PROJECT.md`
- Quer saber o que esta vivo agora: abra `.agents/ACTIVE.md`
- Quer retomar sem pensar muito: abra `.agents/HANDOFF.md`
- Quer regra tatica recorrente: abra `.codex/napkin.md`
- Quer explicacao profunda, tutorial ou governanca: siga para a camada 3 indicada pela entrada

## Fora do foco agora

- automatizar a normalizacao recorrente como skill ou agente antes de provar o metodo em lotes reais
- expansao imediata deste padrao para todos os repositorios
- redesign do `/inbox`, `/memory` e `/project`
