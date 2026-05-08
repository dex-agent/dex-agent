# Promocao de Memoria Para Skill

## O que esta skill faz

Esta skill existe para evitar um problema recorrente:
- um processo e aprendido na conversa
- funciona
- volta dias depois
- e o agente precisa reaprender ou pedir a mesma explicacao de novo

O objetivo dela e transformar esse aprendizado em algo recuperavel e reutilizavel.

Ela decide quando algo:
- fica so como memoria
- vira skill de projeto
- ou merece promocao para skill global

## Por que isso existe

O sistema de memoria sozinho nao resolve tudo.

Memoria ajuda a lembrar.
Skill ajuda a executar de novo.

Quando um fluxo:
- teve varios passos
- precisou ser reaprendido
- apareceu mais de uma vez
- ou o usuario ja deixou claro que vai pedir de novo

ele deixa de ser apenas nota ou memoria curta. Nesse ponto, precisa virar habilidade recuperavel.

## O problema que queremos eliminar

Nao queremos que o usuario tenha que repetir sempre:
- "memoriza isso como uma habilidade"
- "isso precisa virar skill"
- "isso a gente vai usar de novo"

Tambem nao queremos que o agente dependa da sorte de lembrar uma conversa longa.

O que queremos e:
- detectar repeticao
- sugerir promocao
- avaliar o pedido efetivo antes de abrir uma skill nova
- organizar no lugar certo
- deixar facil de achar depois

Se o candidate ja existir, mas ainda estiver faltando veredito profundo de usabilidade, reuso, governanca e retorno operacional, a skill parceira agora e `avaliador-memory-candidate`.

## Metodo padrao de decisao

Esta skill nao deve transformar local vs global em plebiscito permanente.

Regra operacional:
- se a resposta ficar obvia e forte, o agente decide e atualiza
- se o caso for claramente cross-project, atualiza a skill global canonica e o espelho do repo quando esse espelho fizer parte do contrato
- se o caso for claramente restrito ao projeto, atualiza so a skill local
- o usuario so deve ser consultado quando houver ambiguidade material
- se uma entrada vier marcada como `sugestao` durante um fluxo ou sprint em andamento, o trabalho nao deve ser interrompido; a sugestao vai para estacionamento e volta a ser avaliada no fechamento
- se o usuario pedir expressamente para `tornar metodo padrao`, isso passa a ser caso de governanca global; antes de aplicar, o agente deve revisar conflito, ambiguidade, lacuna ou informacao inconclusiva e perguntar apenas o que faltar para fechar o contrato
- ao comunicar a fase atual, a saida deve mostrar a fase junto do agente responsavel por ela
- quando especialistas colaborarem de forma efetiva numa etapa, o fechamento deve dar credito claro e conciso a essa colaboracao

Em termos praticos, "obvio e forte" significa:
- contrato reutilizavel sem remendo conceitual
- reuso real ou claramente transversal
- recuperacao canonica estavel
- ausencia de conflito serio entre variante local e global

Em termos praticos, consultar o usuario fica reservado para:
- destino principal incerto
- mudanca de nome canonico ou compatibilidade
- duas skills candidatas plausiveis
- evidencia ainda fraca

## Regra de organizacao

### Skill de projeto

Fica dentro do proprio repo quando depende fortemente de:
- runtime daquele projeto
- comandos daquele projeto
- artefatos daquele projeto
- browser, seeds, baterias, dashboards ou contratos daquele projeto

Exemplo:
- bateria recorrente de um `ProjetoAlphaExemplo`

### Skill global

Vai para o vault global quando:
- atravessa projetos
- faz parte do jeito de operar Codex em varios repositorios
- vale a pena reaproveitar em varios contextos

Exemplo atual:
- `promocao-memoria-para-skill`

### Espelho no repo do Dex Agent

Quando uma skill global nascer do contexto operacional do `Dex Agent`, ela nao deve viver so no vault local da maquina.

Ela tambem deve ter copia em:

`<repo-root>/skills/`

Isso existe para:
- distribuicao
- publicacao
- recuperacao dentro do proprio projeto publicavel
- portabilidade para outra maquina ou outro clone que nao compartilhe o mesmo vault global
- protecao contra drift, limpeza ou ausencia futura do ambiente global

Regra de compatibilidade:
- se o arquivo local usar o mesmo nome da skill global, ele deve ser espelho fiel da versao canonica
- se o `Dex Agent` precisar de adaptacao especifica, isso deve virar outra skill com outro nome
- nao remover a copia do repo so porque o ambiente atual enxerga a skill global; isso quebraria a sobrevivencia do projeto fora desta maquina

Exemplo atual:
- `dex-agent-audio-summary`

## O que o agente deve fazer

Quando perceber que um processo:
- levou varios passos
- precisou ser refeito
- ou vai voltar

antes de criar outra skill, o agente deve perguntar para si mesmo:
- o pedido efetivo ja cabe em uma skill existente?
- o menor corte correto e reaproveitar, ampliar ou criar?
- a classificacao entre local e global ja esta obvia e forte?
- isso e so uma `sugestao` que precisa ser estacionada ate o fim do corte atual?
- houve pedido expresso para `tornar metodo padrao` e o contrato global ficou claro o suficiente para valer sem ambiguidade?

o agente deve sugerir explicitamente:
- isso quer virar skill de projeto?
- isso ja merece promocao para skill global?

Nao deve esperar o usuario repetir a mesma explicacao varias vezes.

## O que precisa existir quando a promocao fecha

No minimo:
- `SKILL.md`
- nome canonico
- criterio de uso
- recuperacao rapida
- sinais de pronto

Quando fizer sentido, tambem:
- helper/script
- espelho no repo do `Dex Agent`
- ponteiros em memoria curta e handoff

Quando a decisao global for obvia e forte:
- o espelho do repo deve ser atualizado junto
- a resposta ao usuario deve informar que a promocao ja foi feita, em vez de pedir autorizacao redundante

## Como recuperar rapido

Arquivos principais:
- `SKILL.md`
- `PROMPT_AGENTE_CODEX_CONTEXTO.md`

Uso pratico:
- ler primeiro o `SKILL.md` para o contrato
- usar o prompt quando precisar explicar o contexto completo para outro agente Codex
