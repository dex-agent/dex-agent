# Contrato De Instalacao Dex Agent

## Identidade

- Projeto:
- ProjectRoot:
- ProjectLabel:
- InstanceId:
- BotUsername:
- AllowedUserIds:
- ProactiveUserIds:
- Aliases:
- Regra multiusuario: `ALLOWED_USER_IDS` libera conversa; `PROACTIVE_USER_IDS` e admin/proativo.
- Regra de contato: `.agents/CONTACTS.local.json` ajusta apenas tom por pessoa/chat_id e fica fora do Git.

## Pre-Flight

- [ ] ProjectRoot existe.
- [ ] Token validado por `getMe`.
- [ ] Projeto ainda nao tem instalacao ou reinstalacao foi explicitamente aprovada.
- [ ] Produto local nao sera alterado.

## Instalacao

- [ ] Rodar `provision-dex-agent-project-instance.ps1`.
- [ ] Criar `.env` local ignorado.
- [ ] Criar `instance.json`.
- [ ] Criar cards `DEX_PAI.md` e `DEX_REDE.md`.
- [ ] Atualizar `AGENTS.md` e `INDEX.md`.
- [ ] Confirmar `dex-acesso`, `dex-print` e `dex-audio` no bootstrap.
- [ ] Confirmar `dex-contatos` no bootstrap e `.agents/CONTACTS.local.json` no `.gitignore`.
- [ ] Confirmar `FINAL_ACTIONS_AUTO_OFFER=false` no `.env` e no bootstrap visivel.
- [ ] Registrar aliases no registry local.
- [ ] Adicionar `skills/dex-agent/` ao `.gitignore` do filho.

## Validacao

- [ ] Status local.
- [ ] Telegram real.
- [ ] Se houver mais de um usuario, testar midia por chat sem cruzar destinatario.
- [ ] Evidencia salva.
- [ ] Token ausente de docs/diff/resposta.
- [ ] Instalacao filha ignorada pelo Git do produto.

## Veredito

- Status:
- Evidencia:
- Proximo passo:
