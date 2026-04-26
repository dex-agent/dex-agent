# Memory Resolution Checklist

Use este checklist quando uma memoria ativa for corrigida, cumprida, substituida ou arquivada.

## 1. Prova

- [ ] A correcao, decisao ou fechamento foi realmente feito.
- [ ] Existe evidencia minima: teste, arquivo, screenshot, message_id ou decisao registrada.
- [ ] O criterio de resolucao original foi atendido.
- [ ] A memoria nao esta apenas "parecendo resolvida".

## 2. Superficies Vivas

- [ ] `INDEX.md` nao aponta mais a memoria como ativa, salvo se ainda for o caso.
- [ ] `.agents/HANDOFF.md` nao usa a memoria como proximo passo.
- [ ] `.agents/ACTIVE.md` nao lista a memoria como loop aberto.
- [ ] `.agents/sprints/INDEX.md` foi atualizado se havia sprint relacionado.
- [ ] Artefato local foi marcado como `resolvido`, `arquivado` ou `superseded`.

## 3. Ledger E Historico

- [ ] `.agents/MEMORY.ndjson` recebeu supersedencia quando necessario.
- [ ] Historico foi preservado sem virar fila viva.
- [ ] Arquivo fechado foi movido para `.agents/ARQUIVADO/` quando aplicavel.

## 4. Comunicacao

- [ ] Repo filho foi avisado se a memoria veio de um filho.
- [ ] `dex-pai` foi usado para bug do pai.
- [ ] `dex-rede` foi usado para handoff entre filhos.
- [ ] `message_id` foi registrado quando houve envio por Telegram/API.

## 5. Teste De Regressao

- [ ] Pergunta `onde paramos?` retorna estado vivo correto.
- [ ] Pergunta `qual o proximo passo seguro?` nao aponta para memoria resolvida.
- [ ] Recall nao usa arquivo arquivado como proximo passo.
- [ ] Se houver conflito, `HANDOFF.md` vence `MEMORY.ndjson`.

## Veredito

```text
Veredito: resolvida | arquivada | superseded | ainda ativa
Evidencia:
Arquivos atualizados:
Mensagem enviada:
Risco restante:
```
