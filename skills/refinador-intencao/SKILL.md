---
name: refinador-intencao
description: Use quando a captura vier solta, confusa ou ambigua e for preciso fazer perguntas curtas para refinar a intencao antes de decidir entre memoria, skill, estado vivo ou descarte.
---

# Refinador de Intencao

Use esta skill quando aparecer algo como:

- "guarda isso"
- "isso devia virar skill"
- "nao sei se isso e memoria ou skill"
- "isso ficou meio solto"
- "refina isso antes de salvar"
- uma captura curta demais para `/remember`

Nao use esta skill para:

- pedido ja explicito e operacionalmente claro
- promocao ja decidida e pronta para `promocao-memoria-para-skill`
- quando a captura ja trouxer destino, escopo e evidencia suficientes

## Objetivo

Transformar uma captura frouxa em uma decisao clara e acionavel, sem empurrar coisa ambigua para memoria duravel ou skill real cedo demais.

## Regra central

Se a captura nao responder com clareza `o que e`, `para que serve`, `onde vale`, `por que lembrar` e `qual o destino certo`, nao promova ainda. Refine primeiro.

## Perguntas obrigatorias

Pergunte so o minimo necessario, nesta ordem:

1. `Qual e o destino desejado agora?`
   - memoria do projeto
   - skill deste repo
   - skill global
   - apenas estado vivo da conversa
   - ainda nao sei

2. `Isso pertence ao repo raiz do Dex Agent ou a um repo filho?`
   - repo raiz `dex-agent`
   - repo filho especifico
   - ainda nao sei

3. `Isso vale para este repo ou para mais de um projeto?`
   - so este repo
   - varios repos
   - ainda nao sei

4. `O que exatamente precisa sobreviver amanha?`
   - regra
   - decisao
   - procedimento
   - prompt reutilizavel
   - estado atual

5. `Qual e a evidencia minima?`
   - comportamento real observado
   - decisao tomada
   - arquivo ou comando concreto
   - so intuicao por enquanto

6. `Isso vai se repetir mesmo?`
   - sim, varias vezes
   - talvez
   - nao, e so deste caso

## Tratamento por resposta

- Se o destino for `estado vivo`:
  - nao promova para skill
  - trate como continuidade curta

- Se a resposta indicar `repo raiz dex-agent`:
  - manter o contexto no repo `C:\CodexProjetos\dex-agent`
  - nao deixar isso poluir memoria de projeto de repo filho

- Se o destino for `memoria do projeto` e a evidencia for concreta:
  - devolva captura refinada pronta para `/remember`

- Se o destino for `skill deste repo` e houver repeticao clara:
  - preparar resumo refinado
  - encaminhar para `promocao-memoria-para-skill` ou `skill-localizavel`

- Se o destino for `skill global`:
  - confirmar que o padrao e cross-project
  - explicitar por que nao e especifico deste repo

- Se a resposta ainda estiver fraca:
  - estacionar
  - nao inventar promocao

## Saida esperada

Quando terminar o refinamento, devolva sempre:

1. `Captura refinada`
2. `Destino sugerido`
3. `Por que esse destino`
4. `Proximo comando ou proximo passo`

## Formato sugerido

```text
Captura refinada:
...

Destino sugerido:
- recent_context | durable_memory | project_skill | global_skill | estacionar

Por que:
- ...

Proximo passo:
- ...
```

## Exemplos de encaminhamento

- Se virar memoria:
  - `/remember rule: ...`

- Se virar skill local:
  - `usar skill-localizavel para criar pasta real, SKILL.md e entrada no README`

- Se ainda estiver nebuloso:
  - `estacionar com nota curta e nao promover`

## Criterio de pronto

- a captura deixa de estar vaga
- o destino fica claro
- nao sobra competicao entre memoria e skill
- se ainda houver ambiguidade, ela fica explicitada e estacionada
