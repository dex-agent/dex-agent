# Prompt Curto Para Filho Usar Dex Memoria

Use este prompt em um projeto filho quando uma captura precisar ser classificada antes de virar memoria, artefato, handoff ou descarte.

```text
Use dex-memoria para classificar esta captura antes de salvar, lembrar ou encaminhar.

Captura:
<cole aqui a captura>

Responda:
- veredito: memoria viva | ledger-only | estacionamento | descarte | skill-candidate;
- fonte de verdade;
- quando lembrar;
- quando nao lembrar;
- proximo destino: local | dex-pai | dex-rede | nenhum.

Regras:
- HANDOFF.md manda no proximo passo seguro;
- ACTIVE.md manda no objetivo vivo e loops abertos;
- MEMORY.ndjson e ledger, nao fila viva;
- memoria resolvida nao orienta proximo passo;
- bug do pai usa dex-pai;
- handoff entre filhos usa dex-rede.
```

## Exemplo De Captura

```text
O bot respondeu uma pendencia antiga como proximo passo, mas o achado ja foi resolvido no Dex pai.
```

## Resposta Esperada

```text
Veredito: resolvida ou ledger-only, nao memoria viva.
Fonte de verdade: HANDOFF.md se houver conflito.
Quando lembrar: apenas como historico ou regressao nova.
Quando nao lembrar: retomada normal depois da resolucao.
Proximo destino: nenhum, salvo se aparecer evidencia de regressao.
```
