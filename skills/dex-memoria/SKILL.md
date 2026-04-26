---
name: dex-memoria
description: Use quando for preciso criar, revisar, resolver, arquivar ou superseder memoria operacional do Dex Agent com contrato de ciclo de vida, evitando que memoria resolvida continue viva como proximo passo.
---

# Dex Memoria

Use esta skill quando o usuario, um repo filho ou o proprio Dex Agent precisar decidir:

- se algo deve virar memoria viva, ledger historico, skill, estacionamento ou descarte;
- como uma memoria entra no sistema;
- quando ela deve ser lembrada;
- quando ela nao deve mais ser lembrada;
- como resolver, arquivar ou substituir uma memoria sem deixar residuos vivos;
- como registrar o ciclo de vida de uma memoria em `INDEX.md`, `.agents/ACTIVE.md`, `.agents/HANDOFF.md`, artefatos e `.agents/MEMORY.ndjson`.

## Regra central

Memoria nao e apenas anotacao. Memoria operacional precisa ter ciclo de vida.

Toda memoria forte deve responder:

- como entra;
- quando deve ser lembrada;
- quanto deve ser lembrada;
- como deve ser usada;
- quando nao deve ser lembrada;
- como deve sair do estado vivo.

## Fonte completa

Leia primeiro:

- `skills/dex-memoria/SPEC.md`

Use os templates quando precisar criar ou fechar uma memoria:

- `skills/dex-memoria/templates/memory-contract.md`
- `skills/dex-memoria/templates/memory-resolution-checklist.md`
- `skills/dex-memoria/templates/child-usage-prompt.md`

Use os exemplos como referencia de formato:

- `skills/dex-memoria/examples/active-operational-memory.md`
- `skills/dex-memoria/examples/resolved-operational-finding.md`
- `skills/dex-memoria/examples/ledger-only-memory.md`
- `skills/dex-memoria/examples/child-to-child-handoff.md`

Use o guia de implantacao quando precisar ensinar o Dex pai ou um filho:

- `skills/dex-memoria/IMPLANTACAO.md`

## Camadas e prioridade

Para proximo passo vivo, a prioridade e:

1. `INDEX.md`
2. `.agents/HANDOFF.md`
3. `.agents/ACTIVE.md`
4. sprint ou artefato ativo
5. `.agents/MEMORY.ndjson`
6. `.agents/ARQUIVADO/` ou `.agents/archive/`

Regra pratica:

- `HANDOFF.md` manda no proximo passo seguro;
- `ACTIVE.md` manda no objetivo vivo e loops abertos;
- `.agents/MEMORY.ndjson` e ledger duravel, nao fila viva;
- arquivo resolvido ou arquivado nao pode reabrir trabalho sozinho.

## Fluxo rapido

1. Classifique a captura: `ativa`, `ledger-only`, `residuo`, `skill-candidate`, `descartar`.
2. Se for memoria operacional, preencha o contrato.
3. Se ela deve orientar retomada, atualize as superficies vivas apontadas no contrato.
4. Se ela for apenas aprendizado, registre como ledger sem mexer no proximo passo.
5. Ao resolver, remova ou substitua todos os ponteiros vivos.
6. So considere fechado quando o checklist de resolucao passar.

## Limite da v1

Esta skill v1 e contrato, template e exemplo. Ela nao executa comandos `add`, `resolve`, `archive` ou `status`.

Scripts so entram numa v2 depois que o contrato tiver sido usado em casos reais sem ambiguidade.
