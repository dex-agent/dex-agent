---
name: dex-rede
description: "Use quando um projeto filho do Dex Agent precisar encaminhar mensagem, conteudo, artefato, resumo ou pedido operacional para outro projeto filho por alias, por exemplo MemoriaGeral para ControlePessoal/opusclip, ControlePessoal para Agendador, ou qualquer envio entre bots instalados. Alias: dex-rede, dex-filho, filho-para-filho."
---

# Dex Rede

Use esta skill quando o usuario ou um repo disser:

- `dex-rede`
- `mande para outro filho`
- `envie para dex-controlepessoal`
- `encaminhe isso para opusclip`
- `mande este conteudo da MemoriaGeral para ControlePessoal`
- `filho para filho`

## Contrato

- Telegram nao permite bot conversar com bot como se fosse usuario.
- O fluxo correto e administrativo: usar o token do bot destino, lido do `.env` da instalacao destino, para postar no chat liberado desse destino.
- A prova minima e `message_id`, bot destino validado por `getMe`, alias resolvido e caminho do artefato quando houver.
- O envio nao deve copiar token em prompt, artefato ou resposta.
- Para execucao real no projeto destino, escreva a mensagem como handoff operacional claro, com proximo passo e criterio de pronto. O envio por API entrega a mensagem no chat destino; nao finge que o bot destino recebeu mensagem de outro bot como update de usuario.

## Destinos

O helper oficial usa:

- `C:\CodexProjetos\dex-agent\config\dex-agent-network.local.json` quando existir;
- `C:\CodexProjetos\dex-agent\config\dex-agent-network.example.json` como exemplo versionavel;
- `DEX_AGENT_NETWORK_REGISTRY` ou `-RegistryPath` para maquinas com outro layout.

Aliases esperados no ambiente atual:

- `dex-pai`, `pai`, `codex10`
- `agendador`, `dex-agendador`
- `controle`, `controlepessoal`, `opusclip`
- `memoria`, `memoriageral`, `obsidian`

## Fluxo Obrigatorio

1. Criar ou localizar artefato local em `.agents/` quando houver conteudo duravel, sintoma, decisao ou contexto que nao deve se perder.
2. Escrever a mensagem com origem, destino, objetivo, resumo e proximo passo esperado.
3. Enviar pelo helper oficial `scripts\send-dex-child-message.ps1`, nao pela aba do Telegram Web.
4. Conferir `message_id`, bot destino e alias resolvido.
5. Responder ao usuario com caminho do artefato, destino, `message_id` e se foi notificacao, handoff ou pedido de execucao.

## Comando Padrao

```powershell
powershell -ExecutionPolicy Bypass -File C:\CodexProjetos\dex-agent\scripts\send-dex-child-message.ps1 `
  -To "controle" `
  -SourceProject "MemoriaGeral" `
  -ArtifactPath "D:\Drive\SegundaMente\CrSantos\.agents\CONTEUDO_OPUSCLIP.md" `
  -Title "Handoff MemoriaGeral -> ControlePessoal" `
  -Text "Resumo curto, objetivo no opusclip, proximo passo esperado e criterio de pronto."
```

## Prompt Curto Para Ensinar Um Repo Filho

```text
Quando eu disser dex-rede, envie mensagem para outro projeto Dex Agent por alias:
1. crie ou referencie artefato local em .agents/ se o conteudo for duravel;
2. use C:\CodexProjetos\dex-agent\scripts\send-dex-child-message.ps1;
3. escolha o destino por alias, como controle, opusclip, memoria, agendador ou dex-pai;
4. nao copie token;
5. responda com destino, caminho do artefato e message_id.
```

## Regras De Seguranca

- Nunca colar token.
- Nao mandar conteudo sensivel para projeto errado; use `-DryRun` quando houver duvida.
- Se `getMe` apontar para bot diferente do esperado, parar e corrigir o registro ou `.env`.
- Se o objetivo for bug do motor do Dex Agent, prefira `dex-pai`; se for handoff entre projetos, use `dex-rede`.
- Se o destino for `controle/opusclip`, deixar claro se e apenas material de trabalho ou pedido de acao.
