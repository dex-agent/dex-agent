---
name: dex-contatos
description: Use para configurar ou auditar perfis locais de contato por chat_id, personalizando tom, nivel de detalhe e preferencias de midia sem alterar acesso, roteamento, memoria operacional ou permissoes.
---

# Dex Contatos

`dex-contatos` define como falar com cada pessoa no Telegram.

Ela nao libera acesso, nao escolhe destino de midia e nao memoriza proximo passo.

## Quando usar

Use esta skill quando precisar:

- personalizar tom de resposta por `chat_id`;
- cadastrar como chamar uma pessoa;
- orientar nivel de detalhe, midia preferida e termos a evitar;
- revisar se um contato local esta seguro e nao expoe dados sensiveis;
- instalar ou atualizar um filho para nascer sabendo esse contrato.

## Separacao de responsabilidades

- `dex-acesso`: quem pode falar com o bot e para onde vao avisos proativos.
- `dex-contatos`: como o Dex fala com uma pessoa ja autorizada.
- `dex-print` e `dex-audio`: enviam midia para o chat solicitante.
- `dex-memoria`: decide o que deve virar memoria operacional.

## Fonte local

Dados reais ficam somente no projeto filho:

- `.agents/CONTACTS.local.json`

Esse arquivo deve ficar fora do Git.

Templates e exemplos ficam versionados:

- `.agents/CONTACTS.example.json`
- `skills/dex-contatos/templates/contacts.local.example.json`
- `skills/dex-contatos/examples/perfil-contato-exemplo.md`

## Regra central

O perfil de contato ajusta apenas o tom da resposta.

Ele nao altera:

- `ALLOWED_USER_IDS`;
- `PROACTIVE_USER_IDS`;
- `DEX_REQUEST_CHAT_ID`;
- destino de audio ou print;
- memoria operacional;
- proximo passo vivo do projeto.

## Limite da V1

A V1 aplica automaticamente o perfil local quando o `chat_id` existir em `.agents/CONTACTS.local.json`.

Nao ha comandos `/contato add`, `/contato remove` ou sincronizacao global de contatos.
