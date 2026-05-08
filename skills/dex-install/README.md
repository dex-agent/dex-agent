# Dex Install

Guia canonico para instalar uma instancia filha do Dex Agent em outro projeto.

## Quando Usar

Use este fluxo quando um projeto ainda nao tem `skills/dex-agent/instance.json` e precisa nascer com um bot Telegram proprio, workdir fixo, bootstrap local e registry de aliases.

Para uma instalacao ja existente, use `skills/dex-update/SKILL.md`.

## Pre-Requisitos

- Repo pai em `C:\CodexProjetos\dex-agent`.
- Dependencias do repo pai instaladas com `npm install`.
- Projeto filho ja criado em `C:\CodexProjetos\<Projeto>`.
- Bot Telegram criado no BotFather.
- `chat_id` do dono/autorizados conhecido.
- Token mantido fora de docs, commits, prompts e respostas.

## Instalacao Inicial Do Repo Pai

```powershell
cd C:\CodexProjetos
git clone https://github.com/dex-agent/dex-agent.git
cd C:\CodexProjetos\dex-agent
npm install
Copy-Item .env.example .env
notepad .env
npm run healthcheck
```

No `.env` do pai, configure no minimo:

```env
BOT_TOKEN=<token_do_bot_pai>
TELEGRAM_EXPECTED_USERNAME=<usuario_do_bot_pai_sem_arroba>
ALLOWED_USER_IDS=<id_dono>
PROACTIVE_USER_IDS=<id_dono>
WORKSPACE_ROOT=C:/CodexProjetos
CODEX_WORKDIR=C:/CodexProjetos/dex-agent
CODEX_BACKEND=sdk
FINAL_ACTIONS_AUTO_OFFER=false
```

Depois:

```powershell
npm run start
```

## Criar Um Dex Filho

Rode o script pelo repo pai. O comando abaixo nao recebe token em argumento; o script pede `BOT_TOKEN` via `Read-Host -AsSecureString`.

```powershell
powershell -ExecutionPolicy Bypass -File C:\CodexProjetos\dex-agent\scripts\provision-dex-agent-project-instance.ps1 `
  -ProjectRoot "C:\CodexProjetos\ProjetoDeltaExemplo" `
  -InstanceId "projeto-delta-exemplo" `
  -ProjectLabel "ProjetoDeltaExemplo" `
  -BotUsername "dex_delta_example_bot" `
  -AllowedUserIds "ID_DONO,<outros_ids_autorizados>" `
  -ProactiveUserIds "ID_DONO" `
  -Aliases "delta,projeto-delta,dex-delta,dex_delta_example_bot" `
  -Start `
  -RunTelegramTest
```

Saidas esperadas:

- `<ProjectRoot>\skills\dex-agent\instance.json`
- `<ProjectRoot>\skills\dex-agent\.env`
- `<ProjectRoot>\skills\dex-agent\SKILL.md`
- `<ProjectRoot>\AGENTS.md`
- `<ProjectRoot>\INDEX.md`
- `<ProjectRoot>\.agents\DEX_PAI.md`
- `<ProjectRoot>\.agents\DEX_REDE.md`
- entrada local em `config\dex-agent-network.local.json`
- `skills/dex-agent/` no `.gitignore` do projeto filho

## Validacao

```powershell
powershell -ExecutionPolicy Bypass -File C:\CodexProjetos\ProjetoDeltaExemplo\skills\dex-agent\scripts\status-dex-agent.ps1
```

Tambem confira:

- `getMe` validou o bot esperado.
- `/status` responde no Telegram do filho.
- Midia pedida por usuario vai para o chat solicitante.
- `FINAL_ACTIONS_AUTO_OFFER=false` esta no `.env` do filho.
- Nada em `skills/dex-agent/`, `.env`, `.runtime` ou `*.local.json` entrou no Git do filho.

## Prompt Pronto

Use `skills/dex-install/templates/install-prompt.md` para pedir a instalacao a outro agente Codex sem colar token na conversa.

## Guardrails

- Nao use `-BotToken` em comandos que podem ficar no historico do shell.
- Nao versionar `config\dex-agent-network.local.json`.
- Nao registrar autostart por padrao.
- Nao mexer no produto do projeto filho durante a instalacao.
- Se o filho ja tiver `skills/dex-agent/instance.json`, pare e use `dex-update`.
