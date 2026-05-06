# Prompt Curto Para Filho Usar Dex Memoria

Use este prompt em um projeto filho quando uma captura precisar ser classificada antes de virar memoria, artefato, handoff ou descarte.

```text
Use dex-memoria para classificar esta captura antes de salvar, lembrar ou encaminhar.

Captura:
<cole aqui>

Responda com:
- veredito: memoria viva | ledger-only | estacionamento | descarte | skill-candidate;
- fonte de verdade;
- quando lembrar;
- quando nao lembrar;
- proximo destino: local | pai | rede | nenhum.

Regras:
- HANDOFF.md manda no proximo passo seguro;
- ACTIVE.md manda no objetivo vivo e loops abertos;
- MEMORY.ndjson e ledger, nao fila viva;
- memoria resolvida nao orienta proximo passo;
- bug do pai usa rota pai;
- handoff entre filhos usa rota rede.
```
