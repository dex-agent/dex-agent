# Spec: Dex Contatos

## Objetivo

Personalizar o tom de resposta do Dex Agent por pessoa/chat do Telegram, sem misturar perfil humano com acesso, midia, memoria ou permissao.

## Modelo

Arquivo local real:

- `.agents/CONTACTS.local.json`

Template versionado:

- `.agents/CONTACTS.example.json`
- `skills/dex-contatos/templates/contacts.local.example.json`

Schema V1:

```json
{
  "contacts": [
    {
      "chat_id": "123456789",
      "nome": "Nome da pessoa",
      "chamar_como": "Nome",
      "papel": "usuario do projeto",
      "projeto_padrao": "NomeDoProjeto",
      "tom": "simples, paciente e explicativo",
      "nivel_detalhe": "curto primeiro; detalhar se pedir",
      "midia_preferida": ["texto", "prints_mobile", "audio_curto"],
      "evitar": [
        "tokens",
        "caminhos internos desnecessarios",
        "termos tecnicos sem explicacao"
      ],
      "ultima_revisao": "2026-04-28"
    }
  ]
}
```

Campos obrigatorios:

- `chat_id`

Campos opcionais:

- `nome`
- `chamar_como`
- `papel`
- `projeto_padrao`
- `tom`
- `nivel_detalhe`
- `midia_preferida`
- `evitar`
- `ultima_revisao`

## Runtime

Quando uma mensagem chegar:

1. Resolver `workdir` atual.
2. Ler `.agents/CONTACTS.local.json`, se existir.
3. Procurar contato por `ctx.chat.id`.
4. Se achar, anexar um bloco curto de tom ao prompt.
5. Se nao achar ou o JSON estiver invalido, seguir com o prompt original.

O bloco de contato deve dizer explicitamente que nao altera permissoes, destino de midia, memoria operacional nem proximo passo.

## Regras

- `chat_id` no contato nao autoriza acesso.
- Acesso continua em `ALLOWED_USER_IDS`.
- Aviso proativo continua em `PROACTIVE_USER_IDS`.
- Midia continua indo para o chat solicitante via `DEX_REQUEST_CHAT_ID`.
- Perfil de contato nao entra em `MEMORY.ndjson`.
- Dados reais de contato nao entram no Git.
- Frases afetivas automaticas ficam fora da V1.

## Aceite

- Contato encontrado por `chat_id` ajusta tom.
- Contato ausente nao altera prompt.
- JSON invalido nao derruba o bot.
- Imagem e audio transcrito recebem o mesmo contexto de contato.
- `dex-install` e `dex-update` sincronizam a skill.
- `.agents/CONTACTS.local.json` fica ignorado no Git dos filhos.
