# Memory Contract Template

Use este template antes de promover uma captura para memoria operacional.

Este e o contrato `memorizador` do `dex-memoria`: ele padroniza como, quando,
quanto, por que, por quanto tempo e quando nao lembrar. Memoria global nao e
somente leitura: quando uma lembranca tiver valor cross-project, grave um
ponteiro curto, intuitivo e indexavel em `MEMORY.md`, apontando para a fonte viva
completa. O registro global nao e tutorial, copia de contrato, historico grande
ou dump de contexto; em todos os casos, preserve criterio, fonte viva, conflito
e revisao.

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
- `por_quanto_tempo_lembrar`:
- `como_usar_depois`:
- `quando_nao_lembrar`:

## Fonte De Verdade

- `fonte_viva`: `INDEX.md | .agents/HANDOFF.md | .agents/ACTIVE.md | sprint | artefato | MEMORY.ndjson | arquivo`
- `camada`: `viva | ledger | arquivo`
- `quem_vence_em_conflito`:

## Ponteiro Global

- `ponteiro_global_recomendado`: `sim | nao`
- `lembranca_global_curta`:
  - `gatilho`:
  - `abrir_fonte_viva`:
  - `o_que_procurar_la`:
  - `quem_vence_em_conflito`:
  - `quando_nao_usar`:
  - `criterio_para_remover_ou_revisar_o_ponteiro`:

## Ciclo De Vida

- `criterio_de_resolucao`:
- `arquivamento`:
- `supersedes`:
- `proximo_dono`:
- `data_de_revisao`:

## Saida Esperada

Quando lembrar: `<condicao objetiva>`

Quando nao lembrar: `<condicao objetiva>`

Ponteiro global: `<nenhum | indice curto para a fonte viva>`
