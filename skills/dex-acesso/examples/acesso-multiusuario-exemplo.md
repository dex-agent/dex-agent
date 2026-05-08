# Exemplo: ProjetoDeltaExemplo Multiusuario

## Contexto

- Projeto: `C:\CodexProjetos\ProjetoDeltaExemplo`
- Instancia: `projeto-delta-exemplo`
- Bot: `@dex_delta_example_bot`
- Uso: mais de um usuario autorizado no mesmo projeto.

## Configuracao Esperada

```env
ALLOWED_USER_IDS=ID_DONO,ID_CLIENTE_A,ID_CLIENTE_B
PROACTIVE_USER_IDS=ID_DONO
```

`ALLOWED_USER_IDS` libera conversa. `PROACTIVE_USER_IDS` nao deve virar broadcast automatico para clientes.

## Teste A

Usuario A envia:

```text
TEST_ID: DASHBOARD-EXEMPLO-MEDIA-A

Use dex-print.
Envie um print de teste desta conversa para esta mesma conversa.
Nao envie para outro usuario.
Responda com chat_id destino e message_id.
```

Esperado:

- print recebido pelo Usuario A;
- `message_id` registrado;
- Usuario B nao recebe nada.

## Teste B

Usuario B envia:

```text
TEST_ID: DASHBOARD-EXEMPLO-MEDIA-B

Use dex-audio.
Envie um audio curto de teste para esta mesma conversa.
Nao envie para outro usuario.
Responda com chat_id destino e message_id.
```

Esperado:

- audio recebido pelo Usuario B;
- `message_id` registrado;
- Usuario A nao recebe nada.
