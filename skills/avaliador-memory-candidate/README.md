# Avaliador Memory Candidate

## O que esta skill faz

Esta skill existe para resolver um gargalo recorrente:

- candidates entram na inbox
- parecem uteis
- mas ainda nao esta claro se sao usaveis, reutilizaveis e governados do jeito certo

Ela faz a avaliacao profunda de `memory candidate` e `skill_candidate` antes de promocao, descarte ou correcao.

## O que ela devolve

Sempre devolve:

- veredito do candidate
- erros concretos encontrados
- acao operacional pedida
- avancar ou retornar no fluxo

O desfecho sai com `ancora-fluxo`, para o proximo passo ou o retrocesso ficarem explicitos.

## Quando usar

- `use $avaliador-memory-candidate para revisar os candidates da inbox`
- `use $avaliador-memory-candidate para validar reuso e governanca antes de promover`
- `use $avaliador-memory-candidate para dizer se isso volta para construir ou avanca`

## Ordem recomendada

1. `refinador-intencao` se a captura ainda estiver ambigua
2. `garimpeiro` se houver muito ruido
3. `avaliador-memory-candidate` para a revisao profunda
4. `promocao-memoria-para-skill` se a avaliacao aprovar promocao

## Regra importante

Se a revisao encontrar falha material, esta skill nao para em "nao pronto".

Ela deve:

- listar os erros
- pedir a correcao
- devolver o fluxo para `construir`

Se aprovar, deve empurrar para `testar` ou `veredito`.
