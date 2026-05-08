# Exemplo: Pessoa No ProjetoDeltaExemplo

Este exemplo mostra o formato esperado, sem versionar o `chat_id` real.

Arquivo local do filho:

`C:\CodexProjetos\ProjetoDeltaExemplo\.agents\CONTACTS.local.json`

```json
{
  "contacts": [
    {
      "chat_id": "ID_DA_PESSOA",
      "nome": "Pessoa Exemplo",
      "chamar_como": "Pessoa",
      "papel": "usuaria do projeto",
      "projeto_padrao": "ProjetoDeltaExemplo",
      "tom": "simples, paciente, pessoal e explicativo",
      "nivel_detalhe": "curto primeiro; detalhar se pedir",
      "midia_preferida": ["prints_mobile", "audio_curto", "texto"],
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

Contrato:

- `chat_id` identifica o perfil de tom.
- Acesso continua em `ALLOWED_USER_IDS`.
- Midia continua no chat solicitante.
- Nao criar frases afetivas automaticas.
