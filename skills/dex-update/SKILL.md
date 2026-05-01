---
name: dex-update
description: Use quando for atualizar ou ressincronizar uma instalacao Dex Agent ja existente em projeto filho, preservando .env, .runtime, tokens e estado local.
---

# Dex Update

Use esta skill quando o usuario pedir para atualizar um Dex Agent filho ja instalado.

## Contrato

- `dex-update` exige `<ProjectRoot>/skills/dex-agent/instance.json`.
- A atualizacao reaplica arquivos gerenciados do repo pai.
- `.env`, `.runtime`, tokens, logs e estado local sao preservados.
- `AGENTS.md`, `INDEX.md`, `.agents/DEX_PAI.md` e `.agents/DEX_REDE.md` sao atualizados pelo bloco Dex.
- O registry `dex-rede` pode ser atualizado com aliases.
- Restart e teste Telegram sao opcionais e explicitos. Quando `-Restart` for usado, a instancia existente deve ser parada antes da reaplicacao, os arquivos devem ser reaplicados sem `provision -Start` encadeado, e a instancia deve ser iniciada novamente ao final.
- `dex-acesso`, `dex-print` e `dex-audio` tambem fazem parte da sincronizacao para manter filhos aptos a operar multiusuario e midia no chat solicitante.
- `dex-contatos` tambem faz parte da sincronizacao para manter filhos aptos a aplicar tom por pessoa/chat_id sem misturar isso com acesso ou memoria.
- A sincronizacao deve preservar a regra de reboot/processos escondidos no Windows e o bootstrap de `dex-memoria` para qualquer pedido de memorizar.
- A sincronizacao deve preservar configuracoes locais do `.env` e garantir `FINAL_ACTIONS_AUTO_OFFER=false` quando nao houver decisao explicita de ativar botoes finais automaticos.
- O token preservado no `.env` nao deve ser repassado em argumento de processo; quando precisar chamar provisionamento interno, usar caminho temporario e remover ao final.

## Fluxo Obrigatorio

1. Ler `instance.json`.
2. Confirmar `source_root`, `install_root` e `workdir`.
3. Rodar `scripts/update-dex-agent-project-instance.ps1`.
4. Verificar status local.
5. Se solicitado, reiniciar e testar Telegram.
6. Responder com arquivos atualizados, status e evidencias.

## Comando Base

```powershell
powershell -ExecutionPolicy Bypass -File C:\CodexProjetos\dex-agent\scripts\update-dex-agent-project-instance.ps1 `
  -ProjectRoot "<ProjectRoot>" `
  -Aliases "<alias1,alias2>" `
  -Restart `
  -RunTelegramTest
```

## Nao Fazer

- Nao usar em projeto sem `instance.json`; nesse caso use `dex-install`.
- Nao sobrescrever `.env`.
- Nao apagar `.runtime`.
- Nao registrar autostart por padrao.
- Nao mexer no produto do projeto filho.

## Referencias

- `skills/dex-update/SPEC.md`
- `skills/dex-update/templates/update-contract.md`
- `scripts/update-dex-agent-project-instance.ps1`
