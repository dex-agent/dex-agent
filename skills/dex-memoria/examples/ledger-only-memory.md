# Example - Ledger-Only Memory

## Entrada Real

```text
Aprendizado: memoria nao pode ser so anotacao; precisa ter contrato de ciclo de vida.
```

## Saida Correta

```json
{
  "id": "memory.lifecycle-contract",
  "createdAt": "2026-04-26T00:00:00-03:00",
  "project": "dex-agent",
  "scope": "repo",
  "kind": "rule",
  "title": "Memoria precisa de ciclo de vida",
  "summary": "Toda memoria operacional deve declarar quando lembrar, quando nao lembrar e como sair do estado vivo.",
  "evidence": [
    {
      "type": "operator",
      "ref": "reuniao operacional de ciclo de vida da memoria"
    }
  ],
  "tags": ["memory-system", "governance", "lifecycle"],
  "supersedes": [],
  "confidence": "high",
  "source": "operator"
}
```

## Resposta Operacional Esperada

```text
Veredito: ledger-only.
Isto orienta metodo futuro, mas nao vira proximo passo sozinho.
Nao atualizar HANDOFF.md apenas por causa deste aprendizado.
```
