---
name: dex-memoria
description: Use quando for preciso criar, revisar, resolver, arquivar ou superseder memoria operacional de projetos Dex Agent com contrato de ciclo de vida, evitando que memoria resolvida continue viva como proximo passo. Antes de usar a skill global, verificar se o repo atual possui `skills/dex-memoria/SKILL.md` ou skill local equivalente; preferir sempre a dex-memoria local e usar esta global somente quando nao existir versao local, avisando isso explicitamente.
---

# Dex Memoria

`dex-memoria` e o ponto de entrada pratico para operar memoria com ciclo de vida.

Dentro deste pacote, `memorizador` e o nome operacional do contrato de
memorizacao: o metodo que define como, quando, quanto, por que, por quanto tempo
e quando nao lembrar. Memoria global nao e somente leitura: quando uma lembranca
tiver valor cross-project, o mecanismo de escrita disponivel deve gravar um
ponteiro curto, intuitivo e indexavel em `MEMORY.md`, apontando para a fonte viva
completa. O contrato `dex-memoria` nao pode ser usado para negar escrita global;
ele apenas orienta formato, criterios, fonte viva, conflito e revisao. O
registro global nao deve virar tutorial, copia de contrato, historico grande ou
dump de contexto.

Nao confunda esse `memorizador` contratual com a skill/pacote experimental antigo
que foi arquivado. O pacote antigo nao e rota viva; o contrato de memorizacao
continua vivo dentro de `dex-memoria`.

Use esta skill quando uma captura, achado ou decisao precisar ser classificada antes de virar:

- memoria viva;
- ledger historico;
- arquivo resolvido;
- handoff entre projetos;
- skill-candidate;
- estacionamento;
- descarte.

## Regra Central

Memoria operacional nao e apenas anotacao. Ela precisa responder:

- como entra;
- quando deve ser lembrada;
- quanto deve ser lembrada;
- por que deve ser lembrada;
- por quanto tempo deve ser lembrada;
- como deve ser usada;
- quando nao deve ser lembrada;
- como sai do estado vivo.

## Precedencia Local Antes Da Global

Antes de aplicar esta skill global, verifique se o repositorio da janela de contexto atual possui uma versao local de `dex-memoria`, nesta ordem:

1. `skills/dex-memoria/SKILL.md`
2. `skills/dex-agent/skills/dex-memoria/SKILL.md`
3. `.codex/skills/dex-memoria/SKILL.md`
4. outro caminho local indicado por `AGENTS.md`, `INDEX.md`, `ACTIVE.md` ou `HANDOFF.md`

Se existir `dex-memoria` local, use a versao local e pare de aplicar esta global como contrato principal.

Se nao existir versao local, declare antes de continuar:

`Estou usando o dex-memoria de forma global pois nao existe dex-memoria local neste repositorio.`

Regra de conflito:

- a `dex-memoria` local do projeto vence a global;
- a global serve como fallback e referencia reutilizavel;
- para proximo passo operacional, `HANDOFF.md` vence `.agents/MEMORY.ndjson`;
- `.agents/MEMORY.ndjson` e ledger, nao fila viva.

## Fronteira De Escrita

Esta skill nao deve gerar uma regra ampla de memoria somente leitura.

Quando esta skill disser que a V1 "nao grava memoria", leia isso como: `dex-memoria` nao possui runtime proprio, hook automatico, comando `add` ou escritor de ledger embutido.

Isso nao bloqueia memorizar por outro mecanismo autorizado do ambiente. Quando
houver valor de lembranca/indexacao, use `dex-memoria` para classificar, decidir
o destino e preparar ou executar o ponteiro global conciso conforme o contrato
daquela camada.

Se o ambiente atual bloquear escrita em uma pasta de memorias, declare o bloqueio
como permissao do ambiente/ferramenta ativa, nao veto de `dex-memoria`, e
entregue um candidato de memoria ou o patch operacional apropriado. Assim que
houver caminho autorizado de escrita, grave o ponteiro global conciso.

## Fonte Completa

Leia primeiro:

- `SPEC.md`
- `docs/usage.md`
- `docs/runtime-boundary.md`

Use os templates quando precisar criar ou fechar uma memoria:

- `templates/memory-contract.md`
- `templates/memory-resolution-checklist.md`
- `templates/child-usage-prompt.md`

Use os exemplos como referencia de formato:

- `examples/active-operational-memory.md`
- `examples/resolved-operational-finding.md`
- `examples/ledger-only-memory.md`
- `examples/child-to-child-handoff.md`

## Prioridade Entre Fontes

Para proximo passo vivo, a prioridade recomendada e:

1. `INDEX.md`
2. `.agents/HANDOFF.md`
3. `.agents/ACTIVE.md`
4. sprint ou artefato ativo
5. `.agents/MEMORY.ndjson`
6. arquivo resolvido ou arquivado

Regra pratica:

- `HANDOFF.md` manda no proximo passo seguro;
- `ACTIVE.md` manda no objetivo vivo e loops abertos;
- `.agents/MEMORY.ndjson` e ledger duravel, nao fila viva;
- arquivo resolvido ou arquivado nao reabre trabalho sozinho.

## Limite Da V1

Esta V1 e contrato, template e exemplo.

Ela nao executa comandos `add`, `resolve`, `archive`, `status` ou `audit`.
Ela tambem nao e hook automatico e nao roda sozinha ao abrir ou fechar uma janela de contexto.

Scripts so entram numa V2 depois de uso real repetido com baixa ambiguidade.
