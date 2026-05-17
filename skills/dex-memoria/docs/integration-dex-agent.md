# Integracao Com Dex Agent

Este documento descreve o menor contrato atual para o Dex Agent consumir
`dex-memoria` depois do arquivamento das superficies legadas de memoria.

## Estado Atual

`dex-memoria` e o pacote documental ativo para o ciclo de vida de memoria
operacional em projetos Dex Agent.

O Dex Agent deve apontar para este repo quando precisar de:

- contrato de classificacao, criacao, resolucao, arquivamento e supersedencia de
  memoria operacional;
- templates e exemplos sanitizados;
- prompts de uso por projeto filho;
- fronteira entre contrato documental, memoria global como indice curto e
  runtime do bot.

Use a documentacao nesta ordem:

1. `README.md`
2. `docs/usage.md`
3. `docs/runtime-boundary.md`
4. `SPEC.md`
5. `templates/`

## Superficies Legadas Arquivadas

A spec `.harness/contracts/specs/archive-memory-systems.yaml` e as tasks
`archive-memory-systems-*` registram que os alvos legados foram arquivados e
desacoplados.

Devem permanecer inativos, salvo decisao nova e explicita. Os caminhos abaixo
sao placeholders historicos sanitizados, nao rotas locais recomendadas:

- `<legacy-workspace>\memory-bank`
- `<legacy-user-profile>\.agents\skills\memorizador`
- `<legacy-workspace>\memory_agent_codex_local`
- `<legacy-user-profile>\.codex\skills\roteador-memoria`

Referencias historicas a esses nomes podem permanecer como evidencia ou aviso de
nao reativacao, mas nao devem funcionar como instalacao ativa, rota viva,
dependencia operacional ou fonte de verdade atual.

Dentro deste repo, `memorizador` continua sendo apenas o nome do contrato de
memorizacao: decidir como, quando, quanto, por que, por quanto tempo e quando nao
lembrar. Nao reative a skill/pacote antigo com esse nome para satisfazer esse
contrato.

## Fica No Dex Agent

O runtime ainda pertence ao Dex Agent. Este repo nao executa hooks, nao cria
inbox, nao grava ledger, nao injeta recall e nao instala comandos.

Continua no Dex Agent:

- comandos `/inbox` e `/memory`;
- captura de candidates;
- proposal-first writes;
- ledger `.agents/MEMORY.ndjson`;
- inbox `.agents/INBOX/`;
- recall automatico;
- manutencao de superficies vivas;
- integracao Telegram;
- codigo de runtime em `src/`.

Quando a pergunta for "como classificar ou resolver uma memoria", use
`dex-memoria`. Quando a pergunta for "como o bot grava, recupera, mostra ou
injeta memoria", consulte o runtime do Dex Agent.

## Nao Fazer Automaticamente

- nao alterar skills globais como efeito colateral desta integracao;
- nao reativar `memory-bank`, a skill antiga `memorizador`,
  `memory_agent_codex_local` ou `roteador-memoria`;
- nao copiar `.agents/` reais, inbox, ledger, logs, screenshots, tokens ou
  secrets;
- nao copiar runtime inteiro de `src/`;
- nao prometer comandos V2, hooks ou automacoes que este repo nao entrega;
- nao publicar novas versoes, commitar ou aplicar mudancas no Dex Agent sem
  revisao humana.
