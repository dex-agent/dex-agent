# Spec: Dex Install

## Objetivo

Padronizar a instalacao do Dex Agent em projetos filhos com o mesmo contrato operacional usado no Dex pai e nos filhos existentes.

## Entrada Minima

- `ProjectRoot`
- `ProjectLabel`
- `InstanceId`
- `BotUsername`
- `BotToken` ou prompt seguro para token
- `AllowedUserIds`
- `ProactiveUserIds`
- aliases do projeto

## Saida Esperada

- `<ProjectRoot>/skills/dex-agent/instance.json`
- `<ProjectRoot>/skills/dex-agent/.env`
- `<ProjectRoot>/skills/dex-agent/SKILL.md`
- `<ProjectRoot>/AGENTS.md`
- `<ProjectRoot>/INDEX.md`
- `<ProjectRoot>/.agents/DEX_PAI.md`
- `<ProjectRoot>/.agents/DEX_REDE.md`
- registro do destino em `config/dex-agent-network.local.json`
- entrada `skills/dex-agent/` no `.gitignore` do projeto filho
- evidencia de status e, quando possivel, Telegram real

## Regras

- `dex-install` instala novo filho.
- `dex-update` sincroniza filho existente.
- `dex-memoria` governa memoria operacional depois da instalacao.
- Todo pedido de memorizar no filho deve usar `dex-memoria` antes de virar arquivo vivo, ledger-only, estacionamento, resolucao ou arquivamento.
- `dex-acesso` governa IDs permitidos, destino proativo/admin e midia no chat solicitante.
- `dex-contatos` governa tom por pessoa/chat_id; dados reais ficam em `.agents/CONTACTS.local.json` fora do Git.
- `dex-pai` encaminha achado do motor/pai.
- `dex-rede` encaminha handoff entre filhos.
- `dex-print` e `dex-audio` devem estar disponiveis desde a primeira instalacao.
- `FINAL_ACTIONS_AUTO_OFFER=false` e o padrao da instalacao; botoes finais automaticos sao opt-in por contrato visivel no `.env`.
- `.env`, `.runtime`, tokens e logs nunca entram no Git.
- Processos iniciados por install/update/restart ou pedido Telegram devem usar janela escondida no Windows.

## Checklist De Aceite

- [ ] Bot validado com `getMe`.
- [ ] Instancia em modo `instance`.
- [ ] `/repo` bloqueado no filho.
- [ ] `dex-memoria`, `dex-acesso`, `dex-pai`, `dex-rede`, `dex-print` e `dex-audio` presentes na instalacao.
- [ ] `dex-contatos` presente na instalacao e `.agents/CONTACTS.local.json` ignorado pelo Git.
- [ ] `AGENTS.md` orienta a proxima sessao.
- [ ] `INDEX.md` aponta bootstrap Dex.
- [ ] Registry local resolve pelo alias principal.
- [ ] `skills/dex-agent/` esta ignorado pelo Git do filho.
- [ ] `.env` contem `FINAL_ACTIONS_AUTO_OFFER=false`, salvo decisao explicita e registrada de ativar.
- [ ] Status local passa.
- [ ] Telegram real passa ou fica bloqueio registrado.
- [ ] Nenhum helper deixa janela visivel de `cmd.exe` ou PowerShell como efeito normal.

## Exemplo

Exemplo neutro em `skills/dex-install/examples/instalacao-filho-exemplo.md`.

## Guia Operacional

- Guia canonico: `skills/dex-install/README.md`
- Prompt pronto: `skills/dex-install/templates/install-prompt.md`
