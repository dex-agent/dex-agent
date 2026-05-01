# Exemplo: Atualizar Filho Existente

```powershell
powershell -ExecutionPolicy Bypass -File C:\CodexProjetos\dex-agent\scripts\update-dex-agent-project-instance.ps1 `
  -ProjectRoot "C:\CodexProjetos\ControlePessoal" `
  -Aliases "controle,controlepessoal,opusclip" `
  -Restart `
  -RunTelegramTest
```

Resultado esperado:

- `.env` preservado.
- `.runtime` preservado.
- arquivos gerenciados sincronizados.
- status local e Telegram real validados.
