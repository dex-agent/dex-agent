---
name: dex-pai
description: Use quando um projeto filho do Dex Agent precisar encaminhar achado, bug, sintoma, regressao, artefato ou relatorio ao Dex Agent pai configurado no `.env`. Alias: dex-pai. O fluxo cria ou referencia artefato local em .agents, envia resumo pelo helper do repo pai e evita depender da aba do Telegram Web ou de tokens copiados.
---

# Dex Pai

Use esta skill quando o usuario ou um repo disser:

- `dex-pai`
- `mande para o Dex pai`
- `encaminhe para o Dex pai`
- `crie artefato e avise o pai`
- `isso pertence ao Dex Agent pai`
- `o bot filho achou problema no motor/runtime/memoria`

## Identidade Canonica

- Alias operacional: `dex-pai`
- Bot Telegram: definido por `TELEGRAM_EXPECTED_USERNAME` no `.env` do pai
- Repo pai operacional: `$env:USERPROFILE\.dex-agent`
- Helper oficial: `$env:USERPROFILE\.dex-agent\scripts\send-dex-parent-message.ps1`
- Token do pai: nunca copiar para artefato, skill, doc ou resposta; o helper le `$env:USERPROFILE\.dex-agent\.env`
- Chat alvo: primeiro `PROACTIVE_USER_IDS`, depois `ALLOWED_USER_IDS`, no `.env` do pai

## Quando Encaminhar

Encaminhe para `dex-pai` quando o problema parecer pertencer a:

- motor do Dex Agent;
- runtime do bot;
- instalacao por projeto;
- memoria, recall, retomada ou `INDEX/ACTIVE/HANDOFF`;
- Telegram UX, botoes, quick actions ou pilotos;
- contexto contaminado, resposta circular, roteamento ou comportamento geral repetivel.

Nao encaminhe como bug do pai quando for claramente trabalho de produto do repo filho. Primeiro separe o sintoma.

## Fluxo Obrigatorio

1. Criar ou localizar artefato local no repo filho em `.agents/`.
2. O artefato deve conter:
   - sintoma;
   - evidencia;
   - esperado vs obtido;
   - passos de reproducao;
   - hipoteses sem fingir causa raiz;
   - limite do que nao reabrir;
   - criterio de correcao/regressao.
3. Enviar resumo ao `dex-pai` usando o helper oficial, nao Telegram Web.
4. Registrar no repo filho que o achado foi encaminhado.
5. Responder ao usuario com `message_id`, caminho do artefato e status: `encaminhado`, `em investigacao` ou `resolvido`.

## Comando Padrao

```powershell
$DexAgentHome = Join-Path $env:USERPROFILE ".dex-agent"
powershell -ExecutionPolicy Bypass -File (Join-Path $DexAgentHome "scripts\send-dex-parent-message.ps1") `
  -SourceProject "NOME_DO_PROJETO" `
  -ArtifactPath (Join-Path $env:USERPROFILE "Projetos\PROJETO\.agents\NOME_DO_ARTEFATO.md") `
  -Title "Achado encaminhado ao dex-pai" `
  -Text "Resumo curto: sintoma, esperado, obtido e proximo teste de fechamento."
```

## Prompt Curto Para Ensinar Um Repo Filho

```text
Quando encontrar problema que pareca ser do Dex Agent, use dex-pai:
1. crie artefato local em .agents/ com sintoma, evidencia, esperado vs obtido, reproducao, hipoteses e criterio de correcao;
2. envie resumo ao dex-pai usando `$env:USERPROFILE\.dex-agent\scripts\send-dex-parent-message.ps1`;
3. nao reabra produto local por causa de bug do motor;
4. responda com caminho do artefato e message_id.
```

## Regras De Seguranca

- Nao colar token em prompt, artefato ou resposta.
- Nao usar aba aberta do Telegram Web para escolher o destino quando o envio for administrativo.
- Nao iniciar segundo processo com o mesmo token.
- Se o helper disser que o token nao aponta para `TELEGRAM_EXPECTED_USERNAME`, parar e corrigir `.env` do pai.
- Se nao houver artefato local, criar um antes de avisar o pai, exceto em incidente urgente de bot fora do ar.
