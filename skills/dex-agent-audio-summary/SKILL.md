---
name: dex-agent-audio-summary
description: Use quando o usuario pedir resumo em audio enviado pelo proprio bot desta conversa via Dex Agent. Esta skill usa o repo local em que ela esta instalada, envia `voice note` no Telegram via `bot.telegram.sendVoice(...)`, usa `pt-BR-FranciscaNeural` quando suportado, e deve confirmar entrega por `message_id` em vez de parar num arquivo local.
---

# Dex Agent Audio Summary

Use esta skill quando o pedido for:
- "me manda um resumo em audio"
- "envia isso no bot em audio"
- "repete o padrao do audio"
- "manda o resumo detalhado em audio"

Nao use esta skill para:
- gerar apenas um arquivo local sem enviar
- imagem, fluxograma ou organograma
- audio vindo de Hermes, SSH ou OpenClaw remoto

## Contrato verificado

- transporte correto: `Dex Agent`
- repo operacional: `<repo-root>`
- TTS verificado: `src/lib/audioTts.ts`
- envio verificado: `src/lib/audioSummaryManager.ts`
- metodo real: `bot.telegram.sendVoice(...)`
- artefato de voz: `dex-agent-resumo.ogg`
- alvo padrao: `PROACTIVE_USER_IDS[0]` ou `ALLOWED_USER_IDS[0]`
- voz preferida do usuario: `pt-BR-FranciscaNeural`
- estilo aprovado: calmo, tecnico e executivo, cobrindo `status atual`, `achados fortes` e `proximo passo`
- normalizacao verificada antes da fala:
  - remove markdown e caminhos
  - reescreve tokens tecnicos como `API`, `TTS`, `SDK`
  - converte intervalos como `561-572` para `561 a 572`
  - remove emoji e ruido transitivo de stream/autenticacao
  - base verificada em `tests/audioTts.test.ts`

## Regra critica

Nao parar em `.mp3` local.

O fluxo correto e:
1. preparar o texto
2. garantir que a fala passe pela normalizacao do `AudioTts`, para nao ler tracos, caminhos, emoji ou ruido literal
3. sintetizar para `ogg/opus` pelo pipeline do `Dex Agent`
4. enviar como `voice note` no Telegram
5. confirmar entrega por `message_id`

## Caminho rapido

Se o objetivo for enviar agora um resumo detalhado:

```powershell
powershell -ExecutionPolicy Bypass -File ".\skills\dex-agent-audio-summary\scripts\send-dex-agent-audio-summary.ps1" -Text "seu resumo aqui"
```

Se o texto estiver em arquivo:

```powershell
powershell -ExecutionPolicy Bypass -File ".\skills\dex-agent-audio-summary\scripts\send-dex-agent-audio-summary.ps1" -TextPath "C:\caminho\resumo.txt"
```

## O que a skill deve fazer

1. Montar o resumo em texto falavel.
2. Rodar o pipeline do repo `Dex Agent`, nao um atalho externo.
3. Enviar para o chat padrao configurado no bot, salvo override explicito.
4. Responder com o resultado objetivo:
   - `message_id`
   - arquivo enviado
   - se houve entrega real ou so geracao local

## Checklist de normalizacao

Antes de considerar o audio pronto, confirmar que o pipeline falado nao esta:
- lendo emoji
- lendo markdown cru
- lendo caminhos locais
- lendo sequencias como `561-572` em vez de `561 a 572`
- repetindo ruido transitorio como `Unauthorized`, `Reconnecting` ou `event stream lagged`

## Recuperacao rapida

Se houver duvida ou drift:
- ler `<repo-root>/src/lib/audioTts.ts`
- ler `<repo-root>/src/lib/audioSummaryManager.ts`
- ler `<repo-root>/tests/audioTts.test.ts`
- checar `.env` do `Dex Agent` para `BOT_TOKEN`, `PROACTIVE_USER_IDS`, `ALLOWED_USER_IDS`, `TTS_ENABLED` e `TTS_EDGE_VOICE`

## Sinais de pronto

- o envio nao termina em arquivo local solto
- o Telegram recebe `voice note`
- existe `message_id`
- a resposta ao usuario deixa claro que foi entrega real
