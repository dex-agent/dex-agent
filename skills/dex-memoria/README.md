# Dex Memoria

Versao atual: `0.1.1`

`dex-memoria` e um pacote documental para orientar o ciclo de vida de memoria operacional em projetos Dex Agent.

Ele nasceu a partir da skill `skills/dex-memoria` do repo `dex-agent`, mas este pacote nao carrega o runtime do bot, nao executa hooks e nao grava memoria sozinho. Esse limite nao transforma memorias em somente leitura; ele apenas separa contrato documental de mecanismo autorizado de escrita.

Dentro deste pacote, `memorizador` e o contrato de memorizacao: o formato que
define como, quando, quanto, por que, por quanto tempo e quando nao lembrar.
Memoria global nao e somente leitura. Quando uma lembranca tiver valor
cross-project, o mecanismo de escrita disponivel deve gravar um ponteiro curto,
intuitivo e indexavel em `MEMORY.md`, apontando para a fonte viva completa. O
registro global nao deve virar tutorial, copia de contrato, historico grande ou
dump de contexto.

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
- `docs/integration-dex-agent.md`: como integrar este pacote ao Dex Agent.
- `templates/`: modelos copiaveis para contrato, resolucao e uso por projeto filho.
- `examples/`: exemplos sanitizados.

## Instalacao E Uso

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

Este repo publica a versao documental `0.1.1`. O proximo passo seguro e integrar referencias a partir do `dex-agent` sem mover runtime, copiar estado real ou prometer comandos V2 inexistentes.
