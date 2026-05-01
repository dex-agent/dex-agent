# Exemplo: PremierDashboard

## Entrada

- ProjectRoot: `C:\CodexProjetos\PremierDashboard`
- ProjectLabel: `PremierDashboard`
- InstanceId: `premier-dashboard`
- BotUsername: `premier_dashboardbot`
- AllowedUserIds: `8736107242,<outros_ids_autorizados>`
- ProactiveUserIds: `8736107242`
- Aliases: `premier`, `premierdashboard`, `dashboard-premier`, `otica-premier`, `premier_dashboardbot`

## Comando

```powershell
powershell -ExecutionPolicy Bypass -File C:\CodexProjetos\dex-agent\scripts\provision-dex-agent-project-instance.ps1 `
  -ProjectRoot "C:\CodexProjetos\PremierDashboard" `
  -InstanceId "premier-dashboard" `
  -ProjectLabel "PremierDashboard" `
  -BotUsername "premier_dashboardbot" `
  -AllowedUserIds "8736107242,<outros_ids_autorizados>" `
  -ProactiveUserIds "8736107242" `
  -Aliases "premier,premierdashboard,dashboard-premier,otica-premier,premier_dashboardbot" `
  -Start `
  -RunTelegramTest
```

## Criterio

- Nao alterar Supabase, Vercel, deploy ou produto.
- Nao expor token.
- Garantir `skills/dex-agent/` no `.gitignore` do PremierDashboard.
- Garantir `dex-acesso`, `dex-print` e `dex-audio` no filho.
- Em modo multiusuario, provar que cada usuario recebe apenas a propria midia.
- Provar status local e Telegram real.
