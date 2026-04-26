# Dex Agent Memory System v1

Este documento descreve o runtime atual da memoria de projeto no `Dex Agent`.

Objetivo do v1:

- usar arquivos canonicos como fonte de verdade
- separar estado operacional, inbox revisavel e memoria duravel
- fazer recall automatico com guardas
- impedir escrita forte sem confirmacao explicita
- capturar trabalho repetido e transformar isso em skill reutilizavel quando o sinal for forte e claro

O alvo nao e "aprender sozinho". O alvo e ser auditavel, rastreavel e confiavel.

## Governanca operacional

Regra estrutural deste sistema:

- toda acao ou evento relevante deve apontar para um metodo
- todo metodo recorrente deve apontar para um contrato
- se ainda nao houver metodo claro, isso continua sendo observacao, tentativa ou caso isolado
- se ainda nao houver contrato claro, o metodo nao deve ser tratado como padrao estavel

Consequencia pratica:

- memoria viva pode registrar sinais e observacoes
- `napkin`, `HANDOFF`, skills e docs canonicas guardam apenas metodo e contrato quando eles ficarem claros
- metodo padrao nao some sozinho; ele so muda por correcao, melhora forte ou autorizacao explicita
- sugestao marcada como `sugestao` no meio de um fluxo nao disputa a prioridade atual; ela deve ser estacionada e reavaliada no fechamento do corte
- pedido expresso para `tornar metodo padrao` passa a ser governanca global por definicao e so entra em vigor depois de revisao de ambiguidade, conflito, lacuna e informacao inconclusiva
- ao comunicar uma fase ativa, o cabecalho deve mostrar a fase junto do agente responsavel por ela
- quando houver colaboracao efetiva de especialistas numa etapa, o fechamento deve creditar essa colaboracao de forma breve e clara
- achado material em revisao, auditoria ou fechamento deve sair com destino explicito: `Gabi Garimpeira` qualifica se e aprendizado forte, ruido ou acao; `Estela Estaciona` segura o que continuar vivo, imaturo, lateral ou pendente; `Fernanda do Fluxo` mantem o gate de seguir, segurar ou retornar

## Fases e especialistas auxiliares

Quando o trabalho cair numa fase reconhecivel, o repo passa a tratar um especialista nomeado como apoio padrao dessa fase.

Mapa padrao:

- `pensamento` -> `questionador`
- `planejamento` -> `sprinter`
- `construir` -> `mapeador-implementacao`
- `revisar` -> `revisor-codigo` (`Renata Review`)
- `testar` -> `tio-testador`
- `veredito` -> `validador-pronto` (`Vera Veredito`)

Regras:

- o especialista da fase auxilia o corte, a qualidade e a verificacao; ele nao substitui a execucao principal
- se a fase mudar, o especialista auxiliar padrao tambem muda
- quando a colaboracao do especialista entrar de fato no fluxo, a resposta de fechamento deve trazer credito explicito a esse agente especializado
- o marcador de fase deve preferir o formato `Fase | agente-responsavel`
- se a fase for trivial ou o especialista nao tiver contribuido materialmente, nao inventar colaboracao ficticia
- em `revisar`, `testar` e `veredito`, achados nao consumidos no mesmo passo devem ser estacionados ou explicitamente descartados; nao deixar finding util solto sem destino

Formato minimo de credito:

- `Creditos da fase:`
- `- <nome do especialista>: <como ajudou de verdade>`

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

- ledger compartilhado e gravavel entre projetos diferentes
- promocao cruzada implicita de memoria entre projetos
- perfil pessoal do usuario
- embeddings ou vector search
- mutacao implicita de memoria

Excecao explicita:

- o recall pode consultar memoria global read-only do operador quando ela estiver disponivel em `C:\Users\<usuario>\.codex\memories` ou `${CODEX_HOME}/memories`
- essa memoria global nao substitui o ledger local do projeto
- a escrita duravel continua local ao workspace em `.agents/MEMORY.ndjson`

## Camadas

O sistema agora precisa ser lido por dois eixos diferentes.

O primeiro eixo e de recuperacao humana entre repositorios.
O segundo eixo e de armazenamento operacional do runtime.

Eles se complementam, mas nao sao a mesma coisa.

### Eixo A - Camadas de recuperacao

Estas sao as camadas que um humano ou outro agente deve usar para retomar contexto.

#### 1. Camada de superficie

Arquivo canonico:

- `INDEX.md`

Papel:

- ser a primeira porta de entrada do repositorio
- dizer onde estou, qual e o estado atual e por onde recomecar
- expor entradas surfacadas com ponteiros para camadas mais profundas
- reduzir dependencia de leitura cega de varios arquivos logo no primeiro passo

Contrato minimo:

- `updated_at` no topo
- `surface_version`
- mapa curto das camadas
- entradas ativas com `entry_id`, `summary`, `status`, `updated_at` e ponteiros explicitos

Regra:

- o `INDEX.md` e o metodo padrao de localizacao
- busca textual vira fallback, nao entrypoint principal

#### 1.1. INDEX local parseavel

Quando um diretorio operacional ficar denso o bastante para exigir retomada
propria, ele pode ter um `INDEX.md` local. Esse arquivo segue a mesma ideia da
camada 1 do projeto: localizar rapido, sem explicar nem duplicar conteudo.

Formato obrigatorio:

```md
# <Nome Da Pasta> Index

Atualizado em: `YYYY-MM-DDTHH:mm:ss-03:00`
Surface version: `1`
Papel: `camada 1 local - catalogo rapido de <tema>`

## Regra de leitura

- Este INDEX localiza; nao explica.
- Abra apenas a entrada aderente ao pedido.
- Use busca textual apenas como fallback.

## Catalogo

- `<entry_id>` | status: `<status>` | tipo: `<tipo>` | resumo: `<resumo curto>` | abre: `<arquivo-ou-subpasta>` | fallback: `<arquivo-ou-fonte>`
```

Regras:

- cada entrada do catalogo ocupa exatamente uma linha
- `entry_id` e curto, humano, estavel e unico dentro do indice local
- `status` usa `ativo`, `planejado`, `em_execucao`, `fechado`, `arquivado`, `estacionado` ou `legado`
- `tipo` usa `sprint`, `plano`, `runbook`, `auditoria`, `bateria`, `doc`, `memoria`, `arquivo` ou `outro`
- todo `INDEX.md` local criado deve nascer preenchido com o conteudo relevante ja existente no diretorio
- todo `INDEX.md` local criado deve ficar alcancavel pelo `INDEX.md` raiz, por um `INDEX.md` pai ou pela retomada em `ACTIVE/HANDOFF`
- se automacao futura precisar de JSON, ele deve ser derivado desse Markdown canonico, nao editado manualmente como fonte primaria

#### 2. Camada de contexto de uso

Arquivos canonicos:

- `AGENTS.md`
- `.agents/PROJECT.md`
- `.agents/ACTIVE.md`
- `.agents/HANDOFF.md`
- `.codex/napkin.md`

Papel:

- `AGENTS.md`: contrato local obrigatorio de operacao, comandos, restricoes e skills
- `PROJECT.md`: identidade, escopo e restricoes estaveis
- `ACTIVE.md`: objetivo atual, loops abertos, bloqueios e notas vivas
- `HANDOFF.md`: protocolo de retomada e proximo bloco
- `napkin.md`: runbook tatico do repositorio

Regra:

- esses arquivos continuam vivos
- eles nao deixam de existir com a chegada do `INDEX.md`
- eles saem da posicao de primeira porta obrigatoria e passam a ser camada 2

Contrato canonico da camada 2:

- `AGENTS.md` define o contrato local obrigatorio antes de qualquer execucao
- `PROJECT.md` define identidade, escopo, referencias principais e restricoes estaveis
- `ACTIVE.md` define objetivo atual, loops abertos, proximas acoes, blockers e notas vivas
- `HANDOFF.md` define protocolo de retomada, fila seguinte, snapshot de progresso e o cartao canonico do bloco atual
- `.codex/napkin.md` guarda apenas metodo recorrente, runbook curto e regra taticamente reutilizavel

Regra de leitura:

- abrir `AGENTS.md` antes de transformar retomada em execucao
- abrir apenas os demais arquivos da camada 2 que o `INDEX.md` apontar
- se a duvida for "onde estou e o que faco agora", priorizar `HANDOFF.md`
- se a duvida for "qual e o objetivo e o que continua aberto", priorizar `ACTIVE.md`
- se a duvida for "o que nunca devo esquecer sobre este repo", priorizar `.codex/napkin.md`
- se a duvida for "qual e a identidade estavel do projeto", priorizar `PROJECT.md`

Regra de manutencao:

- camada 2 nao deve virar dump historico
- quando uma explicacao ficar grande, tutorializada ou dependente de exemplo, ela deve descer para a camada 3
- a camada 2 deve responder retomada, uso e decisao imediata sem obrigar leitura profunda

#### Fechamento padrao de sprint ou bloco

Quando um sprint ou bloco fechar, o metodo padrao passa a ser atualizar um cartao canonico em `HANDOFF.md` e refletir o mesmo quadro no fechamento ao usuario.

Campos obrigatorios do cartao:

- `tipo`: `sprint`, `bloco` ou equivalente
- `nome`: identificador humano do corte fechado
- `conclusao`: percentual concluido real
- `posicao_no_plano`: ex. `2/3`; se o total nao estiver fechado, declarar isso explicitamente em vez de inventar
- `objetivo_concluido`: o que acabou de ser entregue
- `objetivo_atual`: o objetivo vivo do repo depois do fechamento
- `proximo_passo_indicado`: qual e o proximo sprint ou bloco sugerido
- `sugestao_especialistas_sessao`: um ou mais especialistas sugeridos para entrar na sessao viva atual, de acordo com o proximo corte
- `retrocesso_padrao`: caminho padrao se for necessario rever, replanejar ou refazer
- `evidencia`: arquivos, testes, metricas ou artefatos que sustentam o fechamento

Regras:

- esse cartao vive de forma canonica em `HANDOFF.md`
- `ACTIVE.md` continua focado em objetivo vivo e loops abertos; ele pode referenciar o cartao, mas nao deve competir com ele
- toda resposta final de fechamento deve trazer esse mesmo quadro de forma curta
- metodo padrao nao deve desaparecer silenciosamente; para mudar, precisa de pedido ou aprovacao explicita

#### 3. Camada profunda

Exemplos:

- `docs/`
- `skills/`
- `.agents/sprints/`
- `.agents/ARQUIVADO/`
- `.agents/archive/`
- relatórios, artefatos e tutoriais mais densos

Papel:

- explicacao detalhada
- tutorial passo a passo
- notas de sprint
- contratos de skill
- historico mais profundo

Regra:

- so abrir quando a camada 1 e a camada 2 nao bastarem
- sprint ou trabalho fechado/concluido sai da pasta viva e vai para `.agents/ARQUIVADO/`
- `.agents/sprints/INDEX.md` deve trocar a entrada para `status: arquivado` e apontar `abre:` para o destino arquivado
- artefatos lado a lado com o mesmo slug do sprint fechado acompanham o arquivo principal para o mesmo destino

### Eixo B - Camadas de armazenamento operacional

Estas sao as camadas que o runtime usa para capturar, revisar e persistir memoria.

#### 1. Camada operacional

Arquivos:

- `.agents/ACTIVE.md`
- `.agents/HANDOFF.md`
- `.codex/napkin.md`

#### 2. Camada de inbox

Arquivos:

- `.agents/INBOX/candidates.ndjson`
- `.agents/INBOX/proposals.ndjson`

Regras:

- `candidates.ndjson` guarda `MemoryCandidate`
- `proposals.ndjson` guarda `MemoryWriteProposal`
- a inbox sobrevive a restart
- a inbox e revisavel; ela nao substitui o ledger final
- `MemoryCandidate.kind` pode ser memoria comum ou `skill_candidate`
- `MemoryWriteProposal.destination` explicita se o destino final e `memory`, `project_skill` ou `global_skill`
- resposta finalizada com cara de fechamento, veredito, reuniao, plano ou cabecalho de fase deve ser descartada antes da inbox; isso nao conta como `skill_candidate`
- candidate que sobreviver a esse filtro pode seguir por este caminho: `refinador-intencao` quando ainda estiver ambiguo, `garimpeiro` quando houver ruido, `avaliador-memory-candidate` para revisao profunda, e `promocao-memoria-para-skill` quando a promocao ja estiver madura

#### 3. Camada duravel

Arquivo canonico:

- `.agents/MEMORY.ndjson`

Regras:

- append-only
- sem reescrita silenciosa
- `supersedes` substitui memoria antiga sem apagar historico
- entradas sem evidencia nao entram pelo fluxo normal de promocao

## Localizacao e ids canonicos

O sistema nao deve exigir uma copia fisica obrigatoria em todas as camadas para cada item.

Regra de localizacao:

- a navegacao primaria acontece por `INDEX.md`
- cada entrada surfacada no `INDEX.md` recebe um `entry_id`
- esse `entry_id` precisa ser nominal, curto, humano e estavel
- `hash` e fallback tecnico, nao formato canonico de leitura humana
- ids puramente numericos nao sao o formato preferido para este v1

Exemplos de boa forma:

- `resume.current-state`
- `memory.layered-recall`
- `audio.explicativo`

Regra de presenca:

- `entry_id` e obrigatorio na entrada surfacada do `INDEX.md`
- ele so aparece na camada 2 ou na camada 3 quando houver artefato correspondente
- se nao existir camada 2 ou 3 para aquele item, nao criar placeholder vazio

Objetivo:

- localizar rapido por ponteiro explicito
- evitar cartorio de metadados
- impedir drift por obrigacao de sincronizar arquivos vazios

## Arquitetura de codigo

Os pontos principais sao estes.

### `src/orchestrator/memoryService.ts`

Camada principal de escrita, candidate/proposal e promocao.

Responsabilidades:

- capturar candidates
- classificar candidates
- distinguir memoria comum de `skill_candidate`
- persistir inbox em arquivo
- propor promocao
- aplicar promocao confirmada
- auto-promover skill quando o sinal for forte e claro
- endurecer a captura finalizada para aceitar apenas pedido explicitamente memory/promotion ou linha estruturada (`Decision:`, `Rule:`, `Procedure:`, `Exception:`, `Task state:`)
- delegar todo o read-path para `src/orchestrator/memoryRecallEngine.ts`

Principais tipos:

- `MemoryEntry`
- `MemoryCandidate`
- `MemoryQuery`
- `MemoryPacket`
- `MemoryWriteProposal`
- `SkillDraft`

### `src/orchestrator/memoryRecallEngine.ts`

Fronteira read-only do recall.

Responsabilidades:

- ler as fontes resolvidas por `operationalRecoverySources`: `INDEX.md`, `AGENTS.md`, `.agents/PROJECT.md`, `.agents/ACTIVE.md`, `.agents/HANDOFF.md`, `.codex/napkin.md`, `.agents/sprints/INDEX.md` quando existir sprint/bloco, `.agents/ESTACIONAMENTO.md` quando houver ativos e `.agents/MEMORY.ndjson` como ledger
- ler o ledger local `.agents/MEMORY.ndjson`
- ler memoria global markdown read-only (`MEMORY.md` e `memory_summary.md`)
- usar uma `buildRetrievalQuery(...)` unica com `projectName`, `currentObjective`, `nextEligibleBlock` e `latestClosedBlock`
- ranquear memoria de forma lexical, mas com priors de escopo e contexto operacional
- montar `MemoryPacket`, renderizar disclosure e manter cache por `mtime` para a memoria global markdown

### `src/orchestrator/memorySurfaceMaintenance.ts`

Manutencao mecanica das superficies de memoria.

Responsabilidades:

- auditar ledger, camadas vivas e markdown global
- detectar sprint `fechado`, `concluido` ou `finalizado` ainda apontado para `.agents/sprints/`
- no `normalizeMemorySurfaces(..., write: true)`, mover automaticamente o sprint fechado e artefatos lado a lado com o mesmo slug para `.agents/ARQUIVADO/sprints/`
- no startup do Dex Agent, executar `archiveCompletedSprintSurfaces(..., write: true)` contra o `CODEX_WORKDIR` da instancia para manter a pasta viva limpa sem depender de prompt manual
- atualizar `.agents/sprints/INDEX.md` para `status: arquivado` e `abre: .agents/ARQUIVADO/sprints/<arquivo>`
- preservar sprints `planejado`, `em_execucao`, `ativo` ou `legado` na pasta viva

### `src/orchestrator/skillPromotionService.ts`

Servico dedicado de promocao para skill, acoplado ao pipeline de memoria sem criar um sistema paralelo.

Responsabilidades:

- classificar destino `memory | project_skill | global_skill`
- detectar sinais explicitos e estruturais de repeticao forte
- exigir sinal explicito de `metodo` e de `contrato` antes de permitir auto-promocao
- gerar `SkillDraft`
- criar `SKILL.md`, `README.md` e `PROMPT_AGENTE_CODEX_CONTEXTO.md` quando aplicavel
- evitar duplicatas por identidade funcional
- espelhar skill global no repo quando ela nascer do contexto do `dex-agent`
- listar skills recentes e candidates pendentes para o card `/project`

Principais metodos:

- `assessCandidate(...)`
- `buildDraft(...)`
- `promoteSkill(...)`
- `findRelevantSkills(...)`
- `listProjectSkillStatus(...)`

### `src/orchestrator/projectIntelligence.ts`

Compoe o entendimento do projeto usando:

- `INDEX.md` como camada 1
- `.agents/PROJECT.md` como identidade estavel
- camada operacional
- ledger duravel
- heuristica lexical leve para recall

Expõe:

- `relevantMemory`
- `memorySources`
- `memoryConfidence`
- `usedOperationalState`
- `currentBlockStatus`

Tambem distingue:

- `profile_only`
- `memory_ledger`
- `hybrid`
- `safe_fallback`

### `src/orchestrator/skills/projectStatusSkill.ts`

O card de projeto agora mostra:

- panorama do projeto
- botoes operacionais
- `Current block status` como cartao canonico de progresso quando existir
- linha de memoria com:
  - `Inbox`
  - `Memoria`
  - `INDEX`
  - `PROJECT`
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
- os atalhos de memoria no bot tambem podem abrir `INDEX`, `PROJECT`, `ACTIVE`, `HANDOFF`, `napkin` e `ledger`
- `/inbox` e a UX principal de revisao
- `/memory` e a UX principal de inspeção

### `src/index.ts`

No runtime principal, respostas finalizadas do Codex podem virar candidates automaticamente, mas agora em modo estrito.

Importante:

- isso so cria candidate quando o pedido original ja e um fluxo explicito de memoria/promocao ou quando a resposta traz uma linha estruturada como `Decision:` ou `Rule:`
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

O ranking atual continua lexical e deterministico, mas agora usa a mesma query unificada em todos os call sites principais.

Sinais usados:

- query unificada montada a partir de `prompt + projectName + currentObjective + nextEligibleBlock + latestClosedBlock`
- recencia
- tipo da memoria
- overlap de tokens com o prompt
- match no titulo
- confianca da entrada
- boost de escopo (`repo` > `subsystem` > `task`)
- boost de overlap com `currentObjective` e `nextEligibleBlock`
- frescor extra para `task_state` recente quando bater com o objetivo atual
- pequena penalidade para memoria transversal de `memory_summary.md` quando competir com memoria mais especifica do repo

Filtros importantes:

- `noise` nao entra
- itens superseded saem do recall
- prompts triviais podem nem abrir memoria
- memoria global continua somente leitura

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

### Modos de retomada

- `retomada curta`: pode responder com `INDEX.md`, `ACTIVE.md` e `HANDOFF.md` quando o usuario so quer "onde paramos" e nao ha sprint, residuo ou reabertura em disputa.
- `auditoria de protocolo`: deve conferir `AGENTS.md`, os ponteiros do `INDEX.md`, `.agents/sprints/INDEX.md` quando houver sprint/bloco e `.agents/ESTACIONAMENTO.md` quando houver residuos ativos.
- `retomada operacional completa`: deve usar o resolvedor unico de fontes e nunca tratar `ACTIVE.md` como opcional; `HANDOFF.md` continua dono do proximo passo seguro, e `ACTIVE.md` continua dono do objetivo vivo e loops abertos.

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

### Refinamento antes da promocao

Quando a captura ainda estiver frouxa, curta demais ou ambigua:

- nao force escrita direta em memoria duravel
- nao force promocao de skill cedo demais
- use `skills/refinador-intencao/SKILL.md` como trilho local para decidir entre `memory`, `project_skill`, `global_skill` ou apenas `estado vivo`

Regra de classificacao do repo:

- `skills/README.md` e o inventario autoritativo entre skill local e skill espelhada
- `dex-agent-audio-summary` e skill global canonica com espelho fiel no repo
- `refinador-intencao` e skill local do produto
- `promocao-memoria-para-skill` e espelho fiel da skill global canonica

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
