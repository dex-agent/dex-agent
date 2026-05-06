# Example - Resolved Operational Finding

## Entrada Sanitizada

Uma memoria ativa foi resolvida apos ajuste no contrato de retomada. O teste de regressao confirmou que o proximo passo seguro nao reabre o achado.

## Saida Correta

- `estado`: resolvida
- `fonte_viva`: arquivo resolvido
- `quem_vence_em_conflito`: `HANDOFF.md`
- `quando_lembrar`: apenas auditoria ou regressao similar
- `quando_nao_lembrar`: retomada operacional normal
- `evidencia`: teste, decisao registrada ou artefato de fechamento

## Resposta Operacional Esperada

Remover ponteiros vivos, preservar historico e impedir que a memoria resolvida seja tratada como proximo passo.
