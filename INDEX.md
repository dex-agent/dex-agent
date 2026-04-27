# Dex Agent Index

Atualizado em: `2026-04-27T00:00:00-03:00`
Surface version: `13`
Papel: `camada 1 - catalogo rapido de retomada`

## Agora

- Projeto atual: `Dex Agent`
- Objetivo atual: usar este workspace como projeto dedicado do bot, com continuidade propria e retomada sem depender da thread de `ConfiguracoesWindows`
- Estado do runtime: bot validado nesta maquina; confirmar por `scripts/status-dex-agent.ps1` quando a retomada exigir prova viva
- Bloco mais recente: `dex memoria lifecycle bootstrap`
- Status do bloco mais recente: `100% concluido`
- Proximo passo indicado: `operacao normal por demanda; scripts V2 da dex-memoria continuam futuro`

## Regra de leitura

- `INDEX` localiza; nao explica.
- Abra primeiro a entrada mais aderente ao pedido.
- So depois siga os ponteiros de camada 2 e camada 3.
- Use busca textual apenas como fallback.

## Camadas

- Camada 1: `INDEX.md`
- Camada 2: `.agents/PROJECT.md`, `.agents/ACTIVE.md`, `.agents/HANDOFF.md`, `.codex/napkin.md`
- Camada 3: `docs/`, `skills/`, `.agents/sprints/`, `.agents/archive/`
- Ledger operacional: `.agents/MEMORY.ndjson`

## Catalogo

- `resume.current-state` | `ativo` | retomada curta do repo sem depender da thread | L2: `PROJECT`, `ACTIVE`, `HANDOFF`, `napkin` | L3: `docs/context/001-dex-agent-separacao.md`
- `memory.layered-recall` | `ativo` | contrato de memoria em camadas e uso das superficies | L2: `PROJECT`, `ACTIVE`, `HANDOFF`, `napkin` | L3: `docs/memory-system/README.md`, `2026-04-22-memoria-em-camadas-e-index-de-retomada.md`, `2026-04-22-camada-2-contexto-de-uso-e-fechamento-padrao.md`
- `memory.dex-memoria-lifecycle` | `concluido` | protocolo pratico de ciclo de vida da memoria operacional no pai e filhos; `docs/memory-system` segue como arquitetura/runtime | L2: `ACTIVE`, `HANDOFF` | L3: `skills/dex-memoria/SKILL.md`, `skills/dex-memoria/IMPLANTACAO.md`, `2026-04-26-dex-memoria-backlog-pos-finalizacao.md`
- `progress.closeout-standard` | `ativo` | metodo padrao do `Current block status` | L2: `HANDOFF`, `ACTIVE` | L3: `docs/memory-system/README.md`, `2026-04-22-camada-2-contexto-de-uso-e-fechamento-padrao.md`
- `docs.recovery-governance` | `ativo` | entrypoints humanos e regra `acao/evento -> metodo -> contrato` | L2: `HANDOFF`, `ACTIVE`, `napkin` | L3: `README.md`, `docs/memory-system/README.md`, `skills/README.md`, `2026-04-22-docs-e-governanca-alinhamento.md`
- `engine.recovery-runtime` | `ativo` | motor le `INDEX`, `PROJECT` e `Current block status` | L2: `PROJECT`, `ACTIVE`, `HANDOFF`, `napkin` | L3: `README.md`, `docs/memory-system/README.md`, `2026-04-22-alinhamento-do-motor-de-retomada.md`
- `runtime.status-observability` | `concluido` | `/status` combina runtime bruto e estado operacional vivo | L2: `ACTIVE`, `HANDOFF`, `napkin` | L3: `2026-04-22-status-e-observabilidade.md`, `README.md`
- `ux.telegram.response-clarity` | `concluido` | copy curta, recovery honesto e /project com menos peso visual | L2: `ACTIVE`, `HANDOFF` | L3: `2026-04-22-ux-telegram-acoes-finais-claras.md`, `2026-04-22-ux-telegram-poluicao-visual-residual.md`, `2026-04-22-ux-telegram-semantica-deterministica-dos-botoes.md`, `2026-04-22-sincronizacao-da-memoria-viva-apos-cortes-locais-de-ux.md`
- `memory.candidate-deep-review` | `ativo` | skill dedicada para revisar `memory candidate` e `skill_candidate` | L2: `ACTIVE`, `HANDOFF` | L3: `skills/avaliador-memory-candidate/SKILL.md`, `2026-04-22-avaliador-memory-candidate.md`, `2026-04-22-avaliador-memory-candidate-primeira-rodada-real.md`, `2026-04-22-captura-viva-reabre-inbox.md`
- `memory.legacy-normalization` | `concluido` | normalizacao por lotes do legado passivo sem inflar camada 1 | L2: `ACTIVE`, `HANDOFF` | L3: `2026-04-22-normalizacao-recorrente-de-memorias-antigas.md`
- `memory.inbox-skill-candidate-triage` | `concluido` | triagem limpou falsos positivos de `skill_candidate` | L2: `ACTIVE`, `HANDOFF` | L3: `2026-04-22-triagem-da-inbox-skill-candidate.md`
- `memory.skill-candidate-heuristics` | `concluido` | heuristica barra fechamento, veredito, plano e cabecalho de fase | L2: `ACTIVE`, `HANDOFF` | L3: `2026-04-22-memoryservice-heuristica-skill-candidate.md`
- `docs.publication-hygiene` | `concluido` | baseline publicado e docs marginais varridos sem novo drift | L2: `ACTIVE`, `HANDOFF` | L3: `2026-04-22-publicacao-github-baseline.md`, `2026-04-22-varredura-final-de-docs-marginais.md`
- `skills.governance` | `ativo` | classificacao entre skill local, skill global espelhada e promocao | L2: `ACTIVE`, `HANDOFF` | L3: `skills/README.md`, `skills/promocao-memoria-para-skill/SKILL.md`, `skills/promocao-memoria-para-skill/README.md`
- `audio.explicativo` | `ativo` | fluxo canonico para audio explicativo com prova por `message_id` | L2: `HANDOFF`, `ACTIVE` | L3: `2026-04-22-audio-explicativo-reuso.md`, `skills/dex-agent-audio-summary/SKILL.md`
- `index.local-sprints` | `ativo` | indice local parseavel das notas de sprint, completo para a pasta atual e usado antes de varrer historico | L2: `ACTIVE`, `HANDOFF` | L3: `.agents/sprints/INDEX.md`
- `index.local-docs` | `ativo` | indice local parseavel da documentacao operacional do repo | L2: `ACTIVE`, `HANDOFF` | L3: `docs/INDEX.md`
- `index.rollout-single-target` | `concluido` | o metodo `index v2` foi reaplicado em um repo-alvo unico por pedido explicito, sem vender rollout geral | L2: `ACTIVE`, `HANDOFF` | L3: `2026-04-22-rollout-index-v2-outros-projetos.md`, `2026-04-22-rollout-index-v2-alvo-unico-concluido.md`
- `worktree.cleanup-boundary` | `estacionado` | limite do que pode ou nao pode ser limpo destrutivamente | L2: `ACTIVE`, `HANDOFF` | L3: `.agents/archive/2026-04-22-worktree-sujeira-estacionada-revisao-2.md`
