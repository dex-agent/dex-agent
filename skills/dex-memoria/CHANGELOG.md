# Changelog

## 0.1.5 - 2026-05-17

- Documenta a taxonomia canonica de temas reutilizaveis.
- Reforca que tema nao deve ser apelido de projeto nem combinacao
  projeto-ferramenta.
- Atualiza validacao publica para cobrir a regra de tema como dominio
  reutilizavel.

## 0.1.4 - 2026-05-16

- Define `DEX_MEMORIA_HOME` como raiz canonica de memoria cross-project.
- Define o padrao `$HOME/.agents/memories` para memoria global e por tema.
- Reforca que memoria global/tema nunca deve ser criada dentro do workspace.
- Adiciona `dex-memoria memory-home` e diagnostico no `doctor`.

## 0.1.3 - 2026-05-15

- Documenta a arquitetura `L1 lembranca -> L2 memoria -> L3 conhecimento`.
- Adiciona templates e exemplo sanitizado para recuperacao em camadas.
- Adiciona simulacoes sanitizadas para validar aprendizado real e detectar
  gatilhos sem ancora L2.
- Reforca que o carregamento automatico das camadas pertence ao ambiente
  consumidor; `dex-memoria` continua sem runtime proprio.

## 0.1.2 - 2026-05-09

- Adiciona empacotamento npm com `package.json`.
- Inclui CLI `dex-memoria` com comandos `doctor`, `install` e `version`.
- Mantem a fronteira da V1: o pacote distribui contrato documental, nao runtime do Dex Agent.

## 0.1.1 - 2026-05-02

- Adiciona guia de instalacao, uso e ativacao em `docs/usage.md`.
- Inclui prompts prontos para ativacao geral, classificacao, criacao, resolucao e uso por projeto filho.
- Atualiza o README para apontar o caminho de uso sem prometer runtime, hooks ou scripts V2.

## 0.1.0 - 2026-05-02

- Publicacao inicial do pacote documental `dex-memoria`.
- Define contrato de ciclo de vida para memoria operacional.
- Inclui templates, exemplos sanitizados e fronteira com o runtime do Dex Agent.
- Nao inclui runtime, hooks, inbox, ledger real, logs, screenshots ou secrets.
