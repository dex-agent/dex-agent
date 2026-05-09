# Dex Install

Guia canonico para instalar uma instancia filha do Dex Agent em outro projeto.

Convencao de caminhos:

- `DEX_AGENT_HOME`: instalacao operacional real do pai em `$env:USERPROFILE\.dex-agent`.
- `ProjectRoot`: caminho do projeto filho, fora de `DEX_AGENT_HOME`, por exemplo `$env:USERPROFILE\Projetos\ProjetoDeltaExemplo`.
- O clone usado para desenvolvimento/GitHub pode viver em outro lugar; ele nao deve ser tratado como instalacao operacional.

## Quando Usar

Use este fluxo quando um projeto ainda nao tem `skills/dex-agent/instance.json` e precisa nascer com um bot Telegram proprio, workdir fixo, bootstrap local e registry de aliases.

Para uma instalacao ja existente, use `skills/dex-update/SKILL.md`.

## Pre-Requisitos

- Repo pai operacional em `$env:USERPROFILE\.dex-agent`.
- Dependencias do repo pai instaladas com `npm install`.
- Projeto filho ja criado fora do repo pai, por exemplo `$env:USERPROFILE\Projetos\<Projeto>`.
- Bot Telegram criado no BotFather.
- `chat_id` do dono/autorizados conhecido.
- Token mantido fora de docs, commits, prompts e respostas.

## Instalacao Inicial Do Repo Pai

```powershell
$DexAgentHome = Join-Path $env:USERPROFILE ".dex-agent"
git clone https://github.com/dex-agent/dex-agent.git $DexAgentHome
Set-Location $DexAgentHome
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
WORKSPACE_ROOT=%USERPROFILE%/.dex-agent
CODEX_WORKDIR=%USERPROFILE%/.dex-agent
CODEX_BACKEND=sdk
FINAL_ACTIONS_AUTO_OFFER=false
```

Depois:

```powershell
npm run start
```

## Migrar Configs De Outra Instalacao

Na instalacao antiga, gere um pacote sem segredos:

```powershell
npm run config:export -- -OutputPath "$env:USERPROFILE\Desktop\dex-agent-config.zip"
```

Se voce quer migrar tambem `.env`, tokens e IDs locais, faca isso de forma explicita:

```powershell
npm run config:export -- -IncludeSecrets -OutputPath "$env:USERPROFILE\Desktop\dex-agent-config.full.zip"
```

Na instalacao nova em `$env:USERPROFILE\.dex-agent`, importe:

```powershell
npm run config:import -- -ArchivePath "$env:USERPROFILE\Desktop\dex-agent-config.zip" -Force
```

Para importar `.env`, use tambem `-IncludeSecrets`:

```powershell
npm run config:import -- -ArchivePath "$env:USERPROFILE\Desktop\dex-agent-config.full.zip" -IncludeSecrets -Force
```

O pacote cobre `config/*.local.json`, `.agents/*.local.json`, contatos,
prompts locais, `DEX_PAI`/`DEX_REDE`, `skills/dex-agent/instance.json` e `.env`
somente quando autorizado. Nao versionar o ZIP exportado.

## Criar Um Dex Filho

Rode o script pelo repo pai. O comando abaixo nao recebe token em argumento; o script pede `BOT_TOKEN` via `Read-Host -AsSecureString`.

```powershell
$DexAgentHome = Join-Path $env:USERPROFILE ".dex-agent"
powershell -ExecutionPolicy Bypass -File (Join-Path $DexAgentHome "scripts\provision-dex-agent-project-instance.ps1") `
  -ProjectRoot (Join-Path $env:USERPROFILE "Projetos\ProjetoDeltaExemplo") `
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
powershell -ExecutionPolicy Bypass -File (Join-Path $env:USERPROFILE "Projetos\ProjetoDeltaExemplo\skills\dex-agent\scripts\status-dex-agent.ps1")
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
