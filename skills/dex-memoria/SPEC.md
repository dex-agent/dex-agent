# Spec - Dex Memoria

Atualizado em: `2026-04-26`
Status: `v1 - contrato operacional documentado`
Owner conceitual: `Dex Agent pai`
Cooperacao: `Plano Avancado` + `Clara Checklist Visual`

## 1. Objetivo

Criar um contrato padrao para memoria operacional do Dex Agent, com ciclo de vida completo.

O contrato resolve dois problemas ao mesmo tempo:

1. lembrar bem o que ainda importa;
2. parar de lembrar o que ja foi resolvido, arquivado, substituido ou descartado.

O caso real que motivou esta spec foi o achado do Agendador:

- sintoma: `qual o proximo passo seguro?` respondeu em loop;
- causa resolvida no Dex Agent pai;
- risco observado: a memoria do achado continuar viva em varias superficies depois da correcao;
- aprendizado: memoria operacional precisa ter rito de entrada e rito de saida.

## 2. Escopo

Inclui:

- contrato de criacao de memoria;
- contrato de lembranca;
- contrato de uso;
- contrato de resolucao;
- contrato de arquivamento;
- exemplos reais de entrada e saida;
- plano de implantacao por sprints e fases;
- checklist visual de pronto.

Nao inclui agora:

- scripts automaticos `add`, `resolve`, `archive`, `status`, `audit`;
- hooks automaticos de abertura/fechamento de contexto;
- mudanca no runtime de recall;
- alteracao em `memoryRecallEngine`;
- migracao de memoria antiga;
- reescrita de `.agents/MEMORY.ndjson`.

## 3. Relacao Com `docs/memory-system`

`docs/memory-system/README.md` continua sendo a documentacao de arquitetura e runtime.

`skills/dex-memoria` e a skill pratica de operacao:

- quando usar memoria;
- como preencher contrato;
- como resolver memoria;
- como impedir memoria stale;
- como ensinar repos filhos a usar o mesmo ritual.

Ela substitui o uso operacional solto de `docs/memory-system`, mas nao substitui nem remove a documentacao tecnica do runtime.

Regra:

- se a pergunta for "como o runtime funciona?", ler `docs/memory-system`;
- se a pergunta for "como eu registro, lembro ou removo esta memoria?", usar `dex-memoria`.

## 4. Conceitos

### 4.1 Memoria Viva

Memoria que pode influenciar retomada, proximo passo ou decisao operacional.

Exemplos:

- bloqueio ativo;
- objetivo atual;
- achado ainda nao corrigido;
- corte em execucao;
- regra operacional que afeta a proxima acao.

Superficies possiveis:

- `INDEX.md`
- `.agents/HANDOFF.md`
- `.agents/ACTIVE.md`
- `.agents/sprints/INDEX.md`
- artefato ativo em `.agents/`

### 4.2 Ledger

Registro historico duravel, append-only, usado para auditoria e recall auxiliar.

Superficie:

- `.agents/MEMORY.ndjson`

Regra:

- ledger nao manda no proximo passo;
- ledger nao reabre tarefa sozinho;
- ledger pode explicar por que algo foi feito;
- ledger pode ser superseded sem apagar historico.

### 4.3 Arquivo

Destino de coisa encerrada.

Superficies:

- `.agents/ARQUIVADO/`
- `.agents/archive/`

Regra:

- arquivo e historico;
- arquivo nao compete com `HANDOFF.md`;
- arquivo so volta ao vivo por pedido explicito ou novo corte.

## 5. Estados Oficiais

Use estes estados de forma consistente:

| Estado        | Pode orientar proximo passo? | Uso                                               |
| ------------- | ---------------------------- | ------------------------------------------------- |
| `ativa`       | Sim                          | Memoria viva que ainda afeta retomada ou execucao |
| `resolvida`   | Nao                          | Problema corrigido ou decisao cumprida            |
| `arquivada`   | Nao                          | Encerrada e movida para arquivo                   |
| `superseded`  | Nao                          | Substituida por memoria mais nova                 |
| `descartada`  | Nao                          | Captura rejeitada como memoria util               |
| `estacionada` | Nao, salvo pedido explicito  | Residuo util, mas fora do corte atual             |

Transicoes permitidas:

```text
captura -> ativa
captura -> ledger-only
captura -> estacionada
captura -> descartada
ativa -> resolvida
ativa -> superseded
ativa -> estacionada
resolvida -> arquivada
estacionada -> ativa
estacionada -> descartada
ledger-only -> superseded
```

Transicoes proibidas:

```text
resolvida -> ativa sem novo pedido explicito
arquivada -> ativa por recall automatico
ledger-only -> proximo passo vivo sem promocao explicita
descartada -> ativa sem nova evidencia
```

## 6. Prioridade Entre Fontes

Quando houver conflito, vence a camada mais viva:

1. `INDEX.md`
2. `.agents/HANDOFF.md`
3. `.agents/ACTIVE.md`
4. sprint ou artefato ativo
5. `.agents/MEMORY.ndjson`
6. `.agents/ARQUIVADO/` ou `.agents/archive/`

Regras:

- `HANDOFF.md` e dono do proximo passo seguro;
- `ACTIVE.md` e dono do objetivo vivo e loops abertos;
- `INDEX.md` localiza rapido e aponta para a camada correta;
- `.agents/MEMORY.ndjson` e ledger, nao fonte principal do proximo passo;
- artefato arquivado so serve como evidencia historica.

Exemplo de conflito:

```text
MEMORY.ndjson diz: "investigar loop do proximo passo".
HANDOFF.md diz: "achado resolvido; manter backend fechado".
```

Saida correta:

```text
Vence HANDOFF.md. O achado nao e proximo passo. O ledger fica como historico.
```

## 7. Campos Obrigatorios Da Memoria

Toda memoria operacional precisa responder:

```yaml
id: identificador curto e estavel
titulo: nome humano
tipo: regra | decisao | procedimento | achado | estado | residuo | aprendizado
estado: ativa | resolvida | arquivada | superseded | descartada | estacionada
escopo: repo | projeto-filho | subsistema | tarefa | cross-project
origem: arquivo, comando, Telegram, revisao, teste ou reuniao
evidencia: caminho, teste, message_id, screenshot ou decisao registrada
o_que_lembrar: resumo curto do conteudo
por_que_lembrar: risco ou valor pratico
quando_lembrar: gatilhos objetivos
quanto_lembrar: tamanho maximo ou nivel de detalhe
como_usar_depois: acao esperada quando a memoria for relevante
quando_nao_lembrar: condicoes de exclusao
fonte_viva: INDEX.md, HANDOFF.md, ACTIVE.md, artefato, ledger ou arquivo
criterio_de_resolucao: prova minima para sair do estado vivo
arquivamento: destino quando fechar
supersedes: ids ou arquivos substituidos
proximo_dono: pessoa, skill, fase ou arquivo responsavel
```

## 8. Ritual De Criacao

Use este ritual quando surgir uma nova captura.

### Fase 1 - Pensamento

Perguntas:

- Isto e memoria, estado vivo, tarefa, skill-candidate, residuo ou ruido?
- Quem vai sofrer se isto for esquecido?
- Quem vai sofrer se isto ficar vivo para sempre?
- A evidencia existe ou e so intuicao?

Saida:

```text
Classificacao inicial: memoria operacional | ledger-only | estacionar | descartar | skill-candidate
```

### Fase 2 - Planejamento

Definir:

- camada de destino;
- fonte viva;
- gatilhos de lembranca;
- gatilhos de exclusao;
- criterio de resolucao.

Saida:

```text
Contrato preenchido antes de gravar.
```

### Fase 3 - Construir

Executar uma das acoes:

- atualizar `INDEX.md`, `ACTIVE.md` ou `HANDOFF.md` se for memoria viva;
- criar artefato em `.agents/` se precisar de contexto detalhado;
- anexar ledger se for memoria duravel;
- estacionar se for lateral;
- descartar se nao houver valor.

### Fase 4 - Revisar

Checar:

- a memoria tem `quando_nao_lembrar`;
- a memoria tem evidencia;
- a memoria nao compete com outra fonte viva;
- o proximo passo nao ficou duplicado em varios lugares.

### Fase 5 - Testar

Perguntas de teste:

- Se eu perguntar "onde paramos?", esta memoria aparece corretamente?
- Se eu perguntar "qual o proximo passo seguro?", ela aparece apenas se ainda for viva?
- Se ela for resolvida, o sistema para de apontar para ela?

### Fase 6 - Veredito

Responder:

```text
Veredito: ativa | ledger-only | estacionada | descartada
Fonte de verdade: <arquivo>
Proximo criterio de revisao: <evento>
```

## 9. Ritual De Resolucao

Use quando uma memoria ativa deixou de ser verdadeira ou deixou de orientar acao.

### Fase 1 - Provar

Exigir evidencia minima:

- teste passou;
- decisao foi tomada;
- Telegram real confirmou;
- arquivo foi atualizado;
- sprint fechou;
- mensagem foi enviada e retornou `message_id`.

### Fase 2 - Remover Ponteiros Vivos

Atualizar obrigatoriamente tudo que ainda pode orientar proximo passo:

- `INDEX.md`
- `.agents/HANDOFF.md`
- `.agents/ACTIVE.md`
- `.agents/sprints/INDEX.md`, se existir entrada;
- artefato local do achado;
- ledger, se houver supersedencia.

### Fase 3 - Marcar Historico

O artefato resolvido deve dizer:

```yaml
estado: resolvida
nao_usar_para: proximo passo operacional
evidencia_de_fechamento: caminho, teste, message_id ou screenshot
```

### Fase 4 - Avisar Dono Afetado

Se a memoria veio de repo filho, avisar o filho:

- via `dex-pai`, se for bug do Dex Agent pai;
- via `dex-rede`, se for handoff entre filhos;
- com `message_id` quando enviado por helper/API.

### Fase 5 - Testar Regressao

Pergunta obrigatoria:

```text
qual o proximo passo seguro?
```

Passa se:

- nao aponta para memoria resolvida;
- usa `HANDOFF.md`/estado vivo correto;
- nao repete a instrucao de teste como proximo passo.

## 10. Plano Avancado Para Implementacao

Este plano transforma a spec em trabalho executavel. Cada sprint deve fechar com:

- arquivos alterados;
- evidencia de revisao;
- checklist marcado;
- risco restante declarado;
- proximo sprint indicado.

### Ordem Definida Pela Clara

Clara Checklist organiza a ordem assim:

1. Fixar a casa da skill e o inventario.
2. Fechar o contrato minimo.
3. Criar templates e exemplos.
4. Integrar com operacao dos filhos.
5. Validar com QA operacional.
6. So depois avaliar scripts v2.

Motivo:

- nao faz sentido criar automacao antes de provar o contrato;
- nao faz sentido testar filhos antes de existir template;
- nao faz sentido promover ledger ou skill antes de separar memoria viva, ledger e arquivo.

### Sprint 0 - Preparacao E Fonte De Verdade

Objetivo:

- deixar claro onde a skill vive, qual documento lidera o uso pratico e qual documento continua sendo arquitetura.

Owner:

- `Ivo Implementa`, com checklist de `Clara Checklist Visual`.

Arquivos de implementacao:

- `skills/dex-memoria/SKILL.md`
- `skills/dex-memoria/SPEC.md`
- `skills/README.md`

Fases:

1. Pensamento: confirmar que `dex-memoria` e skill local do repo pai, nao espelho global.
2. Planejamento: declarar a separacao entre `docs/memory-system` e `skills/dex-memoria`.
3. Construir: criar ou ajustar `SKILL.md` para apontar para `SPEC.md`.
4. Revisar: conferir se a v1 nao promete scripts.
5. Testar: checar se `skills/README.md` localiza a skill.
6. Veredito: skill descobrivel por clone do repo.

Entregaveis:

- skill com frontmatter valido;
- spec referenciada pelo `SKILL.md`;
- inventario atualizado.

Checklist:

- [ ] `skills/dex-memoria/SKILL.md` existe.
- [ ] `SKILL.md` tem `name: dex-memoria`.
- [ ] `SKILL.md` aponta para `SPEC.md`.
- [ ] `SPEC.md` declara que v1 nao tem scripts.
- [ ] `skills/README.md` lista `dex-memoria` em skills locais.

Criterio de aceite:

- outro agente consegue encontrar a skill lendo apenas `skills/README.md` e `SKILL.md`.

### Sprint 1 - Contrato Minimo Da Memoria

Objetivo:

- formalizar a gramatica minima: estados, campos, camadas, prioridade e transicoes.

Owner:

- `Ivo Implementa`, com pressao de revisao de `Questionador` e `Chato` quando houver ambiguidade.

Arquivos de implementacao:

- `skills/dex-memoria/SPEC.md`
- `skills/dex-memoria/templates/memory-contract.md`

Fases:

1. Pensamento: classificar memoria em `viva`, `ledger`, `arquivo`, `residuo` ou `descarte`.
2. Planejamento: definir estados oficiais e transicoes permitidas/proibidas.
3. Construir: escrever campos obrigatorios e prioridade entre fontes.
4. Revisar: testar conflito `HANDOFF.md` vs `MEMORY.ndjson`.
5. Testar: aplicar ao caso do Agendador resolvido.
6. Veredito: contrato impede memoria resolvida de virar proximo passo.

Entregaveis:

- tabela de estados;
- lista de transicoes;
- campos obrigatorios;
- regra de prioridade entre fontes;
- template de contrato.

Checklist:

- [ ] Estados oficiais incluem `ativa`, `resolvida`, `arquivada`, `superseded`, `descartada`, `estacionada`.
- [ ] Transicoes proibidas impedem `resolvida -> ativa` sem novo pedido explicito.
- [ ] `quando_nao_lembrar` e campo obrigatorio.
- [ ] `HANDOFF.md` vence `MEMORY.ndjson` para proximo passo.
- [ ] Ledger e descrito como historico auxiliar, nao fila viva.

Criterio de aceite:

- dado um conflito entre ledger antigo e `HANDOFF.md` atualizado, o contrato retorna `HANDOFF.md` como fonte vencedora.

### Sprint 2 - Templates E Exemplos Reais

Objetivo:

- fornecer material copiavel para humanos, agentes filhos e futuras instalacoes do Dex Agent.

Owner:

- `Ivo Implementa`, com revisao de `Clara Checklist Visual`.

Arquivos de implementacao:

- `skills/dex-memoria/templates/memory-contract.md`
- `skills/dex-memoria/templates/memory-resolution-checklist.md`
- `skills/dex-memoria/examples/active-operational-memory.md`
- `skills/dex-memoria/examples/resolved-operational-finding.md`
- `skills/dex-memoria/examples/ledger-only-memory.md`

Fases:

1. Pensamento: escolher exemplos que cubram entrada ativa, saida resolvida e ledger-only.
2. Planejamento: manter formato simples em Markdown com blocos YAML/JSON.
3. Construir: criar templates e exemplos com entrada e saida.
4. Revisar: garantir que nenhum exemplo omite `quando_nao_lembrar`.
5. Testar: usar o exemplo resolvido do Agendador como regressao.
6. Veredito: repo filho consegue usar sem improvisar contrato.

Entregaveis:

- template de criacao;
- checklist de resolucao;
- exemplo ativo;
- exemplo resolvido;
- exemplo ledger-only.

Checklist:

- [ ] Todo exemplo tem `Entrada Real`.
- [ ] Todo exemplo tem `Saida Correta`.
- [ ] Exemplo ativo aponta `fonte_viva`.
- [ ] Exemplo resolvido declara `nao_usar_para: proximo passo operacional`.
- [ ] Exemplo ledger-only declara que nao atualiza `HANDOFF.md`.

Criterio de aceite:

- um agente consegue preencher um caso novo copiando o template sem perguntar qual campo falta.

### Sprint 3 - Integracao Com Operacao Dos Filhos

Objetivo:

- definir como repos filhos usam `dex-memoria` sem poluir o pai, sem mandar para bot errado e sem confundir `dex-pai` com `dex-rede`.

Owner:

- `Ivo Implementa`, com apoio de `dex-pai` e `dex-rede` como contratos de comunicacao.

Arquivos de implementacao:

- `skills/dex-memoria/SPEC.md`
- `skills/dex-pai/SKILL.md`
- `skills/dex-rede/SKILL.md`

Fases:

1. Pensamento: decidir se o evento pertence ao filho, ao pai, a outro filho ou ao ledger.
2. Planejamento: escolher destino: `dex-pai`, `dex-rede`, `estacionamento`, ledger ou descarte.
3. Construir: registrar no contrato a rota escolhida e a evidencia exigida.
4. Revisar: conferir se token, segredo ou chat_id nao foram expostos.
5. Testar: exigir `message_id` quando houver helper Telegram/API.
6. Veredito: comunicacao entre projetos fica rastreavel e reversivel.

Entregaveis:

- regra de roteamento por destino;
- criterio de evidencia para envio;
- exemplo de uso com `message_id`;
- limite claro: bot nao fala com bot como usuario.

Checklist:

- [ ] Bug do Dex Agent pai usa `dex-pai`.
- [ ] Handoff filho-para-filho usa `dex-rede`.
- [ ] Residuo lateral vai para estacionamento.
- [ ] Aprendizado sem acao vira ledger-only.
- [ ] Envio por helper registra bot destino, alias e `message_id`.
- [ ] Nenhum exemplo expoe token.

Criterio de aceite:

- dado um achado em `MemoriaGeral` que precisa ir para `ControlePessoal`, a spec manda usar `dex-rede`, nao `dex-pai`.

### Sprint 4 - QA Operacional

Objetivo:

- provar que o contrato evita memoria stale e que a resolucao remove ponteiros vivos.

Owner:

- `Tereza Testa`, com checklist de `Clara Checklist Visual`.

Arquivos de implementacao:

- `skills/dex-memoria/SPEC.md`
- `skills/dex-memoria/templates/memory-resolution-checklist.md`
- artefato real do caso testado em `.agents/`, quando houver.

Fases:

1. Pensamento: escolher um caso real ou simulado com memoria ativa e resolucao.
2. Planejamento: definir pergunta de retomada e pergunta de exclusao.
3. Construir: preencher contrato e checklist de resolucao.
4. Revisar: remover ou substituir todos os ponteiros vivos.
5. Testar: perguntar `onde paramos?` e `qual o proximo passo seguro?`.
6. Veredito: memoria resolvida nao aparece como proximo passo.

Entregaveis:

- registro do caso testado;
- checklist de resolucao preenchido;
- evidencia de que `HANDOFF.md` vence ledger;
- veredito de regressao.

Checklist:

- [ ] Teste com memoria `ativa`.
- [ ] Teste com memoria `resolvida`.
- [ ] Teste com memoria `ledger-only`.
- [ ] Teste com conflito `HANDOFF.md` vs `MEMORY.ndjson`.
- [ ] Teste com artefato arquivado.
- [ ] Resultado registrado com evidencia.

Criterio de aceite:

- pergunta livre de proximo passo nao aponta para memoria resolvida nem para arquivo arquivado.

### Sprint 5 - Evolucao Para Scripts V2

Objetivo:

- preparar uma automacao futura sem antecipar complexidade nem esconder decisao operacional.

Owner:

- `Paula Planeja` decide abertura; `Ivo Implementa` executa apenas se houver repeticao real.

Arquivos candidatos futuros:

- `skills/dex-memoria/scripts/add.ps1`
- `skills/dex-memoria/scripts/resolve.ps1`
- `skills/dex-memoria/scripts/archive.ps1`
- `skills/dex-memoria/scripts/status.ps1`
- `skills/dex-memoria/scripts/audit.ps1`

Fases:

1. Pensamento: observar pelo menos tres usos reais do ritual manual.
2. Planejamento: escolher um unico comando para v2, nao todos de uma vez.
3. Construir: implementar primeiro com `-DryRun`.
4. Revisar: garantir que nenhum script reescreve ledger sem confirmacao.
5. Testar: rodar contra fixture ou caso controlado.
6. Veredito: script reduz erro humano sem substituir criterio.

Entregaveis:

- backlog v2;
- criterio para abrir automacao;
- lista de comandos candidatos;
- regra de seguranca de escrita.

Checklist:

- [ ] Existem pelo menos tres usos reais do ritual manual.
- [ ] O comando escolhido tem entrada e saida claras.
- [ ] Existe modo `-DryRun`.
- [ ] Nenhum script escreve token, segredo ou `.env`.
- [ ] Nenhum script promove ledger para vivo sem confirmacao.

Criterio de aceite:

- v2 so abre se houver repeticao real e se o comando puder falhar de forma segura.

## 11. Clara Checklist Visual

### Objetivo Do Checklist

Organizar o `SPEC.md` para implementacao real, separando acao, criterio, risco, residuo e ordem de execucao.

### Fonte Dos Itens

- `skills/dex-memoria/SPEC.md`
- `skills/dex-memoria/SKILL.md`
- `skills/README.md`
- caso real `agendador.loop-proximo-passo`
- regra de governanca: acao/evento -> metodo -> contrato

### Itens Classificados

Acao:

- criar ou revisar skill local `dex-memoria`;
- manter `SPEC.md` como contrato operacional;
- manter templates copiaveis;
- manter exemplos reais;
- atualizar inventario `skills/README.md`;
- validar formatacao Markdown.

Criterio:

- todo exemplo tem entrada e saida;
- todo fluxo tem `quando_nao_lembrar`;
- memoria resolvida nao orienta proximo passo;
- ledger nao vence `HANDOFF.md`;
- scripts ficam fora da v1.

Risco:

- transformar ledger em fila viva;
- criar script cedo demais;
- duplicar regra entre docs e skill;
- esquecer de avisar repo filho quando memoria for resolvida;
- deixar checklist bonito, mas sem criterio de aceite.

Duvida:

- nenhuma decisao bloqueante para v1.

Residuo:

- comandos automaticos v2;
- UX de botoes Telegram para memoria;
- auditoria visual futura;
- migracao de memorias antigas.

### Ordem Definida

1. Sprint 0: casa da skill e inventario.
2. Sprint 1: contrato minimo.
3. Sprint 2: templates e exemplos.
4. Sprint 3: integracao com filhos.
5. Sprint 4: QA operacional.
6. Sprint 5: scripts v2 apenas se houver repeticao real.

### Checklist Visual Final

Sprint 0:

- [ ] `SKILL.md` explica quando usar `dex-memoria`.
- [ ] `SKILL.md` aponta para `SPEC.md`.
- [ ] `skills/README.md` lista `dex-memoria`.
- [ ] V1 declara explicitamente que nao tem scripts.

Sprint 1:

- [ ] `SPEC.md` tem estados oficiais.
- [ ] `SPEC.md` tem transicoes permitidas e proibidas.
- [ ] `SPEC.md` tem campos obrigatorios.
- [ ] `SPEC.md` afirma que `HANDOFF.md` vence `MEMORY.ndjson`.

Sprint 2:

- [ ] Template de criacao existe.
- [ ] Checklist de resolucao existe.
- [ ] Exemplo ativo existe.
- [ ] Exemplo resolvido existe.
- [ ] Exemplo ledger-only existe.

Sprint 3:

- [ ] Rota `dex-pai` esta clara.
- [ ] Rota `dex-rede` esta clara.
- [ ] Estacionamento esta separado de memoria viva.
- [ ] `message_id` e exigido quando houver envio por helper/API.

Sprint 4:

- [ ] Caso ativo testado.
- [ ] Caso resolvido testado.
- [ ] Caso ledger-only testado.
- [ ] Conflito `HANDOFF.md` vs `MEMORY.ndjson` testado.

Sprint 5:

- [ ] Backlog v2 separado.
- [ ] Automacao depende de repeticao real.
- [ ] Scripts futuros exigem `-DryRun`.
- [ ] Escrita forte continua com confirmacao.

### Entrega Para

- `Ivo Implementa`: executar sprints 0 a 3.
- `Tereza Testa`: executar sprint 4.
- `Paula Planeja`: decidir se sprint 5 vira trabalho real no futuro.

### Proximo Especialista Indicado

- `mapeador-implementacao`, se a proxima ordem for implementar scripts ou ajustar runtime.
- `tio-testador`, se a proxima ordem for provar o contrato em caso real.

## 12. Exemplos Reais De Entrada E Saida

### 12.1 Entrada Ativa - Achado Do Agendador

Entrada:

```text
Projeto: AgendadorConsultasOticas
Origem: dex_agendadorconsultas_bot
Sintoma: pergunta "qual o proximo passo seguro?" respondeu em loop.
Artefato: .agents/DEX_AGENT_PAI_SINTOMA_LOOP_PROXIMO_PASSO_SEGURO.md
Estado atual: ainda nao corrigido no Dex Agent pai.
```

Saida:

```yaml
id: agendador.loop-proximo-passo
titulo: Loop em pergunta livre de proximo passo
tipo: achado
estado: ativa
escopo: projeto-filho
origem: Telegram + artefato local
evidencia:
  - C:\CodexProjetos\AgendadorConsultasOticas\.agents\DEX_AGENT_PAI_SINTOMA_LOOP_PROXIMO_PASSO_SEGURO.md
o_que_lembrar: pergunta livre de proximo passo entrou em loop
por_que_lembrar: impede retomada confiavel do Agendador
quando_lembrar: retomada do Agendador, teste de proximo passo, correcao no Dex Agent pai
quanto_lembrar: resumo curto + caminho do artefato
como_usar_depois: investigar no repo pai, sem reabrir backend do Agendador
quando_nao_lembrar: depois de patch no pai, testes locais, Telegram vivo e aviso ao filho
fonte_viva: .agents/HANDOFF.md
criterio_de_resolucao: pergunta livre responde via estado operacional e nao repete a propria pergunta
arquivamento: artefato historico no projeto filho
supersedes: []
proximo_dono: Dex Agent pai
```

### 12.2 Saida Resolvida - Mesmo Achado

Entrada:

```text
Patch aplicado em src/bot/handlers.ts.
Teste unitario passou.
Teste vivo no dex_agendadorconsultas_bot passou.
Aviso enviado ao filho via dex-rede com message_id 185.
```

Saida:

```yaml
id: agendador.loop-proximo-passo
estado: resolvida
nao_usar_para: proximo passo operacional
evidencia_de_fechamento:
  - tests/handlers.test.ts
  - C:\CodexProjetos\dex-agent\.agents\INBOX\agendador-loop-fix-final-pass-2026-04-26.png
  - message_id: 185
atualizar_obrigatorio:
  - INDEX.md
  - .agents/ACTIVE.md
  - .agents/HANDOFF.md
  - artefato local do achado
  - MEMORY.ndjson se houver ledger relacionado
resultado: manter apenas como historico auditavel
```

Resposta esperada ao usuario:

```text
Veredito: resolvido.
O achado nao deve mais orientar o proximo passo do Agendador.
O proximo passo seguro volta a ser o que esta em HANDOFF.md.
```

### 12.3 Ledger-Only - Aprendizado De Metodo

Entrada:

```text
Aprendizado: memoria nao pode ser so anotacao; precisa ter ciclo de vida.
```

Saida:

```json
{
  "id": "memory.lifecycle-contract",
  "createdAt": "2026-04-26T00:00:00-03:00",
  "project": "dex-agent",
  "scope": "repo",
  "kind": "rule",
  "title": "Memoria precisa de ciclo de vida",
  "summary": "Toda memoria operacional deve declarar quando lembrar, quando nao lembrar e como sair do estado vivo.",
  "evidence": [
    {
      "type": "operator",
      "ref": "reuniao operacional de ciclo de vida da memoria"
    }
  ],
  "tags": ["memory-system", "governance", "lifecycle"],
  "supersedes": [],
  "confidence": "high",
  "source": "operator"
}
```

Uso correto:

```text
Pode orientar o metodo, mas nao vira proximo passo sozinho.
```

### 12.4 Supersedencia

Entrada:

```text
Memoria antiga: "ler INDEX, ACTIVE e HANDOFF basta para toda retomada".
Nova regra: auditoria de protocolo tambem deve conferir AGENTS.md, sprints e estacionamento quando houver sinais ativos.
```

Saida:

```yaml
id: memory.recall-protocol-v2
estado: ativa
tipo: regra
supersedes:
  - memory.recall-protocol-v1
quando_lembrar: auditoria de retomada, pergunta sobre protocolo, validacao de memoria
quando_nao_lembrar: retomada curta simples sem sprint, residuo ou auditoria
fonte_viva: docs/memory-system/README.md + skills/dex-memoria/SPEC.md
```

## 13. Criterio De Pronto Da Skill

A skill esta pronta quando:

- explica o ciclo completo da memoria;
- tem contrato preenchivel;
- tem checklist de resolucao;
- tem exemplos reais de entrada e saida;
- diferencia memoria viva, ledger e arquivo;
- impede que memoria resolvida volte como proximo passo;
- nao adiciona automacao prematura;
- esta registrada em `skills/README.md`.

## 14. Criterio De Regressao

Falhou se:

- uma memoria resolvida ainda aparecer como proximo passo;
- `MEMORY.ndjson` vencer `HANDOFF.md` em retomada operacional;
- um exemplo nao tiver `quando_nao_lembrar`;
- a skill sugerir scripts v1;
- repo filho nao souber se deve usar `dex-pai`, `dex-rede`, ledger ou estacionamento;
- o contrato exigir leitura manual de muitos arquivos sem apontar fonte viva.

## 15. Proximo Passo

Depois desta v1, usar a skill em um caso real novo antes de criar scripts.

Se o mesmo ritual se repetir pelo menos tres vezes com baixa ambiguidade, abrir sprint v2 para comandos:

- `add`;
- `resolve`;
- `archive`;
- `status`;
- `audit`.
