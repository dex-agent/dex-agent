# Prompt De Instalacao Dex Filho

Use este prompt no repo pai `C:\CodexProjetos\dex-agent` para instalar uma instancia filha sem expor token.

```text
Use `skills/dex-install/SKILL.md`.

Objetivo: instalar uma nova instancia filha do Dex Agent, sem alterar o produto do projeto filho.

Ambiente:
- Repo pai: C:\CodexProjetos\dex-agent
- ProjectRoot: <C:\CodexProjetos\NomeDoProjeto>
- ProjectLabel: <NomeDoProjeto>
- InstanceId: <nome-do-projeto>
- BotUsername: <usuario_do_bot_sem_arroba>
- AllowedUserIds: <id_dono,ids_autorizados>
- ProactiveUserIds: <id_dono>
- Aliases: <alias-principal,alias-secundario,dex-alias,usuario_do_bot>
- Start: sim
- RunTelegramTest: sim, se houver Telegram Web/sessao disponivel

Regras:
- Nao pedir nem registrar BOT_TOKEN em texto, docs, resposta final, artefato, commit ou prompt.
- Usar o prompt seguro do script para o token, ou `-BotTokenPath` temporario se eu autorizar explicitamente.
- Validar `getMe` contra `BotUsername` antes de escrever `.env`.
- Garantir `skills/dex-agent/` no `.gitignore` do filho.
- Garantir `FINAL_ACTIONS_AUTO_OFFER=false` no `.env` do filho.
- Garantir bootstrap local: AGENTS.md, INDEX.md, .agents/DEX_PAI.md e .agents/DEX_REDE.md.
- Registrar aliases em `config/dex-agent-network.local.json`, nunca no exemplo versionado.
- Processos no Windows devem iniciar escondidos.
- Nao registrar autostart por padrao.

Comando base:

powershell -ExecutionPolicy Bypass -File C:\CodexProjetos\dex-agent\scripts\provision-dex-agent-project-instance.ps1 `
  -ProjectRoot "<C:\CodexProjetos\NomeDoProjeto>" `
  -InstanceId "<nome-do-projeto>" `
  -ProjectLabel "<NomeDoProjeto>" `
  -BotUsername "<usuario_do_bot_sem_arroba>" `
  -AllowedUserIds "<id_dono,ids_autorizados>" `
  -ProactiveUserIds "<id_dono>" `
  -Aliases "<alias-principal,alias-secundario,dex-alias,usuario_do_bot>" `
  -Start `
  -RunTelegramTest

Validacao obrigatoria antes do veredito:
- status local do filho passou;
- Telegram real passou ou ficou bloqueio explicado;
- `skills/dex-agent/` esta ignorado pelo Git do filho;
- resposta final nao contem token;
- resposta final informa InstallRoot, BotUsername, aliases e evidencia.
```
