# Example - Child To Child Handoff

## Entrada Real

```text
Origem: MemoriaGeral
Destino: ControlePessoal
Contexto: conteudo do vault Obsidian precisa ser usado no fluxo de OpusClip do ControlePessoal.
Pedido: enviar a captura atual para o filho destino.
```

## Saida Correta

```yaml
id: memoria-to-controle.opusclip-capture
titulo: Handoff MemoriaGeral para ControlePessoal
tipo: procedimento
estado: ativa
escopo: cross-project
origem: MemoriaGeral
destino: ControlePessoal
o_que_lembrar: conteudo do vault deve virar material de trabalho no ControlePessoal
por_que_lembrar: o processamento real acontecera no filho destino
quando_lembrar: ao encaminhar conteudo entre filhos para execucao operacional
quanto_lembrar: resumo curto + caminho do artefato local
como_usar_depois: criar artefato local e enviar por dex-rede
quando_nao_lembrar: depois que o filho destino receber, registrar message_id e assumir o handoff
fonte_viva: artefato local em .agents/
rota: dex-rede
nao_usar: dex-pai
evidencia_minima:
  - caminho do artefato
  - alias destino
  - message_id
```

## Resposta Operacional Esperada

```text
Veredito: handoff entre filhos.
Use dex-rede, nao dex-pai.
Crie artefato local em .agents/ e envie para controle/opusclip com message_id.
```
