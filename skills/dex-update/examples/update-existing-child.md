# Exemplo: Atualizar Filho Existente

```powershell
$DexAgentHome = Join-Path $env:USERPROFILE ".dex-agent"
powershell -ExecutionPolicy Bypass -File (Join-Path $DexAgentHome "scripts\update-dex-agent-project-instance.ps1") `
  -ProjectRoot (Join-Path $env:USERPROFILE "Projetos\ProjetoBetaExemplo") `
  -Aliases "controle,projeto-beta,dex-beta" `
  -Restart `
  -RunTelegramTest
```

Resultado esperado:

- `.env` preservado.
- `.runtime` preservado.
- arquivos gerenciados sincronizados.
- status local e Telegram real validados.
