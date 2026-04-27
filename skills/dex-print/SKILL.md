---
name: dex-print
description: Use quando o usuario pedir para enviar print, screenshot ou imagem visual pelo Dex Agent no Telegram, especialmente frases como "manda aqui no bot", "envia no Dex", "quero receber no Telegram" ou "print visual". A skill envia arquivos reais como photo/document via Bot API, confirma message_id e evita parar apenas em anexo local ou Telegram Web.
---

# Dex Print

Use esta skill quando o pedido envolver imagem visual entregue no Telegram pelo Dex Agent:

- "dex-print"
- "me manda o print no bot"
- "envia essa screenshot no Telegram"
- "quero ver aqui no Dex"
- "manda as prints da tela"
- "print visual pelo Dex Agent"

Nao use para:

- resposta textual simples;
- audio ou voice note, que pertence a `dex-agent-audio-summary` / `dex-audio`;
- imagem local sem pedido de envio pelo Telegram;
- envio manual pela aba do Telegram Web.

## Contrato

O fluxo correto e:

1. Confirmar que a imagem representa o estado atual.
2. Se o visual mudou ou a imagem esta velha, gerar print novo antes do envio.
3. Enviar pelo Dex Agent/Telegram Bot API como `photo`.
4. Se `photo` falhar por tamanho, formato ou limite do Telegram, cair para `document`.
5. Responder com:
   - arquivo enviado;
   - modo usado: `photo` ou `document`;
   - `message_id`;
   - se foi helper/API, nao Telegram Web.

Regra critica: nao dizer que enviou enquanto so existe arquivo local ou imagem anexada na conversa do Codex.

## Helper Canonico

Use o wrapper local do repo:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\CodexProjetos\dex-agent\skills\dex-print\scripts\send-dex-print.ps1" -Path "C:\caminho\print.png" -Caption "Descricao curta" -Json
```

Para varias imagens:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\CodexProjetos\dex-agent\skills\dex-print\scripts\send-dex-print.ps1" `
  -Path "C:\prints\desktop.png","C:\prints\mobile.png" `
  -Caption "Agenda Premier" `
  -Json
```

Para validar arquivos sem enviar:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\CodexProjetos\dex-agent\skills\dex-print\scripts\send-dex-print.ps1" -Path "C:\caminho\print.png" -Json -DryRun
```

O helper usa:

- `BOT_TOKEN` ou `TELEGRAM_BOT_TOKEN`;
- `-ChatId`, ou ambiente `DEX_PRINT_CHAT_ID`, `TELEGRAM_CHAT_ID`, `PROACTIVE_USER_IDS` ou `ALLOWED_USER_IDS`;
- fallback opcional de `.env` em `C:\CodexProjetos\dex-agent\.env`.

Nunca exponha token na resposta ao usuario.

## Se Nao Houver Print Pronto

1. Gere screenshot com Playwright, browser-use ou helper local do projeto.
2. Salve em `output/playwright/` quando estiver em repo.
3. Abra/valide visualmente se o usuario pediu alinhamento ou qualidade.
4. Envie com `dex-print`.

## Saida Ao Usuario

Formato curto:

```text
Contrato: dex-print
Canal: Telegram via Dex Agent
Modo: photo
Arquivos:
- desktop.png -> message_id: 123
- mobile.png -> message_id: 124
Envio feito por helper/API, nao Telegram Web.
```

## Recuperacao

- `BOT_TOKEN ausente`: carregar `.env` do Dex Agent ou pedir token/configuracao.
- `chat_id ausente`: passar `-ChatId` ou configurar `DEX_PRINT_CHAT_ID`.
- `photo` falhou: repetir em `document` ou usar `-Mode document`.
- arquivo desatualizado: gerar screenshot novo antes de reenviar.
- erro de rede/API: responder com a falha exata sem inventar `message_id`.

## Sinais De Pronto

- Telegram retornou `ok = true`;
- cada imagem tem `message_id`;
- a resposta final cita modo e arquivo;
- nao houve uso de Telegram Web;
- backend/produto nao foi reaberto so para entregar print.
