---
name: dex-install
description: Use quando for instalar o Dex Agent em um novo projeto filho com bot Telegram exclusivo, bootstrap local, dex-pai, dex-rede, dex-memoria, registry de aliases e evidencia real.
---

# Dex Install

Use esta skill quando o usuario pedir para instalar o Dex Agent em um novo projeto.

## Contrato

- `dex-install` e o contrato de instalacao de novo filho.
- A instalacao operacional fica em `<ProjectRoot>/skills/dex-agent`.
- O repo pai continua sendo `C:\CodexProjetos\dex-agent`.
- Tokens ficam apenas no `.env` local da instalacao filha.
- O projeto filho deve receber bootstrap local em `AGENTS.md`, `INDEX.md`, `.agents/DEX_PAI.md` e `.agents/DEX_REDE.md`.
- O repositorio filho deve ignorar `skills/dex-agent/`, porque a instalacao contem `.env`, runtime local e copia operacional gerenciada pelo pai.
- `dex-memoria` deve estar disponivel dentro da instalacao filha, mas continua sendo contrato de memoria, nao instalador.
- Pedidos de "memorizar", "lembrar" ou "guardar como memoria" no filho devem iniciar pelo contrato completo de `dex-memoria`, com ciclo de vida e criterio de parada de lembranca.
- `dex-acesso`, `dex-print` e `dex-audio` devem estar disponiveis para que novas instalacoes ja entendam acesso multiusuario e entrega de midia no chat solicitante.
- `dex-contatos` deve estar disponivel para que novas instalacoes ja entendam perfis locais de tom por `chat_id`, sem misturar isso com acesso ou memoria.
- `FINAL_ACTIONS_AUTO_OFFER=false` deve nascer no `.env` do filho; botoes finais automaticos so entram se o projeto ativar explicitamente esse contrato.
- Start, restart, reboot e helpers em Windows devem nascer escondidos; janela visivel de `cmd.exe`/PowerShell em pedido Telegram e regressao de launcher.
- A prova minima e status local + Telegram real ou motivo claro de bloqueio.

## Fluxo Obrigatorio

1. Confirmar que o `ProjectRoot` existe.
2. Confirmar se `skills/dex-agent` ja existe.
3. Validar o bot por `getMe` antes de escrever `.env`.
4. Rodar `scripts/provision-dex-agent-project-instance.ps1`.
5. Registrar aliases no registry `dex-rede`.
6. Garantir `skills/dex-agent/` no `.gitignore` do filho.
7. Iniciar a instancia quando o corte pedir.
8. Rodar status local.
9. Enviar prompt real no Telegram quando houver browser/sessao disponivel.
10. Salvar evidencia em `.agents/INBOX/`.
11. Responder sem expor token.

## Comando Base

```powershell
powershell -ExecutionPolicy Bypass -File C:\CodexProjetos\dex-agent\scripts\provision-dex-agent-project-instance.ps1 `
  -ProjectRoot "<ProjectRoot>" `
  -InstanceId "<instance-id>" `
  -ProjectLabel "<ProjectLabel>" `
  -BotUsername "<bot_username>" `
  -AllowedUserIds "<chat_id_dono,chat_id_cliente>" `
  -ProactiveUserIds "<chat_id_dono>" `
  -Aliases "<alias1,alias2,alias3>" `
  -Start `
  -RunTelegramTest
```

## Nao Fazer

- Nao colocar token em docs, artefatos, commits ou resposta final.
- Nao deixar `skills/dex-agent/` rastreavel no Git do filho.
- Nao registrar autostart antes do teste vivo aprovado.
- Nao mexer no produto do projeto filho durante a instalacao.
- Nao usar `dex-update` para projeto sem `skills/dex-agent/instance.json`.
- Nao tratar falha de produto como falha da instalacao sem evidencia.

## Referencias

- `skills/dex-install/README.md`
- `skills/dex-install/SPEC.md`
- `skills/dex-install/templates/install-contract.md`
- `skills/dex-install/templates/install-prompt.md`
- `scripts/provision-dex-agent-project-instance.ps1`
