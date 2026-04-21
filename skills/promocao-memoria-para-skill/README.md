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
- organizar no lugar certo
- deixar facil de achar depois

## Regra de organizacao

### Skill de projeto

Fica dentro do proprio repo quando depende fortemente de:
- runtime daquele projeto
- comandos daquele projeto
- artefatos daquele projeto
- browser, seeds, baterias, dashboards ou contratos daquele projeto

Exemplo:
- bateria recorrente do `AgendadorConsultasOticas`

### Skill global

Vai para o vault global quando:
- atravessa projetos
- faz parte do jeito de operar Codex em varios repositorios
- vale a pena reaproveitar em varios contextos

Exemplo atual:
- `promocao-memoria-para-skill`

### Skill local do Dex Agent

Fica no repo quando depende do runtime, dos scripts e dos contratos especificos do produto.

Exemplo atual:
- `dex-agent-audio-summary`

### Espelho no repo do Dex Agent

Quando uma skill global nascer do contexto operacional do `Dex Agent`, ela nao deve viver so no vault local da maquina.

Ela tambem deve ter copia em:

`<repo-root>/skills/`

Isso existe para:
- distribuicao
- publicacao
- recuperacao dentro do proprio projeto publicavel

Regra de compatibilidade:
- se o arquivo local usar o mesmo nome da skill global, ele deve ser espelho fiel da versao canonica
- se o `Dex Agent` precisar de adaptacao especifica, isso deve virar outra skill com outro nome

## O que o agente deve fazer

Quando perceber que um processo:
- levou varios passos
- precisou ser refeito
- ou vai voltar

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

## Como recuperar rapido

Arquivos principais:
- `SKILL.md`
- `PROMPT_AGENTE_CODEX_CONTEXTO.md`

Uso pratico:
- ler primeiro o `SKILL.md` para o contrato
- usar o prompt quando precisar explicar o contexto completo para outro agente Codex
