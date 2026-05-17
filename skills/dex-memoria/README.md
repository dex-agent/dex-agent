# Dex Memoria

Versao atual: `0.1.5`

`dex-memoria` e um pacote documental para orientar o ciclo de vida de memoria operacional em projetos Dex Agent.

Ele nasceu a partir da skill `skills/dex-memoria` do repo `dex-agent`, mas este pacote nao carrega o runtime do bot, nao executa hooks e nao grava memoria sozinho. Esse limite nao transforma memorias em somente leitura; ele apenas separa contrato documental de mecanismo autorizado de escrita.

Dentro deste pacote, `memorizador` e o contrato de memorizacao: o formato que
define como, quando, quanto, por que, por quanto tempo e quando nao lembrar.
Memoria global nao e somente leitura. Quando uma lembranca tiver valor
cross-project, o mecanismo de escrita disponivel deve gravar um ponteiro curto,
intuitivo e indexavel em `MEMORY.md`, apontando para a fonte viva completa. O
registro global nao deve virar tutorial, copia de contrato, historico grande ou
dump de contexto.

O pacote tambem canoniza a arquitetura de recuperacao em tres camadas:

```text
L1 lembranca -> L2 memoria -> L3 conhecimento
```

- `L1 lembranca`: gatilhos curtos, sempre carregaveis ou carregaveis pelo
  dominio ativo, apontando para L2.
- `L2 memoria`: conhecimento operacional detalhado, com ancoras estaveis.
- `L3 conhecimento`: documentacao, tutoriais, modelos e exemplos sob demanda.

Essa arquitetura nao cria runtime. Ela documenta como um ambiente consumidor
pode recuperar conhecimento sem transformar memoria global em dump.

Escopo recomendado:

- `global`: L1 minimo como roteador de gatilhos universais;
- `projeto`: memoria viva e retomada operacional do repo atual;
- `area` ou `tema`: conhecimento reutilizavel por dominio.

Raiz canonica para memoria cross-project:

```text
DEX_MEMORIA_HOME = $env:DEX_MEMORIA_HOME, se definido
fallback = $HOME/.agents/memories
```

Assim:

- `global` grava em `<DEX_MEMORIA_HOME>/global`;
- `tema` grava em `<DEX_MEMORIA_HOME>/temas/<tema>`;
- `projeto` grava no proprio repo, em `<WORKSPACE>/.agents`.

Nunca crie `global/` ou `temas/` dentro do workspace para memoria global ou de
tema. `%CODEX_HOME%/.codex/memories` e memoria do host Codex; nao e raiz
padrao do `dex-memoria`, salvo configuracao explicita em `DEX_MEMORIA_HOME`.

Taxonomia de temas:

- tema e dominio reutilizavel, nao apelido de projeto nem combinacao
  projeto-ferramenta;
- prefira dominios raiz como `deepseek`, `delphi`, `php` ou `codex`;
- use `temas/<area>/<tema>` somente quando a area ja for uma familia real e
  repetida;
- se o conteudo mistura projeto e ferramenta, separe: estado do projeto em
  `<WORKSPACE>/.agents`, aprendizado da ferramenta em
  `<DEX_MEMORIA_HOME>/temas/<ferramenta>`.

Regra pratica: nada entra em L2 sem gatilho L1, nada entra em L3 sem ancora L2,
e nada entra no global se so serve para um projeto.

## O Que E

- Um contrato pratico para decidir quando uma memoria deve entrar, ficar viva, virar ledger, ser arquivada, ser supersedida ou ser descartada.
- Um conjunto de templates e exemplos sanitizados para criar e resolver memoria operacional.
- Uma fronteira documentada entre o pacote `dex-memoria` e o runtime atual do Dex Agent.

## O Que Nao E

- Nao e o runtime de memoria do Dex Agent.
- Nao substitui `/inbox`, `/memory`, recall, ledger ou proposals do bot.
- Nao contem `.agents/` reais, inbox, ledger, screenshots, logs, tokens ou secrets.
- Nao promete scripts V2 como capacidade existente.
- Nao altera skills globais por conta propria.

## Estrutura

- `SKILL.md`: entrada operacional da skill.
- `SPEC.md`: contrato atual do ciclo de vida.
- `docs/usage.md`: instalacao, ativacao e prompts prontos.
- `docs/runtime-boundary.md`: o que ainda pertence ao Dex Agent.
- `docs/memory-home.md`: raiz canonica `DEX_MEMORIA_HOME` e bloqueios de
  caminho.
- `docs/integration-dex-agent.md`: como integrar este pacote ao Dex Agent.
- `templates/`: modelos copiaveis para contrato, resolucao e uso por projeto filho.
- `examples/`: exemplos sanitizados.
- `templates/l1-lembranca.md`, `templates/l2-memoria.md` e
  `templates/l3-conhecimento-index.md`: modelos de recuperacao em camadas.
- `examples/layered-memory/`: exemplo sanitizado de L1 acionando L2 e L3.
- `docs/layered-memory-simulations.md`: simulacoes sanitizadas para validar se
  a arquitetura recupera aprendizado de fato.

## Instalacao Rapida

Via npm/npx a partir do GitHub:

```bash
npx github:dex-agent/dex-memoria doctor
npx github:dex-agent/dex-memoria memory-home
npx github:dex-agent/dex-memoria install
```

No Windows, para atualizar a skill local padrao do Dex Agent:

```powershell
npx github:dex-agent/dex-memoria install --target "$env:USERPROFILE\.dex-agent\skills\dex-memoria" --force
```

Depois de publicar no npm registry, use `npx dex-memoria@latest ...`.

Em outra maquina, clone este repo:

```bash
git clone https://github.com/dex-agent/dex-memoria.git
cd dex-memoria
```

No Windows PowerShell:

```powershell
git clone https://github.com/dex-agent/dex-memoria.git
Set-Location dex-memoria
```

O pacote npm e um distribuidor dos arquivos documentais. Ele nao instala runtime
do bot, nao executa hooks, nao grava ledger e nao cria automacao do Dex Agent.
Instalar significa deixar o contrato disponivel para consulta, referencia ou
copia controlada em outro projeto.

## Usar Em Outro Projeto

Use uma destas formas:

1. Referenciar este repo como documentacao externa do projeto.
2. Copiar ou adaptar como skill local do projeto quando o agente precisar aplicar
   o contrato diretamente.

Para usar como skill local, copie ou referencie apenas:

- `SKILL.md`
- `SPEC.md`
- `docs/`
- `templates/`
- `examples/`

Depois ajuste somente os caminhos de referencia do projeto destino. Nao copie
`.agents/` reais, inbox, ledger, logs, screenshots, secrets, caches ou runtime
`src/`.

Para usar o modelo em camadas em outro projeto, crie ou adapte:

- `lembranca.md`: L1, gatilhos curtos;
- `memoria.md`: L2, ancoras e detalhe operacional;
- `conhecimento/INDEX.md`: L3, indice para docs, tutoriais e modelos.

Esses nomes sao canonicos recomendados. O carregamento automatico desses
arquivos pertence ao ambiente consumidor, nao a este pacote.

O caminho fisico deve ser escolhido pelo escopo do conhecimento:

- global: apenas ponteiros curtos e gatilhos cross-project;
- projeto: arquivos dentro do repo ou da superficie viva do projeto;
- area/tema: arquivos de dominio reutilizavel, separados do estado do projeto.

Prompt minimo para ativar em outro projeto:

```text
Use dex-memoria neste projeto.

Antes de salvar, lembrar, arquivar ou encaminhar qualquer captura operacional,
aplique o contrato de ciclo de vida de memoria de:
<caminho-ou-url-do-dex-memoria>

Nao trate este pacote como runtime.
Nao prometa hooks, comandos ou automacao que nao existem nesta V1.
Quando houver memoria reutilizavel, grave apenas ponteiro curto para a fonte viva.
```

Prompt pronto para pedir instalacao por IA:

```text
Instale dex-memoria neste projeto.

Contexto:
- dex-memoria e um pacote documental/skill de contrato de memoria.
- Ele nao e runtime, nao executa hooks, nao grava memoria sozinho e nao cria comandos automaticamente.
- Repo oficial: https://github.com/dex-agent/dex-memoria

Tarefa:
1. Verifique se ja existe uma copia local de dex-memoria neste projeto.
2. Se nao existir, clone o repo oficial ou copie apenas os arquivos necessarios.
3. Se for usar como skill local, inclua somente:
   - SKILL.md
   - SPEC.md
   - docs/
   - templates/
   - examples/
4. Ajuste apenas caminhos de referencia do projeto destino.
5. Nao copie .agents reais, inbox, ledger, logs, screenshots, secrets, caches, .env ou runtime src/.
6. Atualize a documentacao local do projeto para dizer onde dex-memoria foi instalado ou referenciado.
7. Ao final, mostre:
   - caminho instalado ou referenciado;
   - arquivos copiados ou linkados;
   - como ativar dex-memoria em uma proxima conversa;
   - limites que continuam fora do pacote.

Criterio de pronto:
- O projeto consegue apontar para dex-memoria como contrato de memoria.
- Nenhum segredo ou estado real foi copiado.
- A IA nao prometeu automacoes que a V1 nao entrega.
```

## Guia Completo

Leia [docs/usage.md](docs/usage.md) para:

- clonar o repo;
- usar `dex-memoria` como pacote documental;
- copiar ou adaptar como skill local quando fizer sentido;
- ativar a skill com prompts prontos;
- entender o que ainda depende do Dex Agent.

## Origem

Fonte de extracao:

- skill local `skills/dex-memoria` do repo `dex-agent`;
- documentacao tecnica `docs/memory-system/README.md` do repo `dex-agent`, usada como referencia, nao como copia integral.

## Estado Atual

Este repo publica a versao documental `0.1.5` com a arquitetura L1/L2/L3 de
recuperacao em camadas, a raiz canonica `DEX_MEMORIA_HOME` e a taxonomia de
temas reutilizaveis. O proximo passo seguro e integrar referencias a partir do
`dex-agent` sem mover runtime, copiar estado real ou prometer comandos V2
inexistentes.

## Camada Publica

Este repositorio tambem inclui a camada publica minima para contribuicao e
distribuicao segura:

- `LICENSE`: licenca MIT.
- `SECURITY.md`: politica para vulnerabilidades e exposicao acidental.
- `CONTRIBUTING.md`: regras de contribuicao e validacao local.
- `CODE_OF_CONDUCT.md`: expectativas de convivencia.
- `.github/`: templates de issue, template de PR e CI.

Validacao local:

```bash
npm run check
npm run doctor
npm run pack:check
```

O CI executa as mesmas validacoes principais para garantir que a versao `0.1.5`,
os metadados do pacote e a relacao documental com `dex-agent` continuem
alinhados sem incluir segredos ou runtime.
