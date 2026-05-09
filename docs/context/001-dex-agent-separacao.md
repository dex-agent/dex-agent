# [001] Handoff de Contexto - Dex Agent

## Papel no sistema novo

- camada: `camada 3 - contexto profundo`
- status de superficie: `nao surfacar na camada 1`
- quando abrir: use apenas quando a retomada precisar da historia da separacao entre `ConfiguracoesWindows` e o repo proprio `dex-agent`
- regra: este arquivo nao compete com `INDEX.md`, `.agents/ACTIVE.md` ou `.agents/HANDOFF.md`; ele so explica a origem do arranjo atual

## Resumo executivo do estado atual

O `Dex Agent` deixou de ser apenas um assunto dentro de `ConfiguracoesWindows` e passou a ter um pacote proprio de continuidade dentro do seu repositorio. O baseline atual do produto ja inclui controle deterministico do bot, memoria de projeto com inbox duravel, cards operacionais no Telegram, prompts frequentes por projeto, audio de resumo, fila estruturada e autostart local validado por Startup folder no Windows.

Na frente de identidade publica, a direcao escolhida em `2026-04-21` passou a ser `Dex Agent`, com `dex-agent` como slug alvo de publicacao. O caminho operacional canonico passou a ser `$env:USERPROFILE\.dex-agent`; clones em pastas de projetos sao apenas repositorios de desenvolvimento/GitHub.

O runtime esta vivo nesta maquina e o boot automatico via pasta Startup foi validado apos reboot. O principal ponto ainda aberto nao e o produto base, e sim o alinhamento de documentacao e observabilidade com o que ja mudou no runtime real.

## Frentes abertas

- runtime e operacao: fortalecer status, espera, silencio prolongado e diagnostico de execucao ativa
- UX Telegram: seguir refinando cards, prompts, fila e acoes rapidas sem voltar a heuristicas opacas
- memoria e governanca: consolidar a camada local de continuidade e manter docs alinhadas ao runtime
- docs: limpar drift entre README e o estado operacional ja validado

## Linha do tempo recente

1. O bot foi simplificado para um modelo deterministico: texto livre, audio e imagem vao direto ao Codex; acoes estruturadas ficam em comando, menu e botoes.
2. A memoria de projeto evoluiu para `Memory System v1`, com `INBOX` persistente e `MEMORY.ndjson` como ledger final.
3. O `/project` ganhou variantes, comandos, prompts e botoes rapidos; o fechamento passou a oferecer `Resumo em audio`, `Planejar sprint`, `Aprovar e continuar` e `Reuniao`.
4. A fila ganhou callbacks operacionais, melhor feedback e recuperacao de itens pendentes no startup.
5. O status foi localizado para `pt-BR`, e `/interrupt` passou a forcar encerramento de sessao travada apos janela curta de graca.
6. O primeiro autostart por Task Scheduler nao ficou confiavel nesta maquina; a decisao foi migrar para a pasta Startup com um wrapper de boot resiliente.
7. O boot pela pasta Startup foi testado e validado apos reboot: atraso inicial de 45s, ate 6 tentativas, backoff progressivo.
8. Esta camada local de memoria viva foi criada para que a proxima conversa possa partir do repo `Dex Agent` sem depender do contexto do projeto pai.

## Decisoes vivas

- `Dex Agent` deve ser tratado como projeto proprio.
- O fluxo livre do bot nao deve voltar a depender de inferencia heuristica de intencao.
- A memoria forte do produto continua auditavel: inbox duravel primeiro, promocao explicita depois.
- O idioma operacional do bot e `pt-BR`.
- O mecanismo de boot local canonico desta maquina e a pasta Startup, nao Task Scheduler.
- O runtime real, logs e scripts locais tem prioridade sobre README desatualizado.

## O que funcionou

- Separacao clara entre conversa livre e acoes estruturadas do bot.
- Inbox duravel de memoria com `/inbox` e `/memory`.
- Prompt library e botoes do `/project`.
- Fila com callbacks, feedback operacional e recuperacao no startup.
- Resumo em audio enviado pelo proprio bot.
- Autostart validado pelo Startup folder apos reboot real.

## O que falhou

- A estrategia inicial com Task Scheduler nao ficou confiavel nesta maquina.
- README e algumas descricoes operacionais ficaram atrasadas em relacao ao runtime real.
- O repo ainda nao tinha sua propria camada `.agents/`, o que mantinha o contexto do bot acoplado ao projeto maior.

## Riscos e tensoes

- O worktree esta com muitas mudancas locais; qualquer retomada precisa separar codigo, doc e artefato de runtime com cuidado.
- Se a documentacao continuar atrasada, a proxima retomada pode tomar decisoes com base em informacao errada.
- Melhorias de UX nao podem reintroduzir complexidade heuristica que ja foi removida do fluxo principal.

## Estacionamento

- Expor no `/status` sinais mais fortes de espera real, silencio prolongado e atividade efetiva.
- Fechar o alinhamento do README com o autostart real por Startup folder.
- Evoluir o i18n para um modelo multi-idioma mais forte no futuro, sem espalhar strings pelo runtime.

## Proximos pontos de retomada

- Abrir uma conversa nova apontando para `$env:USERPROFILE\.dex-agent`.
- Ler os arquivos canonicos de `.agents/` e `.codex/napkin.md`.
- Confirmar o estado do bot com `scripts/status-dex-agent.ps1`.
- Escolher a frente imediata: docs, status/observabilidade, UX Telegram ou consolidacao de produto.

## Mapa por modulo

### runtime e operacao
- estado atual: bot ativo, autostart local funcionando via Startup folder
- backlog vivo: observabilidade mais rica, reduzir ambiguidade de espera/trabalho real

### memoria e continuidade
- estado atual: memory system v1 implementado no produto; memoria viva local do repo ativada agora
- backlog vivo: manter docs e camada local coerentes com a realidade do runtime

### UX Telegram
- estado atual: menu deterministico, `/project`, `/inbox`, `/memory`, prompts, fila e acoes rapidas ja existem
- backlog vivo: refino visual e de fluxo, sem reintroduzir heuristicas

### docs e governanca
- estado atual: documentacao principal mistura fatos novos e antigos
- backlog vivo: corrigir drift e tornar a retomada humana mais rapida
