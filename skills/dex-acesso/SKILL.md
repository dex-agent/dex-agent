---
name: dex-acesso
description: Use quando for configurar ou auditar usuarios permitidos, chat_id, envio de audio/print por conversa, PROACTIVE_USER_IDS, ALLOWED_USER_IDS e roteamento multiusuario do Dex Agent.
---

# Dex Acesso

Use esta skill quando o trabalho envolver:

- adicionar ou revisar IDs permitidos no Telegram;
- auditar se audio ou print esta indo para a conversa correta;
- configurar um filho com mais de um usuario;
- explicar a diferenca entre `ALLOWED_USER_IDS` e `PROACTIVE_USER_IDS`;
- testar que `dex-print` e `dex-audio` respondem no chat solicitante.

## Contrato

- `ALLOWED_USER_IDS` e lista de acesso: quem pode conversar com o bot.
- `PROACTIVE_USER_IDS` e destino administrativo/proativo: quem recebe avisos iniciados pelo sistema quando nao existe conversa solicitante.
- Em acao iniciada por usuario, o `chat_id` da conversa atual vence qualquer fallback.
- `dex-print` envia imagem para a conversa solicitante, salvo `-ChatId` explicito.
- `dex-audio` envia voice note para a conversa solicitante, salvo `-ChatId` explicito.
- Nunca use `ALLOWED_USER_IDS[0]` como destino de resposta quando `DEX_REQUEST_CHAT_ID` ou `DEX_CURRENT_CHAT_ID` estiver disponivel.

## Prioridade De Destino

Para envio de midia ou resposta operacional iniciada por usuario:

1. parametro explicito `-ChatId` ou `--chat-id`;
2. `DEX_REQUEST_CHAT_ID`;
3. `DEX_CURRENT_CHAT_ID`;
4. variavel especifica do helper, como `DEX_PRINT_CHAT_ID`;
5. `TELEGRAM_CHAT_ID`;
6. `PROACTIVE_USER_IDS[0]`;
7. `ALLOWED_USER_IDS[0]` apenas como ultimo fallback manual.

## Como Adicionar Usuario

1. Confirmar o ID Telegram real do usuario.
2. Adicionar o ID em `ALLOWED_USER_IDS`, separado por virgula.
3. Manter `PROACTIVE_USER_IDS` apenas com o dono/admin que deve receber avisos proativos.
4. Reiniciar a instancia do Dex Agent.
5. Fazer teste real desse usuario pedindo:
   - um print via `dex-print`;
   - um audio via `dex-audio`;
   - uma pergunta de status.
6. Aprovar somente com `message_id` e destino correto para cada pedido.

## Nao Fazer

- Nao colocar todos os usuarios em `PROACTIVE_USER_IDS` se a intencao for apenas liberar conversa.
- Nao usar o primeiro ID permitido como destino fixo para midia.
- Nao expor token em docs, artefatos, logs ou resposta final.
- Nao usar Telegram Web manual como prova de envio de helper.
- Nao confundir memoria compartilhada do projeto com fila/sessao individual de chat.
- Nao considerar normal janela visivel de `cmd.exe` ou PowerShell aberta por pedido Telegram; runners e helpers devem nascer escondidos no Windows.

## Sinais De Pronto

- Todos os usuarios permitidos conseguem conversar.
- Audio e print voltam para o mesmo chat que pediu.
- `message_id` foi registrado para cada envio real.
- `PROACTIVE_USER_IDS` continua reservado para avisos proativos/admin.
- Novas instalacoes citam `dex-acesso`, `dex-print` e `dex-audio` no bootstrap.
