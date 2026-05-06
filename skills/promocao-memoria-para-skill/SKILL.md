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

Antes de promover, avaliar o pedido efetivo.

Pergunta-chave:

- o usuario quer mesmo uma skill nova
- ou quer eliminar uma dor de repeticao com o menor corte reutilizavel possivel?

Regra pratica:

- se ja existir uma skill que cobre o pedido efetivo, preferir reaproveitar ou ampliar essa skill
- se o contrato atual quase cobre o pedido e so falta explicitar um uso real, atualizar a skill existente em vez de abrir outra
- so criar skill nova quando o pedido efetivo introduzir outro contrato, outro destino de recuperacao ou outro tipo de execucao
- nao abrir skill concorrente por formulacao diferente do mesmo trabalho

Metodo padrao:

- se a classificacao ficar obvia e forte, decidir sem escalar ao usuario
- se o reuso cross-project ficar obvio e forte, atualizar a skill global canonica e manter o espelho local quando houver repo-espelho oficial
- se o aprendizado for claramente restrito ao repo, atualizar so a skill local
- consultar o usuario apenas quando houver ambiguidade material de destino, contrato ou impacto
- se uma entrada vier marcada como `sugestao` no meio de um fluxo ou sprint em andamento, nao interromper o trabalho; estacionar e avaliar no fechamento do corte
- se o usuario pedir expressamente para `tornar metodo padrao`, tratar isso como governanca global por definicao; antes de aplicar, revisar ambiguidade, conflito, lacuna ou informacao inconclusiva e perguntar so o que faltar para fechar o contrato com seguranca
- ao comunicar a fase atual, mostrar a fase junto do agente responsavel por ela
- em cada etapa ou fase, dar credito claro e breve para toda colaboracao efetiva de especialista que tiver entrado de verdade no corte

Motivo do espelho local quando a skill e global:

- o repo nao deve depender exclusivamente do vault global da maquina para continuar operacional
- outra maquina, outro clone ou outro ambiente pode nao ter acesso ao mesmo conjunto de skills globais
- o vault global pode mudar, ser limpo ou divergir ao longo do tempo
- o espelho no repo protege portabilidade, distribuicao, publicacao e recuperacao futura do contrato
- por isso, nao trate a copia no repo como duplicacao inutil quando ela fizer parte do metodo de sobrevivencia do projeto

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

## Obvio e forte

Considere a promocao como obvia e forte quando a maior parte destes sinais aparecer:

- o mesmo contrato serve para mais de um repo sem remendo conceitual
- ja houve reuso real fora do contexto que originou a habilidade, ou o contrato e claramente transversal
- a recuperacao por nome, comando ou fluxo canonico ficou estavel
- nao existe conflito serio entre variante local e variante global
- deixar isso apenas local criaria reaprendizado evitavel em outros projetos

Nesses casos, a regra e operacional:

- promover direto
- atualizar a casa canonica correta
- espelhar no repo oficial quando esse espelho fizer parte do contrato
- avisar o que foi feito, em vez de pedir permissao de novo
- registrar por que o espelho local existe, para evitar que uma manutencao futura o remova por falsa simplificacao

## Quando consultar o usuario

Consultar o usuario vira excecao, reservada para casos como:

- tanto local quanto global parecem plausiveis e os trade-offs nao sao obvios
- a promocao mudaria nome canonico, destino principal ou compatibilidade ja em uso
- existem duas skills candidatas com contratos diferentes e ambas parecem defensaveis
- a evidencia ainda e insuficiente para chamar o caso de forte

### Fica so como memoria quando:

- ainda e instavel
- ainda falta evidencia
- ainda nao existe procedimento claro
- ainda nao compensa virar entrypoint proprio

## O que a skill deve fazer

1. Reconstruir rapidamente o que foi aprendido.
2. Avaliar o pedido efetivo antes de nomear a solucao:
   - ja existe skill que resolve isso?
   - o corte certo e reaproveitar, ampliar ou criar?
3. Decidir se o aprendizado e memoria, skill local ou skill global.
4. Propor ou escolher um nome canonico curto e facil de recuperar.
5. Criar ou atualizar a skill no lugar certo.
6. Quando a decisao global for obvia e forte, atualizar tambem o espelho oficial do repo que participa desse contrato.
7. Ligar a skill nos pontos de recuperacao rapida:
   - memoria curta
   - handoff
   - napkin, quando fizer sentido
   - memoria global, quando a regra atravessar projetos
8. Validar a recuperacao simulando um pedido futuro.
9. Deixar claro se a promocao ficou completa ou se ainda e so candidata.

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

- qual e o pedido efetivo por tras da formulacao do usuario?
- isso ja cabe em uma skill existente?
- o corte correto e atualizar a skill atual ou criar outra?
- qual dor de repeticao esta sendo eliminada?
- onde essa habilidade precisa morar?
- a classificacao ficou obvia e forte ou ainda existe ambiguidade material?
- isso e uma `sugestao` que deve ser estacionada ate o fim do sprint atual?
- houve pedido expresso para `tornar metodo padrao` e, se sim, o contrato global ficou sem ambiguidade nem conflito?
- existe risco de o repo perder acesso ao vault global em outra maquina, outro clone ou outra fase futura?
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
- use `avaliador-memory-candidate` antes, se o candidate ja estiver identificado mas ainda precisar veredito profundo de usabilidade, reuso, governanca e fluxo de correcao
- use `dex-memoria` para consolidar o que precisa virar memoria curada
- use `skill-creator` como apoio de forma, se faltar estrutura
- esta skill e a ponte de decisao e promocao, nao a curadoria bruta

## Sinais de pronto

- a habilidade foi classificada corretamente como local ou global
- o agente saberia explicar por que promoveu direto ou por que consultou o usuario
- existe um nome canonico recuperavel
- a skill foi criada ou atualizada no lugar certo
- a memoria curta aponta para ela quando isso for util
- existe uma simulacao curta mostrando que eu conseguiria acha-la e usa-la de novo
