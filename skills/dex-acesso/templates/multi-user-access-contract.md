# Contrato De Acesso Multiusuario

## Projeto

- Projeto:
- Instancia:
- Bot:

## Usuarios

- `ALLOWED_USER_IDS`: acesso ao bot.
- `PROACTIVE_USER_IDS`: avisos proativos/admin.

## Regra De Destino

Quando um usuario pedir audio, print ou resposta operacional, o destino deve ser o chat solicitante.

Prioridade:

1. `-ChatId` / `--chat-id`
2. `DEX_REQUEST_CHAT_ID`
3. `DEX_CURRENT_CHAT_ID`
4. variavel especifica do helper
5. `TELEGRAM_CHAT_ID`
6. `PROACTIVE_USER_IDS[0]`
7. `ALLOWED_USER_IDS[0]` apenas fallback manual

## Teste Obrigatorio Por Usuario

- [ ] `/status` respondeu no chat correto.
- [ ] `dex-print` retornou `message_id` no chat correto.
- [ ] `dex-audio` retornou `message_id` no chat correto.
- [ ] Nenhum outro usuario recebeu a midia.
- [ ] Nenhuma janela visivel de `cmd.exe` ou PowerShell ficou aberta como efeito do pedido.

## Evidencia

- Data:
- Test ID:
- Message IDs:
- Captura:
