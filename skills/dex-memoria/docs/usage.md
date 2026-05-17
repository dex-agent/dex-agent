# Usage

Este guia explica como instalar, usar e ativar `dex-memoria` como pacote documental.

`dex-memoria` nao e runtime. Ele nao grava memoria sozinho, nao executa hooks, nao cria inbox, nao escreve ledger por conta propria e nao instala comandos automaticamente.

Essa fronteira nao significa "memorias sao somente leitura" e nunca pode virar
veto contra escrita global. Memoria global e indice gravavel: quando houver valor
de lembranca/indexacao, grave um ponteiro curto, intuitivo e apontado para a
fonte completa pelo mecanismo de escrita disponivel.

Se o ambiente atual tiver uma camada autorizada para escrita de memoria, use este
contrato para classificar a captura e executar ou encaminhar o ponteiro para essa
camada. Se o ambiente bloquear uma pasta por permissao, diga que o bloqueio e do
ambiente/ferramenta ativa, nao veto de `dex-memoria`, e entregue um candidato de
memoria ou instrucao operacional para a camada correta.

Quando este guia falar em `memorizador`, leia como o contrato de memorizacao
dentro do `dex-memoria`: decidir como lembrar, quando lembrar, quanto lembrar,
por que lembrar, por quanto tempo lembrar, quando nao lembrar e se cabe ponteiro
global curto. Nao e a skill/pacote antigo arquivado.

## Instalacao

### Usar Via npm/npx

Use este modo quando quiser instalar ou atualizar a copia local sem depender de
`git remote`, branch ou pasta clonada:

```bash
npx github:dex-agent/dex-memoria doctor
npx github:dex-agent/dex-memoria memory-home
npx github:dex-agent/dex-memoria install
```

Depois de publicar no npm registry, o mesmo fluxo fica:

```bash
npx dex-memoria@latest doctor
npx dex-memoria@latest memory-home
npx dex-memoria@latest install
```

Por padrao, o comando instala em:

```text
~/.dex-agent/skills/dex-memoria
```

No Windows PowerShell:

```powershell
npx github:dex-agent/dex-memoria install --target "$env:USERPROFILE\.dex-agent\skills\dex-memoria" --force
```

Para ver antes de copiar:

```bash
npx github:dex-agent/dex-memoria install --dry-run
```

O CLI incluido nesta V1 e apenas distribuidor documental. Ele nao cria runtime,
hooks, inbox, ledger, tokens ou automacao do Dex Agent.

### Clonar O Repo

```bash
git clone https://github.com/dex-agent/dex-memoria.git
cd dex-memoria
```

Use este modo quando quiser consultar o contrato, copiar templates ou apontar outro projeto para esta documentacao.

### Usar Como Pacote Documental

Leia nesta ordem:

1. `README.md`
2. `SPEC.md`
3. `docs/runtime-boundary.md`
4. `templates/memory-contract.md`
5. `templates/memory-resolution-checklist.md`

Use `examples/` como referencia de formato, nao como estado real.

### Usar L1/L2/L3

Use este modo quando o problema principal for recuperacao de conhecimento, nao
apenas registro de uma memoria viva.

Estrutura recomendada:

```text
lembranca.md
memoria.md
conhecimento/
  INDEX.md
  documentacao/
    INDEX.md
  modelos/
    INDEX.md
  tutoriais/
    INDEX.md
```

Camadas:

- `L1 lembranca`: gatilhos curtos. Deve apontar para L2 e evitar conteudo
  longo.
- `L2 memoria`: detalhe operacional com ancoras. Deve explicar mecanismo,
  verificacao, prevencao e links para L3 quando necessario.
- `L3 conhecimento`: documentacao, tutoriais, modelos e exemplos sob demanda.

Fluxo:

```text
gatilho -> ancora -> detalhe
captura -> classificacao -> L1 gatilho -> L2 ancora -> L3 sob demanda
```

Regra pratica:

- L1 e sempre carregavel ou carregavel pelo dominio ativo.
- L2 e carregavel por dominio ativo.
- L3 nao deve ser carregada automaticamente por padrao.
- Nada entra em L2 sem gatilho L1 ou fonte viva equivalente.
- Nada entra em L3 sem ancora L2.

### Escolher O Caminho Correto

Escolha o caminho pelo escopo, nao pela vontade de lembrar mais.

Resolva primeiro a raiz cross-project:

```text
DEX_MEMORIA_HOME = $env:DEX_MEMORIA_HOME, se definido
fallback = $HOME/.agents/memories
```

`DEX_AGENT_HOME` localiza o runtime/skill do Dex Agent; ele nao e raiz de dados
de memoria por padrao. `$HOME/.codex/memories` pertence ao host Codex e tambem
nao e destino padrao do `dex-memoria`, salvo se o usuario configurar
`DEX_MEMORIA_HOME` explicitamente para esse caminho.

```text
<DEX_MEMORIA_HOME>/global/
  lembranca.md
  memoria.md
  conhecimento/

<DEX_MEMORIA_HOME>/temas/<tema>/
  lembranca.md
  memoria.md
  conhecimento/

<WORKSPACE>/.agents/
  lembranca.md
  memoria.md
  conhecimento/
```

Regras:

- `global`: use apenas como roteador minimo para gatilhos universais,
  ponteiros cross-project e criterios que mudam comportamento em qualquer
  contexto.
- `temas/<tema>`: use para dominio reutilizavel, como linguagem, plataforma,
  ferramenta ou familia tecnica.
- `<repo>/.agents`: use para estado vivo, decisoes, handoff e recuperacao
  operacional de um projeto especifico.

Taxonomia de temas:

- tema e dominio reutilizavel, nao apelido de projeto nem combinacao
  projeto-ferramenta;
- prefira temas raiz quando o dominio ja for claro, como `deepseek`,
  `delphi`, `php` ou `codex`;
- use `temas/<area>/<tema>` somente quando a area for uma familia real e
  repetida;
- na duvida, prefira `temas/delphi` antes de
  `temas/programacao/delphi`, e `temas/deepseek` antes de
  `temas/pythia-deepseek`;
- se o conteudo mistura projeto e ferramenta, divida: estado do projeto em
  `<WORKSPACE>/.agents`, aprendizado da ferramenta em
  `<DEX_MEMORIA_HOME>/temas/<ferramenta>`.

Bloqueios antes de gravar:

- se `escopo=global`, o destino deve estar em `<DEX_MEMORIA_HOME>/global`;
- se `escopo=tema`, o destino deve estar em
  `<DEX_MEMORIA_HOME>/temas/<tema>`;
- se `escopo=projeto`, o destino canonico e `<WORKSPACE>/.agents`;
- nunca crie `<WORKSPACE>/global` para memoria global;
- nunca crie `<WORKSPACE>/temas` para memoria de tema;
- nunca escreva memoria viva em `templates/`, `examples/`, logs,
  screenshots ou pastas de secrets.

Criterios de promocao:

- projeto -> tema: quando o aprendizado se repetir ou ficar claramente
  reutilizavel fora do repo;
- tema -> global: somente quando valer para varios temas;
- global -> projeto: nao copie o conteudo grande; aponte para a fonte viva.

Se uma memoria nao tem gatilho L1 claro, nao promova para L2. Se um documento
L3 nao tem ancora L2 que o acione, ele e arquivo ou documentacao solta, nao
recuperacao em camadas.

Exemplo de configuracao abstrata de um ambiente consumidor:

```toml
instructions = [
  "memory.md",
  "dominio/lembranca.md",
  "dominio/memoria.md"
]
```

Nao inclua `api_key`, tokens, secrets, logs, screenshots ou estado real em
exemplos de configuracao. Este pacote apenas documenta o contrato; o carregador
de `instructions` pertence ao ambiente consumidor.

Templates uteis:

- `templates/l1-lembranca.md`
- `templates/l2-memoria.md`
- `templates/l3-conhecimento-index.md`
- `templates/layered-memory-checklist.md`

Exemplo completo:

- `examples/layered-memory/`

Validacao por simulacao:

- `docs/layered-memory-simulations.md`

### Copiar Ou Adaptar Como Skill Local

Quando um projeto precisar usar `dex-memoria` como skill local, copie ou referencie estes itens:

- `SKILL.md`
- `SPEC.md`
- `docs/`
- `templates/`
- `examples/`

Depois ajuste somente caminhos de referencia do projeto destino. Nao copie `.agents/` reais, inbox, ledger, logs, screenshots, secrets, caches ou runtime `src/`.

## Como Ativar

Use `dex-memoria` quando uma captura, achado, decisao ou residuo precisar ser classificado antes de virar memoria viva, ledger, arquivo, estacionamento, skill-candidate ou descarte.

Ativar significa pedir que o agente aplique este contrato documental. A V1 nao liga hook, nao registra automaticamente e nao cria comandos como `add`, `resolve`, `archive`, `status` ou `audit`.

Ativar tambem nao deve fazer o agente responder com uma proibicao generica como "Never update memories. You can only read them." Essa frase so pode vir de uma instrucao externa do ambiente; ela nao e regra de `dex-memoria`.

## Prompts Prontos

### Ativacao Geral

```text
Use dex-memoria nesta conversa.

Antes de salvar, lembrar, arquivar ou encaminhar qualquer captura operacional, aplique o contrato de ciclo de vida:
- classifique a captura;
- diga a fonte de verdade;
- diga quando lembrar;
- diga quanto lembrar;
- diga por que lembrar;
- diga por quanto tempo lembrar;
- diga quando nao lembrar;
- diga quem vence em conflito;
- diga o criterio de resolucao;
- diga se existe ponteiro global recomendado;
- diga o proximo destino.

Nao trate MEMORY.ndjson como fila viva.
Nao deixe memoria resolvida orientar o proximo passo.
Nao prometa scripts, hooks ou automacao que nao existem nesta V1.
```

### Classificar Uma Captura

```text
Use dex-memoria para classificar esta captura antes de salvar, lembrar ou encaminhar.

Captura:
<cole aqui>

Responda com:
- veredito: memoria viva | ledger-only | estacionamento | skill-candidate | descarte;
- tipo;
- estado;
- fonte de verdade;
- quando lembrar;
- quando nao lembrar;
- quem vence em conflito;
- criterio de resolucao;
- proximo destino: local | pai | rede | nenhum.
```

### Criar Uma Memoria Operacional

```text
Use dex-memoria para transformar esta captura em memoria operacional somente se ela realmente precisar orientar retomadas futuras.

Captura:
<cole aqui>

Use o formato de templates/memory-contract.md e preencha:
- id;
- titulo;
- tipo;
- estado;
- escopo;
- projeto;
- origem;
- evidencia;
- o_que_lembrar;
- por_que_lembrar;
- quando_lembrar;
- quanto_lembrar;
- por_quanto_tempo_lembrar;
- quando_nao_lembrar;
- fonte_viva;
- quem_vence_em_conflito;
- criterio_de_resolucao;
- ponteiro_global_recomendado;
- proximo_dono.

Se nao for memoria viva, explique por que deve virar ledger-only, estacionamento, skill-candidate ou descarte.
```

### Veredito De Memorizacao

Use este formato quando Vera Veredito fechar um bloco, sprint, teste, replay,
contrato ou decisao e precisar decidir se algo deve orientar pedidos futuros:

```text
Memorizacao recomendada: sim | nao
Camada sugerida: memoria viva | ledger-only | estacionamento | skill-candidate
Ponteiro global recomendado: sim | nao
Modelo seguido:
Campos obrigatorios preenchidos:
Por que lembrar:
Quanto lembrar:
Quando lembrar:
Quando nao lembrar:
Fonte viva:
Quem vence em conflito:
Criterio de saida:
Deve usar dex-memoria: sim
Prompt formatado para dex-memoria:
```

Se `Ponteiro global recomendado: sim`, adicionar:

```text
Lembranca global curta:
- Gatilho:
- Abrir fonte viva:
- O que procurar la:
- Quem vence em conflito:
- Quando nao usar:
- Criterio para remover ou revisar o ponteiro:
```

Regra canonica: memoria global e indice curto gravavel, nao copia de contrato
grande, evidencia extensa, historico, tutorial ou narrativa. Quando houver valor
de lembranca/indexacao, grave ponteiro global conciso para a fonte viva. A fonte
viva fica no repo, skill, `HANDOFF`, `ACTIVE`, artefato ou ledger local.

### Resolver Ou Arquivar Uma Memoria

```text
Use dex-memoria para decidir se esta memoria ativa ja pode ser resolvida, arquivada ou supersedida.

Memoria:
<cole aqui>

Evidencia de fechamento:
<cole aqui>

Aplique templates/memory-resolution-checklist.md e responda:
- veredito: fechado | ainda vivo | supersedido | precisa revisao humana;
- prova encontrada;
- ponteiros vivos que devem sair;
- historico que deve permanecer;
- risco de regressao de retomada;
- proximo passo seguro.

Nao deixe uma memoria resolvida continuar como proximo passo.
```

### Decidir O Destino Correto

```text
Use dex-memoria para decidir o destino desta captura.

Captura:
<cole aqui>

Escolha exatamente um destino principal:
- memoria viva;
- ledger-only;
- estacionamento;
- skill-candidate;
- descarte.

Explique:
- por que este destino vence;
- o que nao deve ser lembrado;
- qual arquivo ou camada deve receber o registro;
- qual camada nao deve receber o registro;
- qual condicao futura mudaria o veredito.
```

### Usar Em Projeto Filho

```text
Use dex-memoria em modo projeto filho.

Contexto do projeto filho:
<nome e objetivo>

Captura:
<cole aqui>

Regras:
- HANDOFF.md manda no proximo passo seguro;
- ACTIVE.md manda no objetivo vivo e loops abertos;
- MEMORY.ndjson e ledger, nao fila viva;
- memoria resolvida nao orienta proximo passo;
- bug do Dex Agent pai usa rota pai;
- handoff entre filhos usa rota rede;
- nao misture este contrato com runtime do Dex Agent.

Responda com:
- veredito;
- fonte de verdade;
- destino local | pai | rede | nenhum;
- texto minimo a registrar;
- quando parar de lembrar.
```

## Exemplos De Uso Em Projeto Filho

Use `templates/child-usage-prompt.md` quando o projeto filho so precisa classificar uma captura.

Use `templates/memory-contract.md` quando a captura realmente precisa virar memoria operacional forte.

Use `templates/memory-resolution-checklist.md` quando uma memoria ativa foi corrigida, cumprida, substituida ou arquivada.

Use `templates/l1-lembranca.md`, `templates/l2-memoria.md`,
`templates/l3-conhecimento-index.md` e `templates/layered-memory-checklist.md`
quando a captura precisar virar recuperacao em camadas.

Use `examples/active-operational-memory.md`, `examples/ledger-only-memory.md`, `examples/resolved-operational-finding.md` e `examples/child-to-child-handoff.md` como exemplos sanitizados.

Use `examples/layered-memory/` como exemplo sanitizado de gatilho, ancora e
conhecimento sob demanda.

## O Que Depende Do Dex Agent

Continua no Dex Agent:

- comandos `/inbox` e `/memory`;
- captura de candidates;
- proposal-first writes;
- ledger `.agents/MEMORY.ndjson`;
- inbox `.agents/INBOX/`;
- recall automatico;
- manutencao de superficies vivas;
- integracao Telegram;
- codigo de runtime.

## O Que Nao Acontece Automaticamente

Este pacote nao:

- instala skill global;
- altera `dex-agent`;
- cria comandos;
- executa scripts;
- grava ledger;
- move arquivos;
- publica releases;
- apaga memoria antiga;
- valida projetos filhos sozinho.

## Limites Da V1

A V1 e contrato, template, exemplo e guia de uso. Scripts, hooks e integracoes automaticas so entram depois de uso real repetido, com baixa ambiguidade e revisao humana.
