# Example - Child To Child Handoff

## Entrada Sanitizada

Um projeto filho descobriu uma informacao que pertence a outro projeto filho. Nao e bug do Dex Agent pai.

## Saida Correta

- `tipo`: procedimento
- `estado`: ativa ate envio confirmado
- `escopo`: cross-project
- `proximo_dono`: projeto filho destino
- `quando_lembrar`: enquanto o handoff nao for confirmado
- `quando_nao_lembrar`: depois do envio confirmado e registrado

## Resposta Operacional Esperada

Usar rota rede, nao rota pai. Registrar o identificador de envio quando houver.
