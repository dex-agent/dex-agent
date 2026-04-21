---
name: promocao-memoria-para-skill
description: Use quando o usuario pedir para transformar memoria, nota, processo repetido, aprendizado operacional ou procedimento recorrente em uma skill de projeto ou skill global. Esta skill decide se algo deve ficar como memoria, virar skill local do repo ou ser promovido para a camada global, e exige recuperacao facil, nome canonico, contrato de uso e validacao de reuso.
---

# Promocao Memoria Para Skill

Use esta skill quando o pedido for:
- "memoriza isso como uma habilidade"
- "isso tem que virar skill"
- "isso foi repetido, transforma em habilidade"
- "isso precisa ficar facil de recuperar"
- "isso deve ser skill de projeto ou skill global?"

Nao use esta skill para:
- curadoria bruta de aprendizados sem decisao de promocao
- criar uma skill tecnica sem material repetido ou sem contrato minimamente claro
- substituir `garimpeiro` quando ainda falta evidencia para decidir

## Missao

Transformar algo que ja foi aprendido na pratica em uma habilidade recuperavel e reutilizavel.

A skill deve responder quatro perguntas:
1. isso ainda e so memoria ou ja virou procedimento repetivel?
2. se virou procedimento, ele e local do projeto ou global?
3. qual e o nome canonico mais facil de recuperar?
4. o que precisa ser criado ou atualizado para que eu consiga usar isso de novo sem reaprender?

## Regra central

Nao promover por entusiasmo.

Promova quando houver pelo menos um destes sinais:
- o processo precisou ser reaprendido ou reexplicado
- o fluxo teve 2 a 4 passos ou mais e nao e trivial
- o mesmo tipo de tarefa apareceu mais de uma vez
- esquecer isso geraria retrabalho real
- o usuario disse explicitamente que aquilo deve virar habilidade

Se esses sinais nao existirem, manter como memoria ou nota curta.

## Decisao de destino

### Vira skill de projeto quando:
- depende de runtime, comandos, artefatos, politicas ou contratos de um repo especifico
- usa navegadores, baterias, seeds, dashboards ou scripts que so fazem sentido naquele projeto
- a recuperacao principal deve acontecer dentro do proprio repo

### Vira skill global quando:
- o procedimento atravessa projetos
- o contrato nao depende fortemente de um unico repo
- faz parte do jeito de operar Codex em varios repositorios
- vale a pena reutilizar em varios contextos

### Fica so como memoria quando:
- ainda e instavel
- ainda falta evidencia
- ainda nao existe procedimento claro
- ainda nao compensa virar entrypoint proprio

## O que a skill deve fazer

1. Reconstruir rapidamente o que foi aprendido.
2. Decidir se o aprendizado e memoria, skill local ou skill global.
3. Propor ou escolher um nome canonico curto e facil de recuperar.
4. Criar ou atualizar a skill no lugar certo.
5. Ligar a skill nos pontos de recuperacao rapida:
   - memoria curta
   - handoff
   - napkin, quando fizer sentido
   - memoria global, quando a regra atravessar projetos
6. Validar a recuperacao simulando um pedido futuro.
7. Deixar claro se a promocao ficou completa ou se ainda e so candidata.

## Estrutura minima exigida

Quando a promocao acontecer de verdade, exigir no minimo:
- `SKILL.md`
- nome canonico claro
- contrato de quando usar e quando nao usar
- caminho rapido ou comandos de entrada
- recuperacao rapida
- sinais de pronto

Adicionar script/helper quando a execucao for sensivel ou repetitiva o bastante para justificar.

## Perguntas obrigatorias

Antes de fechar a promocao, responda:
- qual dor de repeticao esta sendo eliminada?
- onde essa habilidade precisa morar?
- como eu vou achar isso rapido depois?
- como eu vou saber que a skill esta operacional e nao so documentada?

## Heuristica proativa

Quando, no meio da conversa, ficar evidente que:
- algo levou varios passos,
- precisou ser refeito,
- ou o usuario provavelmente vai pedir de novo,

voce deve sugerir explicitamente:
- "isso quer virar skill de projeto?"
ou
- "isso ja merece promocao para skill global?"

Nao espere sempre o usuario pedir pela terceira vez.

## Relacao com outras skills

- use `garimpeiro` antes, se ainda houver muito ruido e pouca clareza
- use `memorizador` para consolidar o que precisa virar memoria curada
- use `skill-creator` como apoio de forma, se faltar estrutura
- esta skill e a ponte de decisao e promocao, nao a curadoria bruta

## Sinais de pronto

- a habilidade foi classificada corretamente como local ou global
- existe um nome canonico recuperavel
- a skill foi criada ou atualizada no lugar certo
- a memoria curta aponta para ela quando isso for util
- existe uma simulacao curta mostrando que eu conseguiria acha-la e usa-la de novo
