# Contrato De Atualizacao Dex Agent

## Identidade

- ProjectRoot:
- InstallRoot:
- InstanceId:
- ProjectLabel:
- BotUsername:
- Aliases:

## Pre-Flight

- [ ] `instance.json` existe.
- [ ] `.env` existe e sera preservado.
- [ ] `.runtime` sera preservado.
- [ ] Produto local fica fora do corte.

## Atualizacao

- [ ] Reaplicar arquivos gerenciados do pai.
- [ ] Sincronizar `dex-acesso`, `dex-print` e `dex-audio`.
- [ ] Sincronizar `dex-contatos` e preservar `.agents/CONTACTS.local.json`.
- [ ] Atualizar cards `DEX_PAI.md` e `DEX_REDE.md`.
- [ ] Atualizar bloco Dex em `AGENTS.md`.
- [ ] Atualizar `INDEX.md`.
- [ ] Garantir `FINAL_ACTIONS_AUTO_OFFER=false` ou registrar decisao explicita de ativar.
- [ ] Atualizar registry local se houver aliases.

## Validacao

- [ ] Status local.
- [ ] Restart se solicitado.
- [ ] Telegram real se solicitado.
- [ ] Em projeto multiusuario, validar que audio/print voltam para o chat solicitante.
- [ ] Evidencia salva.

## Veredito

- Status:
- Evidencia:
- Proximo passo:
