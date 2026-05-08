# Exemplo: ProjetoDeltaExemplo

## Entrada

- ProjectRoot: `C:\CodexProjetos\ProjetoDeltaExemplo`
- ProjectLabel: `ProjetoDeltaExemplo`
- InstanceId: `projeto-delta-exemplo`
- BotUsername: `dex_delta_example_bot`
- AllowedUserIds: `ID_DONO,<outros_ids_autorizados>`
- ProactiveUserIds: `ID_DONO`
- Aliases: `delta`, `projeto-delta`, `dex-delta`, `dex_delta_example_bot`

## Comando

```powershell
powershell -ExecutionPolicy Bypass -File C:\CodexProjetos\dex-agent\scripts\provision-dex-agent-project-instance.ps1 `
  -ProjectRoot "C:\CodexProjetos\ProjetoDeltaExemplo" `
  -InstanceId "projeto-delta-exemplo" `
  -ProjectLabel "ProjetoDeltaExemplo" `
  -BotUsername "dex_delta_example_bot" `
  -AllowedUserIds "ID_DONO,<outros_ids_autorizados>" `
  -ProactiveUserIds "ID_DONO" `
  -Aliases "delta,projeto-delta,dex-delta,dex_delta_example_bot" `
  -Start `
  -RunTelegramTest
```

## Criterio

- Nao alterar Supabase, Vercel, deploy ou produto.
- Nao expor token.
- Garantir `skills/dex-agent/` no `.gitignore` do projeto filho.
- Garantir `dex-acesso`, `dex-print` e `dex-audio` no filho.
- Em modo multiusuario, provar que cada usuario recebe apenas a propria midia.
- Provar status local e Telegram real.
