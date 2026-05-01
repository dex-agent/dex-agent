# Spec: Dex Acesso

## Objetivo

Padronizar acesso multiusuario e roteamento de destino no Dex Agent.

O problema que esta skill evita: um usuario autorizado pede audio ou print, mas o helper envia para outro usuario porque caiu no primeiro ID de `PROACTIVE_USER_IDS` ou `ALLOWED_USER_IDS`.

## Modelo De Configuracao

- `ALLOWED_USER_IDS`: lista cumulativa de usuarios que podem interagir com o bot.
- `PROACTIVE_USER_IDS`: lista de administradores ou donos que recebem avisos iniciados pelo sistema.
- `DEX_REQUEST_CHAT_ID`: chat atual de uma execucao iniciada pelo Telegram.
- `DEX_CURRENT_CHAT_ID`: alias operacional do chat atual.

## Regra De Ouro

Se uma acao nasceu de uma conversa, a resposta volta para essa conversa.

Fallbacks de `.env` so entram quando nao existe chat solicitante, por exemplo em envio manual por terminal, rotina proativa ou handoff administrativo.

## Fluxo Para Novo ID

1. Coletar o ID Telegram.
2. Adicionar em `ALLOWED_USER_IDS`.
3. Nao adicionar em `PROACTIVE_USER_IDS`, salvo se esse usuario tambem deve receber avisos admin.
4. Reiniciar a instancia.
5. Testar `/status`.
6. Testar `dex-print`.
7. Testar `dex-audio`.
8. Registrar evidencias com `message_id`.

## Fluxo De Auditoria

1. Confirmar bot e instancia.
2. Confirmar IDs permitidos sem expor token.
3. Confirmar destino proativo.
4. Rodar dry-run de `dex-print` com IDs invertidos.
5. Rodar dry-run de `dex-audio` ou teste unitario equivalente.
6. Executar teste real por cada ID ativo.
7. Aprovar apenas se nao houver midia cruzada.

## Criterios De Aceite

- `dex-print` escolhe `DEX_REQUEST_CHAT_ID` antes de qualquer fallback.
- `dex-audio` escolhe `DEX_REQUEST_CHAT_ID` antes de qualquer fallback.
- `ALLOWED_USER_IDS` nao vira destino padrao de resposta quando ha chat atual.
- `PROACTIVE_USER_IDS` continua valido para rotinas sem chat solicitante.
- `dex-install` e `dex-update` sincronizam esta skill para filhos.
- Processos auxiliares iniciados por pedidos Telegram usam janela escondida no Windows.

## Criterios De Regressao

- Um usuario recebe midia pedida por outro.
- Documentacao diz que o primeiro ID permitido e alvo padrao para resposta de usuario.
- Teste usa Telegram Web manual como prova do helper.
- Token ou lista completa de IDs aparece em log publico ou commit.
- Pedido Telegram deixa janela visivel de `cmd.exe`/PowerShell como efeito normal.
