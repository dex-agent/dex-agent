param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot,

  [string]$InstanceId = "",
  [string]$ProjectLabel = "",
  [string]$BotToken = "",
  [string]$BotTokenPath = "",
  [string]$BotUsername = "",
  [string]$Aliases = "",
  [string]$EnvTemplatePath = "",
  [string]$AllowedUserIds = "",
  [string]$ProactiveUserIds = "",
  [switch]$Start,
  [switch]$RunTelegramTest,
  [string]$TelegramTestPrompt = "",
  [string]$SharedBrowserScript = ""
)

$ErrorActionPreference = "Stop"

function ConvertTo-Slug {
  param([string]$Value)

  $slug = $Value -replace '([a-z0-9])([A-Z])', '$1-$2'
  $slug = $slug.ToLowerInvariant() -replace '[^a-z0-9]+', '-'
  return $slug.Trim('-')
}

function Import-DotEnv {
  param([string]$Path)

  $map = [ordered]@{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*#' -or $line -match '^\s*$') { continue }
    $match = [regex]::Match($line, '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$')
    if (-not $match.Success) { continue }
    $name = $match.Groups[1].Value
    $value = $match.Groups[2].Value.Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $map[$name] = $value
  }
  return $map
}

function Set-OrAppendEnvValue {
  param(
    [string]$Content,
    [string]$Name,
    [string]$Value
  )

  $line = "$Name=$Value"
  if ($Content -match "(?m)^$([regex]::Escape($Name))\s*=") {
    return [regex]::Replace($Content, "(?m)^$([regex]::Escape($Name))\s*=.*$", $line)
  }
  if ([string]::IsNullOrWhiteSpace($Content)) { return "$line`r`n" }
  return $Content.TrimEnd() + "`r`n$line`r`n"
}

function Write-InstanceEnv {
  param(
    [string]$TargetPath,
    [string]$TemplatePath,
    [string]$Token,
    [string]$ProjectRootValue,
    [string]$InstanceIdValue,
    [string]$ProjectLabelValue,
    [string]$AllowedUserIdsValue,
    [string]$ProactiveUserIdsValue
  )

  $content = ""
  if ($TemplatePath -and (Test-Path -LiteralPath $TemplatePath)) {
    $content = Get-Content -LiteralPath $TemplatePath -Raw
  }

  $content = Set-OrAppendEnvValue -Content $content -Name "BOT_TOKEN" -Value $Token
  $content = Set-OrAppendEnvValue -Content $content -Name "DEX_INSTANCE_ID" -Value $InstanceIdValue
  $content = Set-OrAppendEnvValue -Content $content -Name "DEX_INSTANCE_PROJECT_LABEL" -Value $ProjectLabelValue
  $content = Set-OrAppendEnvValue -Content $content -Name "CODEX_WORKDIR" -Value ($ProjectRootValue -replace '\\', '/')
  $content = Set-OrAppendEnvValue -Content $content -Name "WORKSPACE_ROOT" -Value ($ProjectRootValue -replace '\\', '/')
  $content = Set-OrAppendEnvValue -Content $content -Name "CODEX_FINALIZE_HOOK_TIMEOUT_MS" -Value "120000"
  $content = Set-OrAppendEnvValue -Content $content -Name "FINAL_ACTIONS_AUTO_OFFER" -Value "false"

  if (-not [string]::IsNullOrWhiteSpace($AllowedUserIdsValue)) {
    $content = Set-OrAppendEnvValue -Content $content -Name "ALLOWED_USER_IDS" -Value $AllowedUserIdsValue
  }
  if (-not [string]::IsNullOrWhiteSpace($ProactiveUserIdsValue)) {
    $content = Set-OrAppendEnvValue -Content $content -Name "PROACTIVE_USER_IDS" -Value $ProactiveUserIdsValue
  }

  $parent = Split-Path -Parent $TargetPath
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  Set-Content -LiteralPath $TargetPath -Value $content -Encoding UTF8
}

function Get-BotToken {
  if (-not [string]::IsNullOrWhiteSpace($BotToken)) { return $BotToken.Trim() }
  if (-not [string]::IsNullOrWhiteSpace($BotTokenPath)) {
    if (-not (Test-Path -LiteralPath $BotTokenPath)) { throw "BotTokenPath nao encontrado: $BotTokenPath" }
    return (Get-Content -LiteralPath $BotTokenPath -Raw).Trim()
  }
  $secure = Read-Host -Prompt "BOT_TOKEN" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Invoke-TelegramGetMe {
  param([string]$Token)

  return Invoke-RestMethod -Uri ("https://api.telegram.org/bot" + $Token + "/getMe") -Method Get -TimeoutSec 25
}

function Write-DexParentAliasCard {
  param(
    [string]$ProjectRootValue,
    [string]$ProjectLabelValue
  )

  $agentsDir = Join-Path $ProjectRootValue ".agents"
  New-Item -ItemType Directory -Force -Path $agentsDir | Out-Null
  $cardPath = Join-Path $agentsDir "DEX_PAI.md"
  $parentHelper = Join-Path $sourceRoot "scripts\send-dex-parent-message.ps1"
  $exampleArtifact = Join-Path $ProjectRootValue ".agents\NOME_DO_ARTEFATO.md"

  $content = @"
# Dex Pai

Alias operacional: ``dex-pai``

## Identidade

- Bot Telegram: definido por ``TELEGRAM_EXPECTED_USERNAME`` no ``.env`` do repo pai
- Repo pai: ``$sourceRoot``
- Skill no repo pai: ``$sourceRoot\skills\dex-pai\SKILL.md``
- Skill global opcional: `` `$env:CODEX_HOME\skills\dex-pai\SKILL.md`` ou `` `$env:USERPROFILE\.codex\skills\dex-pai\SKILL.md``
- Helper de envio: ``$parentHelper``
- Chat liberado: usar o ``PROACTIVE_USER_IDS`` ou ``ALLOWED_USER_IDS`` do ``.env`` do repo pai

## Quando usar

Use ``dex-pai`` quando um problema encontrado neste projeto pertencer ao motor, runtime, memoria, Telegram UX, instalacao, botoes, recall, contexto ou comportamento geral do Dex Agent.

Nao use ``dex-pai`` para reabrir trabalho de produto deste projeto sem prova de que o problema e local.

Frase curta para operar: ``use dex-pai: crie artefato local e envie o resumo ao pai``.

## Protocolo

1. Criar artefato local em ``.agents/`` com sintoma, evidencia, esperado vs obtido, reproducao, hipoteses e criterio de correcao.
2. Enviar resumo para ``dex-pai`` com o caminho do artefato.
3. Marcar localmente que o achado foi encaminhado ao pai.

## Comando

~~~powershell
powershell -ExecutionPolicy Bypass -File $parentHelper ``
  -SourceProject "$ProjectLabelValue" ``
  -ArtifactPath "$exampleArtifact" ``
  -Title "Achado encaminhado ao dex-pai" ``
  -Text "Resumo curto do sintoma, esperado, obtido e proximo teste de fechamento."
~~~
"@

  Set-Content -LiteralPath $cardPath -Value $content -Encoding UTF8
}

function Write-DexNetworkAliasCard {
  param(
    [string]$ProjectRootValue,
    [string]$ProjectLabelValue
  )

  $agentsDir = Join-Path $ProjectRootValue ".agents"
  New-Item -ItemType Directory -Force -Path $agentsDir | Out-Null
  $cardPath = Join-Path $agentsDir "DEX_REDE.md"
  $networkHelper = Join-Path $sourceRoot "scripts\send-dex-child-message.ps1"
  $exampleArtifact = Join-Path $ProjectRootValue ".agents\HANDOFF_PARA_OUTRO_DEX.md"

  $content = @"
# Dex Rede

Alias operacional: ``dex-rede``

## Identidade

- Objetivo: enviar mensagem administrativa deste projeto para outro projeto Dex Agent por alias.
- Repo pai: ``$sourceRoot``
- Skill no repo pai: ``$sourceRoot\skills\dex-rede\SKILL.md``
- Helper de envio: ``$networkHelper``
- Registro local padrao: ``$sourceRoot\config\dex-agent-network.local.json``
- Registro exemplo versionavel: ``$sourceRoot\config\dex-agent-network.example.json``

## Quando usar

Use ``dex-rede`` para handoff entre projetos, por exemplo:

- ``ProjetoGammaExemplo`` -> ``ProjetoBetaExemplo`` quando um conteudo do vault precisar virar trabalho em outro projeto.
- ``ProjetoBetaExemplo`` -> ``ProjetoGammaExemplo`` quando uma nota precisar voltar ao vault.
- ``ProjetoAlphaExemplo`` -> ``ProjetoBetaExemplo`` quando houver assunto operacional externo ao projeto de agenda.

Se o problema pertencer ao motor, memoria, runtime ou instalacao do Dex Agent, use ``dex-pai`` em vez de ``dex-rede``.

## Limite Telegram

Telegram nao permite bot conversar com bot como usuario. Este fluxo usa o token do bot destino, validado por ``getMe``, para postar no chat liberado daquele destino. A evidencia de sucesso e ``message_id``.

## Comando

~~~powershell
powershell -ExecutionPolicy Bypass -File $networkHelper ``
  -To "projeto-beta" ``
  -SourceProject "$ProjectLabelValue" ``
  -ArtifactPath "$exampleArtifact" ``
  -Title "Handoff $ProjectLabelValue -> ProjetoBetaExemplo" ``
  -Text "Resumo curto, objetivo, proximo passo esperado e criterio de pronto."
~~~

## Frase curta

``use dex-rede: crie ou referencie artefato local e envie para alpha/beta com message_id``
"@

  Set-Content -LiteralPath $cardPath -Value $content -Encoding UTF8
}

function Get-DexAliasList {
  param(
    [string]$ProjectLabelValue,
    [string]$BotUsernameValue,
    [string]$AliasesValue
  )

  $items = @()
  if (-not [string]::IsNullOrWhiteSpace($AliasesValue)) {
    $items += @($AliasesValue -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  }
  if (-not [string]::IsNullOrWhiteSpace($ProjectLabelValue)) { $items += $ProjectLabelValue }
  if (-not [string]::IsNullOrWhiteSpace($BotUsernameValue)) { $items += $BotUsernameValue.TrimStart("@") }

  $seen = @{}
  $result = @()
  foreach ($item in $items) {
    $key = $item.ToLowerInvariant()
    if ($seen.ContainsKey($key)) { continue }
    $seen[$key] = $true
    $result += $item
  }
  return $result
}

function Set-ManagedMarkdownBlock {
  param(
    [string]$Path,
    [string]$DefaultTitle,
    [string]$BlockName,
    [string]$BlockContent
  )

  $start = "<!-- $BlockName START -->"
  $end = "<!-- $BlockName END -->"
  $block = "$start`r`n$BlockContent`r`n$end"

  $content = ""
  if (Test-Path -LiteralPath $Path) {
    $content = Get-Content -LiteralPath $Path -Raw
  } else {
    $content = "# $DefaultTitle`r`n"
  }

  $pattern = "(?s)<!-- $([regex]::Escape($BlockName)) START -->.*?<!-- $([regex]::Escape($BlockName)) END -->"
  if ($content -match $pattern) {
    $content = [regex]::Replace($content, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $block })
  } else {
    $content = $content.TrimEnd() + "`r`n`r`n$block`r`n"
  }

  Set-Content -LiteralPath $Path -Value $content -Encoding UTF8
}

function Add-GitIgnoreEntry {
  param(
    [string]$ProjectRootValue,
    [string]$Entry
  )

  $path = Join-Path $ProjectRootValue ".gitignore"
  $content = ""
  if (Test-Path -LiteralPath $path) { $content = Get-Content -LiteralPath $path -Raw }
  $escaped = [regex]::Escape($Entry.Trim())
  if ($content -match "(?m)^\s*$escaped\s*$") { return }
  $next = $content.TrimEnd() + "`r`n$Entry`r`n"
  Set-Content -LiteralPath $path -Value $next -Encoding UTF8
}

function Write-ProjectBootstrapFiles {
  param(
    [string]$ProjectRootValue,
    [string]$ProjectLabelValue,
    [string]$InstanceIdValue,
    [string]$BotUsernameValue
  )

  $agentsPath = Join-Path $ProjectRootValue "AGENTS.md"
  $indexPath = Join-Path $ProjectRootValue "INDEX.md"
  $installRoot = Join-Path $ProjectRootValue "skills\dex-agent"

  $agentsBlock = @"
## Dex Agent Local

- Projeto: ``$ProjectLabelValue``
- Instancia: ``$InstanceIdValue``
- Bot Telegram: ``@$BotUsernameValue``
- Instalacao local: ``skills/dex-agent``
- Workdir fixo: ``$ProjectRootValue``
- Use ``skills/dex-agent/SKILL.md`` para operar esta instancia.
- Use ``skills/dex-agent/skills/dex-install/SKILL.md`` apenas como referencia de instalacao; novas sincronizacoes usam ``dex-update`` no repo pai.
- Use ``skills/dex-agent/skills/dex-memoria/SKILL.md`` para memoria operacional, ledger, achados resolvidos e parada de lembranca.
- Quando o usuario pedir para memorizar algo, use sempre o contrato completo de ``dex-memoria`` antes de gravar ou orientar lembranca; memoria operacional nao e anotacao solta.
- Use ``skills/dex-agent/skills/dex-acesso/SKILL.md`` para IDs permitidos, destino proativo/admin e garantia de audio/print no chat solicitante.
- Use ``skills/dex-agent/skills/dex-contatos/SKILL.md`` para tom por pessoa/chat_id; dados reais ficam em ``.agents/CONTACTS.local.json`` e nao entram no Git.
- Use ``skills/dex-agent/skills/dex-print/SKILL.md`` para enviar prints/imagens pelo Bot API com ``message_id``.
- Use ``skills/dex-agent/skills/dex-agent-audio-summary/SKILL.md`` (``dex-audio``) para enviar voice notes pelo Bot API com ``message_id``.
- Use ``.agents/DEX_PAI.md`` para achado do motor/runtime/memoria/Telegram UX/instalacao do Dex Agent.
- Use ``.agents/DEX_REDE.md`` para handoff entre projetos filhos.
- ``ALLOWED_USER_IDS`` e lista de acesso; ``PROACTIVE_USER_IDS`` e destino admin/proativo. Em pedido iniciado no Telegram, o chat solicitante vence para audio/print.
- ``dex-contatos`` ajusta apenas tom, nivel de detalhe e preferencias de resposta; nao concede acesso, nao muda destino de midia e nao vira memoria operacional.
- ``HANDOFF.md`` vence ``MEMORY.ndjson`` para proximo passo vivo quando essas superficies existirem.
- Memoria resolvida ou arquivada nao reabre trabalho sozinha.
- ``dex-memoria`` V1 e manual/documental; nao ha hooks nem scripts automaticos de memoria.
- ``FINAL_ACTIONS_AUTO_OFFER=false`` e o padrao: o painel final de acoes dinamicas nao aparece automaticamente. Ative explicitamente em ``skills/dex-agent/.env`` se este projeto quiser botoes finais por contrato visivel.
- Reboot/start/update: processos de bot, helpers, dev server, checks, TTS e execucoes auxiliares devem abrir escondidos no Windows; janela visivel de ``cmd.exe`` ou PowerShell nao e efeito normal.
- Nao expor token do bot. Segredos ficam somente em ``skills/dex-agent/.env``.
- O diretorio ``skills/dex-agent/`` deve permanecer ignorado pelo Git do produto.
"@

  $indexBlock = @"
## Dex Agent

- Projeto: ``$ProjectLabelValue``
- Instancia: ``$InstanceIdValue``
- Bot: ``@$BotUsernameValue``
- Instalacao: ``$installRoot``
- Status: ``powershell -ExecutionPolicy Bypass -File $installRoot\scripts\status-dex-agent.ps1``
- Start: ``powershell -ExecutionPolicy Bypass -File $installRoot\scripts\start-dex-agent.ps1``
- Stop: ``powershell -ExecutionPolicy Bypass -File $installRoot\scripts\stop-dex-agent.ps1``
- Contratos: ``.agents/DEX_PAI.md``, ``.agents/DEX_REDE.md``, ``skills/dex-agent/skills/dex-memoria/SKILL.md``, ``skills/dex-agent/skills/dex-acesso/SKILL.md`` e ``skills/dex-agent/skills/dex-contatos/SKILL.md``
- Memorizar: pedidos de memoria devem usar ``dex-memoria`` e seu ciclo de vida completo antes de registrar, resolver ou parar de lembrar.
- Acoes finais automaticas: desligadas por padrao com ``FINAL_ACTIONS_AUTO_OFFER=false``; ativar somente por contrato explicito no ``.env`` da instancia.
- Processos: start/restart/reboot devem usar janela escondida no Windows; se aparecer ``cmd.exe`` visivel, revisar launcher/runner antes de considerar normal.
- Midia: ``skills/dex-agent/skills/dex-print/SKILL.md`` e ``skills/dex-agent/skills/dex-agent-audio-summary/SKILL.md``
"@

  Set-ManagedMarkdownBlock -Path $agentsPath -DefaultTitle "Repository Guidelines" -BlockName "DEX_AGENT_BOOTSTRAP" -BlockContent $agentsBlock
  Set-ManagedMarkdownBlock -Path $indexPath -DefaultTitle "$ProjectLabelValue Index" -BlockName "DEX_AGENT_INDEX" -BlockContent $indexBlock
  Add-GitIgnoreEntry -ProjectRootValue $ProjectRootValue -Entry "skills/dex-agent/"
  Add-GitIgnoreEntry -ProjectRootValue $ProjectRootValue -Entry ".agents/CONTACTS.local.json"
}

function Update-DexNetworkRegistry {
  param(
    [string]$ProjectLabelValue,
    [string]$BotUsernameValue,
    [string]$EnvPathValue,
    [string[]]$AliasesValue
  )

  $registryPath = Join-Path $sourceRoot "config\dex-agent-network.local.json"
  if (Test-Path -LiteralPath $registryPath) {
    $registry = Get-Content -LiteralPath $registryPath -Raw | ConvertFrom-Json
    $description = $registry.description
    $chatPriority = @($registry.chatIdEnvPriority)
    $instances = @($registry.instances)
  } else {
    $description = "Local Dex Agent network registry. This file is ignored by git because it contains machine-specific paths."
    $chatPriority = @("PROACTIVE_USER_IDS", "ALLOWED_USER_IDS")
    $instances = @()
  }

  $updated = @()
  foreach ($instance in $instances) {
    if ($instance.projectLabel -eq $ProjectLabelValue -or $instance.botUsername -eq $BotUsernameValue) { continue }
    $updated += $instance
  }

  $updated += [ordered]@{
    projectLabel = $ProjectLabelValue
    botUsername = $BotUsernameValue
    envPath = $EnvPathValue
    aliases = @($AliasesValue)
  }

  $next = [ordered]@{
    description = $description
    chatIdEnvPriority = $chatPriority
    instances = @($updated)
  }
  Set-Content -LiteralPath $registryPath -Value ($next | ConvertTo-Json -Depth 8) -Encoding UTF8
}

function Invoke-TelegramWebTest {
  param(
    [string]$BotUser,
    [string]$PromptText,
    [string]$TestId
  )

  if ([string]::IsNullOrWhiteSpace($BotUser)) {
    throw "BotUsername e obrigatorio para RunTelegramTest."
  }

  if ([string]::IsNullOrWhiteSpace($SharedBrowserScript)) {
    $script:SharedBrowserScript = Join-Path $env:USERPROFILE ".codex\skills\shared-browser-profile\scripts\open-shared-browser.ps1"
  }
  if (-not (Test-Path -LiteralPath $SharedBrowserScript)) {
    throw "Shared browser script nao encontrado: $SharedBrowserScript"
  }

  & powershell -ExecutionPolicy Bypass -File $SharedBrowserScript -Action status -Browser chrome | Out-Null

  $botUserJson = ($BotUser | ConvertTo-Json -Compress)
  $promptJson = ($PromptText | ConvertTo-Json -Compress)
  $testIdJson = ($TestId | ConvertTo-Json -Compress)
  $evidenceDir = Join-Path $sourceRoot ".agents\INBOX"
  New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null
  $screenshotPath = (Join-Path $evidenceDir "telegram-$TestId-provision-monitor.png") -replace '\\', '/'
  $screenshotJson = ($screenshotPath | ConvertTo-Json -Compress)

  $nodeScript = @"
const { chromium } = await import('playwright');
const testId = $testIdJson;
const botUser = $botUserJson.replace(/^@/, '');
const prompt = $promptJson;
const screenshot = $screenshotJson;
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
let page = context.pages().find((p) => p.url().includes('web.telegram.org')) ?? await context.newPage();
await page.bringToFront();
await page.goto('https://web.telegram.org/k/#@' + botUser, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);
const input = page.locator('.input-message-input[contenteditable="true"]').first();
await input.click({ timeout: 15000 });
await page.keyboard.insertText(prompt);
await page.keyboard.press('Enter');
let status = 'waiting';
let evidence = '';
for (let i = 0; i < 36; i += 1) {
  await page.waitForTimeout(10000);
  const text = await page.locator('body').innerText({ timeout: 10000 });
  const start = text.lastIndexOf(testId);
  const afterPrompt = start >= 0 ? text.slice(start) : text;
  const ackIndex = afterPrompt.lastIndexOf('Pedido enviado ao Codex');
  const afterAck = ackIndex >= 0 ? afterPrompt.slice(ackIndex) : afterPrompt;
  evidence = afterAck.slice(0, 6500);
  const verdict = afterAck.match(/VEREDITO:\s*(OK|INCOMPLETO|ERRO)/i)?.[1] ?? afterAck.match(/\*\*(OK|INCOMPLETO|ERRO)\b/i)?.[1] ?? null;
  const hasResponse = afterAck.includes(testId) && (afterAck.includes('Instancia') || afterAck.includes('operacional'));
  if (verdict || hasResponse) {
    status = 'complete';
    break;
  }
}
await page.screenshot({ path: screenshot, fullPage: false });
console.log(JSON.stringify({ status, testId, screenshot, evidence }));
await browser.close();
"@

  return $nodeScript | node --input-type=module -
}

$sourceRoot = Split-Path -Parent $PSScriptRoot
$installScript = Join-Path $PSScriptRoot "install-dex-agent-skill.ps1"
if (-not (Test-Path -LiteralPath $installScript)) { throw "Instalador base nao encontrado: $installScript" }
if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) { throw "ProjectRoot nao encontrado: $ProjectRoot" }

$resolvedProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\')
if ([string]::IsNullOrWhiteSpace($ProjectLabel)) {
  $ProjectLabel = Split-Path -Leaf $resolvedProjectRoot
}
if ([string]::IsNullOrWhiteSpace($InstanceId)) {
  $InstanceId = ConvertTo-Slug $ProjectLabel
}
if ([string]::IsNullOrWhiteSpace($EnvTemplatePath)) {
  $defaultTemplate = Join-Path $sourceRoot ".env"
  if (Test-Path -LiteralPath $defaultTemplate) { $EnvTemplatePath = $defaultTemplate }
}

$templateValues = Import-DotEnv -Path $EnvTemplatePath
if ([string]::IsNullOrWhiteSpace($AllowedUserIds) -and $templateValues.Contains("ALLOWED_USER_IDS")) {
  $AllowedUserIds = $templateValues["ALLOWED_USER_IDS"]
}
if ([string]::IsNullOrWhiteSpace($ProactiveUserIds) -and $templateValues.Contains("PROACTIVE_USER_IDS")) {
  $ProactiveUserIds = $templateValues["PROACTIVE_USER_IDS"]
}
if ([string]::IsNullOrWhiteSpace($AllowedUserIds)) {
  throw "Informe -AllowedUserIds ou use um -EnvTemplatePath que ja contenha ALLOWED_USER_IDS."
}

$token = Get-BotToken
$me = Invoke-TelegramGetMe -Token $token
if (-not $me.ok) { throw "Telegram getMe falhou para o token informado." }
if (-not [string]::IsNullOrWhiteSpace($BotUsername)) {
  $expected = $BotUsername.TrimStart('@')
  if ($me.result.username -ne $expected) {
    throw "Token informado pertence a @$($me.result.username), mas esperado era @$expected."
  }
}

& powershell -ExecutionPolicy Bypass -File $installScript `
  -ProjectRoot $resolvedProjectRoot `
  -InstanceId $InstanceId `
  -ProjectLabel $ProjectLabel

Write-DexParentAliasCard -ProjectRootValue $resolvedProjectRoot -ProjectLabelValue $ProjectLabel
Write-DexNetworkAliasCard -ProjectRootValue $resolvedProjectRoot -ProjectLabelValue $ProjectLabel

$installRoot = Join-Path $resolvedProjectRoot "skills\dex-agent"
$targetEnv = Join-Path $installRoot ".env"
Write-InstanceEnv `
  -TargetPath $targetEnv `
  -TemplatePath $EnvTemplatePath `
  -Token $token `
  -ProjectRootValue $resolvedProjectRoot `
  -InstanceIdValue $InstanceId `
  -ProjectLabelValue $ProjectLabel `
  -AllowedUserIdsValue $AllowedUserIds `
  -ProactiveUserIdsValue $ProactiveUserIds

$aliasList = @(Get-DexAliasList -ProjectLabelValue $ProjectLabel -BotUsernameValue $me.result.username -AliasesValue $Aliases)
Write-ProjectBootstrapFiles -ProjectRootValue $resolvedProjectRoot -ProjectLabelValue $ProjectLabel -InstanceIdValue $InstanceId -BotUsernameValue $me.result.username
Update-DexNetworkRegistry -ProjectLabelValue $ProjectLabel -BotUsernameValue $me.result.username -EnvPathValue $targetEnv -AliasesValue $aliasList

$statusScript = Join-Path $installRoot "scripts\status-dex-agent.ps1"
$startScript = Join-Path $installRoot "scripts\start-dex-agent.ps1"

if ($Start) {
  & powershell -ExecutionPolicy Bypass -File $startScript | Out-Host
  Start-Sleep -Seconds 5
}

$status = & powershell -ExecutionPolicy Bypass -File $statusScript
$testId = "DEXPROV-" + (Get-Date -Format "yyyyMMdd-HHmmss")
$telegramResult = $null
if ($RunTelegramTest) {
  if ([string]::IsNullOrWhiteSpace($TelegramTestPrompt)) {
    $TelegramTestPrompt = "TEST_ID: $testId`n`nAudite a retomada padrao do projeto $ProjectLabel agora.`n`nNao execute patch.`n`nResponda primeiro com VEREDITO: OK, INCOMPLETO ou ERRO, e repita o TEST_ID.`n`nDiga instancia, workdir fixo, arquivos de retomada consultados e se a instancia Telegram esta operacional."
  }
  $telegramResult = Invoke-TelegramWebTest -BotUser $me.result.username -PromptText $TelegramTestPrompt -TestId $testId
  $inboxDir = Join-Path $sourceRoot ".agents\INBOX"
  New-Item -ItemType Directory -Force -Path $inboxDir | Out-Null
  Set-Content -LiteralPath (Join-Path $inboxDir "provision-$InstanceId-$testId.json") -Value $telegramResult -Encoding UTF8
}

[PSCustomObject]@{
  Ok = $true
  ProjectRoot = $resolvedProjectRoot
  ProjectLabel = $ProjectLabel
  InstanceId = $InstanceId
  InstallRoot = $installRoot
  BotUsername = $me.result.username
  EnvCreated = (Test-Path -LiteralPath $targetEnv)
  Started = [bool]$Start
  Status = ($status -join "`n")
  TelegramTestId = $(if ($RunTelegramTest) { $testId } else { $null })
  TelegramResult = $telegramResult
} | ConvertTo-Json -Depth 8
