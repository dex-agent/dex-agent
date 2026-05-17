# Spec - Dex Memoria

## 1. Objetivo

Definir um contrato operacional para memoria com ciclo de vida em projetos Dex Agent e fluxos relacionados.

O objetivo nao e "lembrar tudo". O objetivo e preservar memoria util, auditavel e recuperavel sem deixar achados resolvidos continuarem vivos como proximo passo.

`memorizador`, neste pacote, e o contrato de memorizacao do `dex-memoria`. Ele
define como lembrar, quando lembrar, quanto lembrar, por que lembrar, por quanto
tempo lembrar, quando nao lembrar, qual fonte viva vence e se existe ponteiro
global minimo a registrar.

O pacote/skill experimental antigo com esse nome foi arquivado e nao e rota
viva. O termo continua valido quando apontar para este contrato dentro do
`dex-memoria`.

## 2. Escopo

Dentro do escopo:

- classificar capturas;
- definir fonte de verdade;
- organizar recuperacao em camadas `L1 lembranca`, `L2 memoria` e
  `L3 conhecimento`;
- criar contratos de memoria;
- resolver, arquivar ou superseder memoria;
- separar memoria viva, ledger historico e arquivo;
- orientar integracao com Dex Agent.

Fora do escopo da V1:

- runtime do bot;
- comandos `/inbox` e `/memory`;
- escrita automatica em ledger;
- scripts `add`, `resolve`, `archive`, `status` ou `audit`;
- alteracao automatica de skills globais;
- push para repos remotos.

## 3. Conceitos

### L1 - Lembranca

Camada curta de gatilhos. Deve ser sempre carregavel, ou carregavel pelo dominio
ativo, sem virar tutorial ou historico longo.

Cada lembranca deve apontar para uma ancora de `L2 memoria` ou para uma fonte
viva equivalente. A regra pratica e: se L1 nao dispara L2 na hora certa, a
memoria detalhada vira entulho.

### L2 - Memoria

Camada de conhecimento operacional detalhado, organizada por ancoras estaveis.
Ela explica mecanismo, verificacao, prevencao, fonte viva, conflito e criterio
de saida quando o item for memoria operacional viva.

L2 e carregavel por dominio ativo. Ela nao precisa ser globalmente injetada em
todo contexto quando isso aumentar custo sem melhorar recuperacao.

### L3 - Conhecimento

Camada sob demanda para documentacao, tutoriais, modelos e exemplos longos.
Deve ter `INDEX.md` e ser acessada a partir de L2 quando o detalhe ultrapassar o
uso recorrente.

### Escopos De Caminho

A arquitetura L1/L2/L3 pode existir em tres escopos. A regra e evitar que o
global vire deposito e que conhecimento de projeto seja promovido sem
necessidade.

- `global`: apenas roteador de gatilhos universais e ponteiros curtos;
- `projeto`: estado vivo, decisoes e recuperacao operacional do repo atual;
- `area` ou `tema`: conhecimento reutilizavel por dominio, como linguagem,
  plataforma, ferramenta ou familia de projetos.

### Raiz Canonica

`DEX_MEMORIA_HOME` e a raiz canonica para memorias cross-project, ou seja,
memorias `global` e `tema`.

Resolucao:

1. se `$env:DEX_MEMORIA_HOME` estiver definido, use esse caminho;
2. se nao estiver definido, use `$HOME/.agents/memories`;
3. nao derive memoria cross-project de `DEX_AGENT_HOME` automaticamente;
4. nao use `%CODEX_HOME%/memories` ou `$HOME/.codex/memories` como destino
   padrao, porque esse espaco pertence ao host Codex.

Mapeamento fisico:

- `global`: `<DEX_MEMORIA_HOME>/global/lembranca.md`,
  `<DEX_MEMORIA_HOME>/global/memoria.md` e
  `<DEX_MEMORIA_HOME>/global/conhecimento/`;
- `tema`: `<DEX_MEMORIA_HOME>/temas/<tema>/lembranca.md`,
  `<DEX_MEMORIA_HOME>/temas/<tema>/memoria.md` e
  `<DEX_MEMORIA_HOME>/temas/<tema>/conhecimento/`;
- `projeto`: `<WORKSPACE>/.agents/lembranca.md`,
  `<WORKSPACE>/.agents/memoria.md` e
  `<WORKSPACE>/.agents/conhecimento/`.

Bloqueios:

- se `escopo=global`, o destino nao pode estar dentro do workspace;
- se `escopo=tema`, o destino nao pode estar dentro do workspace;
- se `escopo=projeto`, o destino canonico e `<WORKSPACE>/.agents`;
- `templates/`, `examples/`, logs, screenshots e pastas de secrets nunca sao
  destino de memoria viva.

### Taxonomia De Temas

Tema e dominio reutilizavel. Ele nao deve representar projeto especifico,
conversa, sprint, bug isolado, apelido de repo ou combinacao acidental
projeto-ferramenta.

Regra pratica:

- prefira tema raiz quando o dominio ja for claro: `deepseek`, `delphi`,
  `php`, `codex`;
- use `temas/<area>/<tema>` somente quando a area for uma familia real e
  repetida, nao por vontade de organizar demais;
- se o conteudo mistura projeto e ferramenta, separe: estado do projeto em
  `<WORKSPACE>/.agents`, aprendizado da ferramenta em
  `<DEX_MEMORIA_HOME>/temas/<ferramenta>` e aprendizado de linguagem em
  `<DEX_MEMORIA_HOME>/temas/<linguagem>`;
- nomes compostos como `pythia-deepseek` devem ser revisados antes de gravar;
- na duvida, prefira o nome mais simples que sobreviva fora do projeto atual.

Regra dura:

- nada entra em L2 sem gatilho L1 ou fonte viva equivalente;
- nada entra em L3 sem ancora L2;
- nada entra no global se so serve para um projeto.

### Memoria Viva

Memoria que orienta o trabalho atual ou uma retomada operacional.

Ela deve apontar para fonte viva, criterio de resolucao e condicao de parada.

### Ledger

Historico duravel. Pode ser consultado, mas nao deve competir com `HANDOFF.md` ou `ACTIVE.md` por proximo passo.

### Arquivo

Memoria resolvida, arquivada, supersedida ou descartada. Arquivo preserva historico, mas nao reabre trabalho sozinho.

## 4. Estados Oficiais

- `ativa`
- `resolvida`
- `arquivada`
- `superseded`
- `descartada`
- `estacionada`

## 5. Campos Obrigatorios

Toda memoria operacional forte deve ter:

- `id`
- `titulo`
- `tipo`
- `estado`
- `escopo`
- `projeto`
- `origem`
- `evidencia`
- `o_que_lembrar`
- `por_que_lembrar`
- `quando_lembrar`
- `quanto_lembrar`
- `por_quanto_tempo_lembrar`
- `quando_nao_lembrar`
- `ponteiro_global_recomendado`
- `fonte_viva`
- `quem_vence_em_conflito`
- `criterio_de_resolucao`
- `proximo_dono`

## 6. Fluxo De Criacao

1. Classificar a captura.
2. Decidir se e memoria viva, ledger, arquivo, estacionamento, skill-candidate ou descarte.
3. Preencher `templates/memory-contract.md`.
4. Se a captura exigir recuperacao recorrente, decidir se tambem precisa de
   `L1 lembranca`, `L2 memoria` e/ou `L3 conhecimento`.
5. Atualizar superficies vivas somente se a memoria realmente orientar retomada.
6. Registrar evidencia minima.
7. Declarar quando nao lembrar.
8. Se houver valor cross-project, criar apenas ponteiro global curto; o conteudo
   grande fica na fonte viva local.

## 7. Fluxo De Resolucao

1. Provar que a correcao, decisao ou fechamento aconteceu.
2. Remover ponteiros vivos.
3. Marcar historico sem virar fila viva.
4. Avisar o dono afetado quando houver.
5. Testar regressao de retomada.
6. Fechar somente quando `templates/memory-resolution-checklist.md` passar.

## 8. Criterio De Pronto Da V1

A V1 esta pronta quando:

- `SKILL.md` direciona para este contrato;
- templates permitem criar e resolver memoria sem campos ocultos;
- templates de L1/L2/L3 permitem criar recuperacao em camadas sem copiar
  runtime;
- exemplos mostram memoria ativa, resolvida, ledger-only e handoff;
- a fronteira com Dex Agent esta documentada;
- a V1 nao promete scripts inexistentes.

## 9. Criterio De Regressao

Ha regressao se:

- ledger vencer `HANDOFF.md` em conflito operacional;
- memoria resolvida orientar proximo passo;
- L1 virar tutorial longo em vez de gatilho;
- L2 apontar para ancoras inexistentes;
- L3 ser tratada como contexto sempre carregado por padrao;
- a skill sugerir scripts V1 inexistentes;
- exemplos contiverem estado real sensivel;
- o pacote for confundido com o runtime do Dex Agent.

## 10. Proximo Passo

Integrar referencias a partir do `dex-agent` e das skills globais somente depois de revisar a fronteira de responsabilidade com este pacote.
