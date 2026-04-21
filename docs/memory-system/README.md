# Dex Agent Memory System v1

Este documento descreve o runtime atual da memoria de projeto no `Dex Agent`.

Objetivo do v1:

- usar arquivos canonicos como fonte de verdade
- separar estado operacional, inbox revisavel e memoria duravel
- fazer recall automatico com guardas
- impedir escrita forte sem confirmacao explicita
- capturar trabalho repetido e transformar isso em skill reutilizavel quando o sinal for forte e claro

O alvo nao e "aprender sozinho". O alvo e ser auditavel, rastreavel e confiavel.

## Decisoes operacionais fortes

Algumas decisoes viram pre-requisito para a confiabilidade da memoria porque afetam restart, retomada e recuperacao do estado.

### Restart invisivel no Windows

O fluxo de `/restart` nesta maquina so ficou confiavel quando passou a usar um launcher Windows dedicado:

- `scripts/restart-dex-agent-hidden.vbs`
- `scripts/restart-dex-agent-hidden.ps1`
- `node ... tsx ... src/index.ts`

Tentativas anteriores que relancavam o processo direto pelo bootstrap com:

- `powershell.exe`
- `node + tsx`

foram instaveis ou deixaram a janela do `node.exe` visivel.

Para memoria e retomada, a regra pratica e:

- restart concluido precisa significar processo realmente de pe
- launcher invisivel precisa ser tratado como parte do contrato de continuidade
- se o restart falhar, conferir `.runtime/restart-bootstrap.log`, `dex-agent.stdout.log` e `dex-agent.stderr.log`

## Escopo

O v1 e estritamente memoria de projeto.

Ele nao tenta resolver:

- memoria entre projetos diferentes
- perfil pessoal do usuario
- embeddings ou vector search
- mutacao implicita de memoria

## Camadas

O sistema agora tem tres camadas explicitas.

### 1. Camada operacional

Arquivos usados para estado vivo e retomada:

- `.agents/ACTIVE.md`
- `.agents/HANDOFF.md`
- `.codex/napkin.md`

Funcao de cada um:

- `ACTIVE.md`: objetivo e estado atual
- `HANDOFF.md`: retomada e proximo bloco
- `napkin.md`: runbook tatico do repositorio

### 2. Camada de inbox

Arquivos usados para revisao persistente antes da promocao:

- `.agents/INBOX/candidates.ndjson`
- `.agents/INBOX/proposals.ndjson`

Regras:

- `candidates.ndjson` guarda `MemoryCandidate`
- `proposals.ndjson` guarda `MemoryWriteProposal`
- a inbox sobrevive a restart
- a inbox e revisavel; ela nao substitui o ledger final
- `MemoryCandidate.kind` pode ser memoria comum ou `skill_candidate`
- `MemoryWriteProposal.destination` explicita se o destino final e `memory`, `project_skill` ou `global_skill`

### 3. Camada duravel

Arquivo canonico:

- `.agents/MEMORY.ndjson`

Regras:

- append-only
- sem reescrita silenciosa
- `supersedes` substitui memoria antiga sem apagar historico
- entradas sem evidencia nao entram pelo fluxo normal de promocao

## Arquitetura de codigo

Os pontos principais sao estes.

### `src/orchestrator/memoryService.ts`

Motor principal da memoria.

Responsabilidades:

- capturar candidates
- classificar candidates
- distinguir memoria comum de `skill_candidate`
- recuperar memoria relevante
- construir `MemoryPacket`
- persistir inbox em arquivo
- propor promocao
- aplicar promocao confirmada
- auto-promover skill quando o sinal for forte e claro
- ler arquivos operacionais

Principais tipos:

- `MemoryEntry`
- `MemoryCandidate`
- `MemoryQuery`
- `MemoryPacket`
- `MemoryWriteProposal`
- `SkillDraft`

### `src/orchestrator/skillPromotionService.ts`

Servico dedicado de promocao para skill, acoplado ao pipeline de memoria sem criar um sistema paralelo.

Responsabilidades:

- classificar destino `memory | project_skill | global_skill`
- detectar sinais explicitos e estruturais de repeticao forte
- gerar `SkillDraft`
- criar `SKILL.md`, `README.md` e `PROMPT_AGENTE_CODEX_CONTEXTO.md` quando aplicavel
- evitar duplicatas por identidade funcional
- espelhar skill global no repo quando ela nascer do contexto do `dex-agent`
- listar skills recentes e candidates pendentes para o card `/project`

Principais metodos:

- `captureCandidate(...)`
- `queryMemory(...)`
- `buildMemoryPacket(...)`
- `renderMemoryPacket(...)`
- `listCandidates(...)`
- `listProposals(...)`
- `proposePromotion(...)`
- `applyPromotion(...)`
- `discardCandidate(...)`
- `cancelProposal(...)`
- `explainCandidate(...)`
- `readOperationalFile(...)`

### `src/orchestrator/projectIntelligence.ts`

Compoe o entendimento do projeto usando:

- camada operacional
- ledger duravel
- heuristica lexical leve para recall

Expõe:

- `relevantMemory`
- `memorySources`
- `memoryConfidence`
- `usedOperationalState`

Tambem distingue:

- `profile_only`
- `memory_ledger`
- `hybrid`
- `safe_fallback`

### `src/orchestrator/skills/projectStatusSkill.ts`

O card de projeto agora mostra:

- panorama do projeto
- botoes operacionais
- linha de memoria com:
  - `Inbox`
  - `Memoria`
  - `ACTIVE`
  - `HANDOFF`

### `src/bot/handlers.ts`

Esse arquivo concentra a superficie publica da memoria.

Blocos principais:

#### 1. Recall guardado antes de mandar prompts ao Codex

Antes de certos prompts irem ao Codex, o handler pode:

- inferir a intencao (`status`, `planning`, `implementation`, `debug`, `continue`, etc.)
- pedir um `MemoryPacket`
- injetar esse pacote no prompt final

Casos triviais como ajuda, listagem simples e comandos de controle nao puxam memoria duravel.

#### 2. Comando `/inbox`

Comandos suportados:

- `/inbox`
- `/inbox help`
- `/inbox candidates`
- `/inbox proposals`
- `/inbox promote <id|index>`
- `/inbox discard <id|index>`
- `/inbox why <id|index>`
- `/inbox confirm <id|index>`
- `/inbox cancel <id|index>`

Callbacks suportados:

- `inbox:show`
- `inbox:candidates`
- `inbox:proposals`
- `inbox:promote:<selector>`
- `inbox:discard:<selector>`
- `inbox:why:<selector>`
- `inbox:confirm:<selector>`
- `inbox:cancel:<selector>`

#### 3. Comando `/memory`

`/memory` continua existindo como superficie tecnica de inspeção e recall.

Comandos suportados:

- `/memory`
- `/memory show`
- `/memory help`
- `/memory candidates`
- `/memory promote <id|index>`
- `/memory discard <id|index>`
- `/memory why <id|index>`
- `/memory remember <texto>`

Importante:

- `/memory` usa o mesmo backend da inbox
- `/memory remember` cria candidate duravel na inbox
- `/inbox` e a UX principal de revisao
- `/memory` e a UX principal de inspeção

### `src/index.ts`

No runtime principal, respostas finalizadas do Codex podem virar candidates automaticamente.

Importante:

- isso cria candidate
- isso escreve em `.agents/INBOX/candidates.ndjson`
- isso nao grava direto em `.agents/MEMORY.ndjson` na maioria dos casos
- quando um fluxo repetivel ficar forte e claro, a resposta finalizada pode auto-promover para skill
- quando a promocao for global, a skill tambem precisa aparecer espelhada em `skills/` do repo

Ou seja: o v1 continua proposal-first por padrao, mas admite auto-promocao auditavel para skill quando a evidencia for forte o bastante.

## Esquema do ledger

Cada linha valida de `.agents/MEMORY.ndjson` deve respeitar o contrato minimo:

- `id`
- `createdAt`
- `project`
- `scope`
- `kind`
- `title`
- `summary`
- `evidence`
- `tags`
- `supersedes`
- `confidence`
- `source`

### Campos importantes

#### `scope`

Valores usados:

- `repo`
- `subsystem`
- `task`

#### `kind`

Categorias fixas do v1:

- `decision`
- `rule`
- `procedure`
- `exception`
- `fact`
- `task_state`
- `noise`

#### `evidence`

Tipos previstos:

- `file`
- `command`
- `test`
- `operator`
- `assistant`

#### `source`

Tipos previstos:

- `runtime`
- `operator`
- `telegram`
- `file`

## Regras de recuperacao

O ranking atual e lexical e deterministico.

Sinais usados:

- recencia
- tipo da memoria
- overlap de tokens com o prompt
- match no titulo
- confianca da entrada

Filtros importantes:

- `noise` nao entra
- itens superseded saem do recall
- prompts triviais podem nem abrir memoria

## Contrato do `MemoryPacket`

Quando o runtime resolve usar memoria, ele monta um pacote compacto com:

- `currentObjective`
- `latestClosedBlock`
- `nextEligibleBlock`
- `tacticalNotes`
- `relevantMemory`
- `sources`
- `confidence`
- `usedOperationalState`

Esse pacote e injetado no prompt final de forma curta.

Nao e dump bruto de arquivo.

## Politica de escrita

O v1 usa `proposal-first writes` como regra geral.

Fluxo:

1. o sistema captura um candidate
2. o operator ve o candidate em `/inbox`
3. o operator promove
4. o sistema cria uma proposal
5. o operator confirma
6. so entao a entrada e anexada ao ledger

O que isso evita:

- memoria falsa por ruido de sessao
- aprendizado implicito
- escrita irreversivel sem revisao

Excecao controlada:

- se o candidate for `skill_candidate`
- e o sinal for forte e claro
- o sistema pode auto-promover para skill
- mesmo assim, a promocao continua auditavel porque skill e ledger sao gravados em arquivo

## Como usar no Telegram

Exemplos:

```text
/inbox
/inbox candidates
/inbox proposals
/inbox promote 0
/inbox confirm 0
/memory
/memory remember decision: o ledger deve continuar append-only
/memory why 0
```

Sinais visiveis no chat:

- `Aprendi um novo procedimento de projeto.`
- `Promovi isto para skill global e espelhei no repo.`
- `Isto ainda nao virou skill; ficou como candidate porque o sinal nao foi forte o bastante.`

No card `/project`, a linha de memoria ajuda a:

- abrir a inbox
- inspecionar memoria usada
- abrir `ACTIVE`
- abrir `HANDOFF`
- ver `Reuso Rapido` com skills recentes, candidates pendentes e proxima acao sugerida

## Garantias do v1

O que o sistema ja garante:

- memoria de projeto explicita
- inbox persistente entre restarts
- promocao auditavel
- promocao para skill local ou global quando o sinal for forte e claro
- espelho fiel de skill global no repo quando o contexto exigir
- recall com guardas
- reuso rapido visivel no card `/project`
- separacao entre estado vivo, inbox e memoria forte
- rastreabilidade basica por fonte e evidencia

## Limites atuais

O que ainda nao existe:

- badge de contagem no botao `Inbox`
- `/memory debug`
- remocao da heuristica residual de intent
- curadoria automatica forte de candidates
- ranking semantico por embeddings
- deduplicacao mais sofisticada entre formulacoes parecidas

## Criterio de retomada

Se alguem retomar esse trabalho depois, a ordem correta e:

1. ler este arquivo
2. ler `src/orchestrator/memoryService.ts`
3. ler `src/orchestrator/projectIntelligence.ts`
4. ler `src/orchestrator/skills/projectStatusSkill.ts`
5. ler `src/bot/handlers.ts`
6. rodar:

```bash
npm run typecheck
npm test
npm run lint
```

## Proximas extensoes recomendadas

Se o trabalho continuar, a ordem mais segura e:

1. melhorar a UX de revisao da inbox
2. mover as strings restantes de memoria para i18n
3. adicionar politicas mais fortes de deduplicacao e supersession
4. criar visibilidade melhor de por que uma memoria foi usada
5. so depois considerar busca semantica

## Ideia estacionada

Fora do escopo imediato:

- refatorar o i18n para um modelo multi-idioma mais forte sem espalhar strings pelo runtime
