# L1 - Lembranca

Use este template para criar a camada curta de gatilhos.

Regra: L1 deve ser sempre carregavel ou carregavel pelo dominio ativo. Ela nao
e tutorial, historico ou memoria detalhada. Cada linha deve ajudar a chegar em
L2 rapidamente.

## Limites

- Maximo recomendado: 30 linhas uteis.
- Uma linha por gatilho.
- Cada gatilho deve apontar para `memoria.md#ancora` ou fonte viva equivalente.
- Nao incluir secrets, paths privados, logs, screenshots ou estado real.

## Escopo

- `global`: somente gatilhos universais e ponteiros curtos.
- `tema`: gatilhos de dominio reutilizavel.
- `projeto`: gatilhos do repo ou trabalho atual.

Nao coloque no global um gatilho que so serve para um projeto.

## Gatilhos

- `<sintoma ou frase curta>` -> `<acao lembravel>` -> [memoria.md#ancora]
- `<erro recorrente>` -> `<suspeita inicial>` -> [memoria.md#outra-ancora]

## Quando Nao Usar

- Nao usar L1 para explicar mecanismo completo.
- Nao usar L1 para copiar checklist longo.
- Nao usar L1 para armazenar historico resolvido.

## Ligacoes

- L2: [memoria.md](memoria.md)
- L3: [conhecimento/](conhecimento/)
