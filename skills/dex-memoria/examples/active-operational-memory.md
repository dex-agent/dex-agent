# Example - Active Operational Memory

## Entrada Real

```text
Projeto: AgendadorConsultasOticas
Origem: dex_agendadorconsultas_bot
Sintoma: pergunta "qual o proximo passo seguro?" respondeu em loop.
Artefato: C:\CodexProjetos\AgendadorConsultasOticas\.agents\DEX_AGENT_PAI_SINTOMA_LOOP_PROXIMO_PASSO_SEGURO.md
Estado: ainda nao corrigido no Dex Agent pai.
```

## Saida Correta

```yaml
id: agendador.loop-proximo-passo
titulo: Loop em pergunta livre de proximo passo
tipo: achado
estado: ativa
escopo: projeto-filho
projeto: AgendadorConsultasOticas
origem: Telegram + artefato local
evidencia:
  - C:\CodexProjetos\AgendadorConsultasOticas\.agents\DEX_AGENT_PAI_SINTOMA_LOOP_PROXIMO_PASSO_SEGURO.md
o_que_lembrar: pergunta livre de proximo passo entrou em loop
por_que_lembrar: impede retomada confiavel do projeto filho
quando_lembrar: ao retomar Agendador ou investigar Dex Agent pai
quanto_lembrar: resumo curto + caminho do artefato
como_usar_depois: corrigir no repo pai sem reabrir backend do Agendador
quando_nao_lembrar: depois de patch, testes locais, Telegram vivo e aviso ao filho
fonte_viva: .agents/HANDOFF.md
camada: viva
criterio_de_resolucao: pergunta livre usa project_status next e nao repete a propria pergunta
arquivamento: artefato historico no projeto filho
supersedes: []
proximo_dono: Dex Agent pai
```

## Resposta Operacional Esperada

```text
Veredito: ativa.
Nao reabrir backend do Agendador.
Proximo passo: corrigir no repo pai C:\CodexProjetos\dex-agent e retestar no Telegram real.
```
