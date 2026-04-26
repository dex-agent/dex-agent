# Memory Contract Template

Use este template antes de promover uma captura para memoria operacional.

## Identidade

- `id`:
- `titulo`:
- `tipo`: `regra | decisao | procedimento | achado | estado | residuo | aprendizado`
- `estado`: `ativa | resolvida | arquivada | superseded | descartada | estacionada`
- `escopo`: `repo | projeto-filho | subsistema | tarefa | cross-project`
- `projeto`:
- `origem`:
- `data`:

## Evidencia

- `arquivo`:
- `comando`:
- `teste`:
- `telegram_message_id`:
- `screenshot`:
- `decisao registrada`:

## Clausulas De Lembranca

- `o_que_lembrar`:
- `por_que_lembrar`:
- `quando_lembrar`:
- `quanto_lembrar`:
- `como_usar_depois`:
- `quando_nao_lembrar`:

## Fonte De Verdade

- `fonte_viva`: `INDEX.md | .agents/HANDOFF.md | .agents/ACTIVE.md | sprint | artefato | MEMORY.ndjson | arquivo`
- `camada`: `viva | ledger | arquivo`
- `quem_vence_em_conflito`:

## Ciclo De Vida

- `criterio_de_resolucao`:
- `arquivamento`:
- `supersedes`:
- `proximo_dono`:
- `data_de_revisao`:

## Saida Esperada

```text
Veredito: ativa | ledger-only | estacionada | descartada | resolvida
Fonte de verdade: <arquivo>
Proximo passo: <acao ou nenhum>
Quando parar de lembrar: <condicao objetiva>
```
