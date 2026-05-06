# Runtime Boundary

`dex-memoria` e contrato documental. O runtime de memoria continua no Dex Agent ate decisao posterior.

## Fica No Dex Agent

- comandos `/inbox` e `/memory`;
- captura de candidates;
- proposal-first writes;
- ledger `.agents/MEMORY.ndjson`;
- inbox `.agents/INBOX/`;
- recall automatico;
- manutencao de superficies;
- integracao Telegram;
- codigo em `src/orchestrator/*`, `src/bot/*` e `src/index.ts`.

## Fica Neste Repo

- contrato de ciclo de vida;
- templates;
- exemplos sanitizados;
- criterios de criacao, resolucao, arquivamento e supersedencia;
- documentacao de fronteira.

## Regra De Uso

Quando a pergunta for sobre como operar uma memoria, use este repo.

Quando a pergunta for sobre como o bot grava, recupera, mostra ou injeta memoria em prompts, consulte o runtime do Dex Agent.

## Memorias Do Host Codex

Este pacote nao deve incentivar escrita direta de conteudo grande em
`C:\Users\crsan\.codex\memories` ou `${CODEX_HOME}\memories`.

Quando houver memoria reutilizavel entre conversas, repos ou contextos, o
contrato `memorizador` do `dex-memoria` deve usar memoria global como indice
gravavel de ponteiros curtos:
gatilho, fonte viva a abrir, o que procurar la, quem vence em conflito, quando
nao usar e criterio para remover ou revisar o ponteiro.

Memoria global nao e somente leitura. A sessao deve gravar diretamente o
ponteiro global conciso quando houver valor de lembranca/indexacao e houver
mecanismo autorizado de escrita. `dex-memoria` apenas organiza o registro para
que fique curto, intuitivo, rastreavel e reversivel.

O conteudo grande fica no repo, skill, `HANDOFF`, `ACTIVE`, artefato ou ledger
local. Se houver conflito, vence a fonte viva do projeto; para proximo passo
operacional, `HANDOFF.md` vence `MEMORY.ndjson`.

Se o host Codex bloquear escrita por permissao, declare o bloqueio como restricao
do ambiente ou da ferramenta ativa, nao como veto de `dex-memoria`, e produza um
candidato de memoria, contrato ou patch para a camada correta. Se o host ou outro
runtime autorizado permitir escrita, grave o ponteiro global conciso.
