# Example - Resolved Operational Finding

## Entrada Real

```text
Patch aplicado no Dex Agent pai.
Pergunta "qual o proximo passo seguro?" passou a usar project_status next.
Teste vivo no dex_agendadorconsultas_bot passou.
Aviso enviado ao filho via dex-rede com message_id 185.
```

## Saida Correta

```yaml
id: agendador.loop-proximo-passo
titulo: Loop em pergunta livre de proximo passo
tipo: achado
estado: resolvida
escopo: projeto-filho
projeto: AgendadorConsultasOticas
nao_usar_para: proximo passo operacional
evidencia_de_fechamento:
  - src/bot/handlers.ts
  - tests/handlers.test.ts
  - C:\CodexProjetos\dex-agent\.agents\INBOX\agendador-loop-fix-final-pass-2026-04-26.png
  - message_id: 185
atualizar_obrigatorio:
  - INDEX.md
  - .agents/ACTIVE.md
  - .agents/HANDOFF.md
  - artefato local do achado
  - MEMORY.ndjson se houver entrada relacionada
quando_nao_lembrar: retomada normal do Agendador depois da resolucao
resultado: manter apenas como historico auditavel
```

## Resposta Operacional Esperada

```text
Veredito: resolvida.
O achado nao deve mais orientar o proximo passo do Agendador.
Se aparecer de novo, tratar como regressao nova, nao como pendencia antiga.
```
