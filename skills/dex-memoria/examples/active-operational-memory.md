# Example - Active Operational Memory

## Entrada Sanitizada

Um projeto filho encontrou uma falha recorrente em retomadas: o agente insiste em reabrir uma investigacao ja fechada porque uma entrada antiga do ledger ainda parece ativa.

## Saida Correta

- `tipo`: achado
- `estado`: ativa
- `escopo`: projeto-filho
- `fonte_viva`: `.agents/HANDOFF.md`
- `quem_vence_em_conflito`: `HANDOFF.md`
- `quando_lembrar`: retomadas que mencionem a falha ou auditoria de memoria
- `quando_nao_lembrar`: fluxo normal depois que o achado for resolvido
- `criterio_de_resolucao`: retomada nao aponta mais para a investigacao fechada

## Resposta Operacional Esperada

Manter a memoria viva ate corrigir o ponteiro de retomada. O ledger preserva historico, mas nao vence o handoff atualizado.
