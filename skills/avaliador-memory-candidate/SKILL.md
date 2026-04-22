---
name: avaliador-memory-candidate
description: Use quando for preciso revisar `memory candidate` ou `skill_candidate` com profundidade, validar usabilidade e reuso no ecossistema, apontar erros concretos de contrato ou governanca, e devolver feedback operacional que empurre o fluxo de desenvolvimento para frente ou de volta usando `ancora-fluxo`.
---

# Avaliador Memory Candidate

Use esta skill quando o pedido for:

- "revisa esses memory candidates"
- "ve se isso merece virar skill"
- "faz a avaliacao profunda da inbox"
- "quais erros de reuso ou governanca existem aqui?"
- "isso esta usavel no nosso ecossistema?"
- "quero um veredito operacional para candidates"

Nao use esta skill para:

- captura ainda solta ou ambigua demais; nesse caso use `refinador-intencao`
- curadoria bruta ainda cheia de ruido; nesse caso use `garimpeiro`
- promocao ja decidida e pronta; nesse caso use `promocao-memoria-para-skill`
- criar ou corrigir codigo sem antes fechar o veredito do candidate

## Missao

Avaliar `memory candidate` e `skill_candidate` com profundidade suficiente para responder:

1. isso esta usavel de verdade?
2. isso esta recuperavel de forma simples?
3. isso tem contrato claro e governanca suficiente?
4. isso merece reuso, correcao, rebaixamento ou descarte?
5. para onde o fluxo deve ir agora: avancar ou voltar?

## Regra central

Nao devolver elogio generico.

Toda avaliacao precisa sair com:

- erros concretos encontrados
- impacto operacional
- acao pedida
- fase seguinte ou retorno obrigatorio

Se houver problema material, o fluxo nao avanca por educacao.
Ele retorna.

## Papel no fluxo

Esta skill e dona da fase `revisar` para candidates de memoria e skill.

O contrato padrao do ciclo fica assim:

1. `pensamento`
2. `planejamento`
3. `construir`
4. `revisar` -> `avaliador-memory-candidate`
5. `testar`
6. `veredito`

Se a fase `revisar` encontrar falha relevante:

- emitir retorno automatico para `construir`
- explicitar o motivo
- listar a correcao necessaria

Se `revisar` aprovar:

- avancar para `testar` ou `veredito`, conforme o corte

## Eixos obrigatorios de avaliacao

Avalie sempre estes eixos:

### 1. Nome e recuperacao

- o nome e canonico, curto e facil de lembrar?
- o titulo nao esta narrativo, efemero, ou preso a uma resposta antiga?
- a recuperacao futura por nome vai funcionar sem reler a thread inteira?

### 2. Contrato

- quando usar esta claro?
- quando nao usar esta claro?
- existe fronteira entre memoria, skill local e skill global?
- existe caminho rapido ou entrada operacional?

### 3. Usabilidade

- alguem conseguiria usar isso amanha sem reaprender?
- o output e acionavel?
- o texto aponta proximo passo real em vez de so resumir contexto?

### 4. Reuso

- isso reaproveita fluxo real ou so encapsula um fechamento antigo?
- o contrato serve para mais de um caso?
- existe duplicacao com skill existente?

### 5. Governanca

- conflita com metodo padrao ja ativo?
- viola a regra `acao/evento -> metodo -> contrato`?
- esta tentando virar skill antes de ter metodo e contrato?
- deveria ficar como memoria, e nao como skill?

## Erros que esta skill deve caçar

- titulo fraco como `Sim`, `Nao por completo`, `A implementacao concluiu`
- skill nascida de fechamento narrado ou resumo de sessao
- fluxo sem metodo claro
- contrato sem fronteira de uso
- reuso falso baseado so em repeticao textual
- duplicacao de skill ja existente
- classificacao errada entre local e global
- falta de ponte de recuperacao
- candidate que deveria voltar para `recent_context` ou `durable_memory`

## Saida obrigatoria

A resposta final deve ter quatro blocos curtos:

1. `Veredito do candidate`
2. `Erros encontrados`
3. `Acao operacional`
4. `Fluxo`

O bloco `Fluxo` deve sair usando `ancora-fluxo`.

## Contrato com `ancora-fluxo`

Use `ancora-fluxo` como envelope obrigatorio do desfecho:

- se a avaliacao encontrou falha: `return-flight`
- se a avaliacao aprovou com correcao zero ou residual irrelevante: `post-flight`
- se a avaliacao esta entrando no corte: `pre-flight`

Preferencia de detalhe:

- `clean` por padrao
- `phase-only` so quando o usuario pedir contexto minimo

### Mapeamento automatico

Se houver erro material:

- fase atual: `revisar`
- retorno para: `construir`
- pedido automatico: corrigir os itens listados

Se houver aprovacao:

- fase atual: `revisar`
- avancar para: `testar` ou `veredito`
- pedido automatico: seguir para o proximo gate declarado

## Formato sugerido de saida

```text
Veredito do candidate:
- corrigir antes | promover | rebaixar | descartar | manter em revisao

Erros encontrados:
- ...
- ...

Acao operacional:
- pedido: ...
- impacto: ...

[return-flight | Revisar | avaliador-memory-candidate]
result: candidate reprovado por contrato fraco
back_to: Construir
```

Ou, quando aprovado:

```text
Veredito do candidate:
- promover

Erros encontrados:
- nenhum erro material

Acao operacional:
- pedido: seguir para promocao ou veredito
- impacto: reuso liberado

[post-flight | Revisar | avaliador-memory-candidate]
result: candidate aprovado
next: Veredito
```

## Relacao com outras skills

- `refinador-intencao`: entra antes quando a captura ainda esta frouxa
- `garimpeiro`: entra antes quando a inbox ainda esta ruidosa
- `promocao-memoria-para-skill`: entra depois quando a avaliacao aprovar promocao
- `ancora-fluxo`: moldura obrigatoria do feedback operacional
- `validador-pronto`: entra no fim quando o corte precisar decisao objetiva de prontidao

## Perguntas obrigatorias

Antes de fechar a avaliacao, responda:

- isso esta usavel amanha?
- isso esta facil de recuperar?
- o nome esta canonico?
- o contrato esta claro?
- ha reuso real ou so eco de thread?
- conflita com alguma skill existente?
- a classificacao local/global esta certa?
- devo avancar ou retornar?

## Sinais de pronto

- a avaliacao aponta erros concretos, nao so opiniao
- a saida pede uma acao operacional clara
- o fluxo seguinte ou o retorno ficam explicitados
- `ancora-fluxo` aparece como moldura do desfecho
- fica claro se o candidate deve promover, corrigir, rebaixar ou descartar
