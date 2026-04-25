param(
  [string]$ProjectRoot = "C:\CodexProjetos\AgendadorConsultasOticas",
  [string]$InstanceId = "agendador-consultas-oticas",
  [string]$ProjectLabel = "AgendadorConsultasOticas",
  [string]$InstallRoot = "",
  [string]$SharedRoot = "",
  [switch]$RefreshSharedDependencies
)

$ErrorActionPreference = "Stop"

$sourceRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  $InstallRoot = Join-Path $ProjectRoot "skills\dex-agent"
}
if ([string]::IsNullOrWhiteSpace($SharedRoot)) {
  $SharedRoot = Join-Path $env:USERPROFILE ".codex\skills\dex-agent\shared"
}

function Assert-Directory {
  param([string]$Path, [string]$Label)

  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    throw "$Label nao encontrado: $Path"
  }
}

function Assert-InstallRoot {
  param([string]$Path)

  $resolved = [System.IO.Path]::GetFullPath($Path)
  $expectedSuffix = [System.IO.Path]::Combine("skills", "dex-agent")
  if (-not $resolved.EndsWith($expectedSuffix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "InstallRoot precisa terminar em skills\dex-agent: $resolved"
  }
}

function Invoke-RobocopyChecked {
  param(
    [string]$Source,
    [string]$Destination,
    [string[]]$ExtraArgs = @()
  )

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  $args = @(
    $Source,
    $Destination,
    "/E",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/NC",
    "/NS",
    "/NP"
  ) + $ExtraArgs

  & robocopy @args | Out-Null
  $code = $LASTEXITCODE
  if ($code -ge 8) {
    throw "robocopy falhou de $Source para $Destination com exit code $code"
  }
}

function Write-Utf8File {
  param([string]$Path, [string]$Content)

  $parent = Split-Path -Parent $Path
  if ($parent) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  Set-Content -LiteralPath $Path -Value $Content -Encoding UTF8
}

function New-OrUpdateJunction {
  param([string]$Path, [string]$Target)

  if (Test-Path -LiteralPath $Path) {
    $item = Get-Item -LiteralPath $Path -Force
    if (-not ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
      throw "Nao vou substituir caminho normal por junction: $Path"
    }
    $currentTarget = $item.Target
    if ([string]::IsNullOrWhiteSpace($currentTarget) -and $item.PSObject.Properties.Name -contains "LinkTarget") {
      $currentTarget = $item.LinkTarget
    }
    if ($currentTarget -and
      ([System.IO.Path]::GetFullPath($currentTarget).TrimEnd("\") -ieq [System.IO.Path]::GetFullPath($Target).TrimEnd("\"))) {
      return
    }
    [System.IO.Directory]::Delete($Path)
  }
  New-Item -ItemType Junction -Path $Path -Target $Target | Out-Null
}

function Render-Template {
  param([string]$Template)

  return $Template.
    Replace("__INSTANCE_ID__", $InstanceId).
    Replace("__PROJECT_LABEL__", $ProjectLabel).
    Replace("__PROJECT_ROOT__", $ProjectRoot).
    Replace("__SOURCE_ROOT__", $sourceRoot).
    Replace("__INSTALL_ROOT__", $InstallRoot).
    Replace("__SHARED_ROOT__", $SharedRoot).
    Replace("__STATE_FILE__", (Join-Path $InstallRoot ".runtime\dex-agent-state.json"))
}

function Write-InstanceScripts {
  $scriptsDir = Join-Path $InstallRoot "scripts"
  New-Item -ItemType Directory -Force -Path $scriptsDir | Out-Null

  $startTemplate = @'
$ErrorActionPreference = "Stop"

$instanceRoot = Split-Path -Parent $PSScriptRoot
$instanceId = "__INSTANCE_ID__"
$projectRoot = "__PROJECT_ROOT__"
$projectLabel = "__PROJECT_LABEL__"
$envPath = Join-Path $instanceRoot ".env"
$runtimeDir = Join-Path $instanceRoot ".runtime"
$pidPath = Join-Path $runtimeDir "dex-agent.pid"
$stdoutPath = Join-Path $runtimeDir "dex-agent.stdout.log"
$stderrPath = Join-Path $runtimeDir "dex-agent.stderr.log"
$tsxCliPath = Join-Path $instanceRoot "node_modules\tsx\dist\cli.mjs"
$entrypointPath = Join-Path $instanceRoot "src\index.ts"

function Import-DotEnvFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*$' -or $line -match '^\s*#') { continue }
    $match = [regex]::Match($line, '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$')
    if (-not $match.Success) { continue }
    $name = $match.Groups[1].Value
    $value = $match.Groups[2].Value.Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

function Get-InstanceProcesses {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -in @("node.exe", "cmd.exe", "powershell.exe") -and
      $_.CommandLine -and
      $_.CommandLine -match [Regex]::Escape($instanceRoot) -and
      $_.CommandLine -match "--dex-instance-id=$instanceId"
    } |
    Sort-Object CreationDate -Descending
}

function Resolve-InstanceProcess {
  if (Test-Path -LiteralPath $pidPath) {
    $savedPid = (Get-Content -LiteralPath $pidPath -Raw).Trim()
    if ($savedPid) {
      $savedProcess = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
      if ($savedProcess) { return $savedProcess }
    }
  }

  $processInfo = @(Get-InstanceProcesses | Select-Object -First 1)
  if (-not $processInfo.Count) { return $null }
  return Get-Process -Id $processInfo[0].ProcessId -ErrorAction SilentlyContinue
}

if (-not (Test-Path -LiteralPath $envPath)) { throw "Arquivo .env nao encontrado em $envPath" }
if (-not (Test-Path -LiteralPath $tsxCliPath)) { throw "Nao encontrei o CLI do tsx em $tsxCliPath" }
if (-not (Test-Path -LiteralPath $entrypointPath)) { throw "Entrypoint local nao encontrado em $entrypointPath" }

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
Import-DotEnvFile -Path $envPath

$env:DEX_CONTEXT_MODE = "instance"
$env:DEX_INSTANCE_ID = $instanceId
$env:DEX_INSTANCE_PROJECT_LABEL = $projectLabel
$env:CODEX_WORKDIR = $projectRoot
$env:WORKSPACE_ROOT = $projectRoot
$env:STATE_FILE = Join-Path $runtimeDir "dex-agent-state.json"

if ([string]::IsNullOrWhiteSpace($env:BOT_TOKEN)) { throw "Preencha BOT_TOKEN no arquivo .env antes de iniciar o Dex Agent." }
if ([string]::IsNullOrWhiteSpace($env:ALLOWED_USER_IDS)) { throw "Preencha ALLOWED_USER_IDS no arquivo .env antes de iniciar o Dex Agent." }

$existing = Resolve-InstanceProcess
if ($existing) {
  Set-Content -LiteralPath $pidPath -Value $existing.Id -Encoding ASCII
  Write-Output "Dex Agent do $projectLabel ja esta em execucao. PID: $($existing.Id)"
  Write-Output "Status: $PSScriptRoot\status-dex-agent.ps1"
  exit 0
}

Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw "Nao encontrei o comando 'node' no PATH." }

$process = Start-Process `
  -FilePath $nodeCommand.Source `
  -ArgumentList @($tsxCliPath, $entrypointPath, "--dex-instance-id=$instanceId") `
  -WindowStyle Hidden `
  -WorkingDirectory $instanceRoot `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -PassThru

$resolvedPid = $process.Id
for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
  Start-Sleep -Milliseconds 250
  $matched = Resolve-InstanceProcess
  if ($matched) {
    $resolvedPid = $matched.Id
    break
  }
}

Set-Content -LiteralPath $pidPath -Value $resolvedPid -Encoding ASCII
Write-Output "Dex Agent do $projectLabel iniciado em background."
Write-Output "PID: $resolvedPid"
Write-Output "Status: $PSScriptRoot\status-dex-agent.ps1"
Write-Output "STDOUT: $stdoutPath"
Write-Output "STDERR: $stderrPath"
'@

  $stopTemplate = @'
$ErrorActionPreference = "Stop"

$instanceRoot = Split-Path -Parent $PSScriptRoot
$instanceId = "__INSTANCE_ID__"
$runtimeDir = Join-Path $instanceRoot ".runtime"
$pidPath = Join-Path $runtimeDir "dex-agent.pid"

function Get-InstanceProcesses {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -in @("node.exe", "cmd.exe", "powershell.exe") -and
      $_.CommandLine -and
      $_.CommandLine -match [Regex]::Escape($instanceRoot) -and
      $_.CommandLine -match "--dex-instance-id=$instanceId"
    } |
    Sort-Object CreationDate -Descending
}

$stopped = $false
if (Test-Path -LiteralPath $pidPath) {
  $pidValue = (Get-Content -LiteralPath $pidPath -Raw).Trim()
  if ($pidValue) {
    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($process) {
      Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
      Write-Output "Dex Agent finalizado. PID: $pidValue"
      $stopped = $true
    }
  }
}

foreach ($entry in @(Get-InstanceProcesses)) {
  Stop-Process -Id $entry.ProcessId -Force -ErrorAction SilentlyContinue
  $stopped = $true
}

Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
if (-not $stopped) { Write-Output "Dex Agent nao esta em execucao." }
'@

  $statusTemplate = @'
$ErrorActionPreference = "Stop"

$instanceRoot = Split-Path -Parent $PSScriptRoot
$instanceId = "__INSTANCE_ID__"
$projectRoot = "__PROJECT_ROOT__"
$projectLabel = "__PROJECT_LABEL__"
$runtimeDir = Join-Path $instanceRoot ".runtime"
$pidPath = Join-Path $runtimeDir "dex-agent.pid"
$stdoutPath = Join-Path $runtimeDir "dex-agent.stdout.log"
$stderrPath = Join-Path $runtimeDir "dex-agent.stderr.log"

function Get-InstanceProcesses {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -in @("node.exe", "cmd.exe", "powershell.exe") -and
      $_.CommandLine -and
      $_.CommandLine -match [Regex]::Escape($instanceRoot) -and
      $_.CommandLine -match "--dex-instance-id=$instanceId"
    } |
    Sort-Object CreationDate -Descending
}

$process = $null
if (Test-Path -LiteralPath $pidPath) {
  $pidValue = (Get-Content -LiteralPath $pidPath -Raw).Trim()
  if ($pidValue) { $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue }
}

if (-not $process) {
  $matched = @(Get-InstanceProcesses | Select-Object -First 1)
  if ($matched.Count) {
    $process = Get-Process -Id $matched[0].ProcessId -ErrorAction SilentlyContinue
    if ($process) {
      New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
      Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ASCII
    }
  }
}

Write-Output "Instancia: $instanceId"
Write-Output "Projeto fixo: $projectRoot"
Write-Output "Label: $projectLabel"
Write-Output "Instalacao: $instanceRoot"
Write-Output "Runtime: $runtimeDir"

if (-not $process) {
  Write-Output "Status: parado"
  exit 0
}

Write-Output "Status: em execucao"
Write-Output "PID: $($process.Id)"
Write-Output "Processo: $($process.ProcessName)"
Write-Output "Iniciado em: $($process.StartTime)"
Write-Output "STDOUT: $stdoutPath"
Write-Output "STDERR: $stderrPath"
'@

  $registerTemplate = @'
$ErrorActionPreference = "Stop"

$startupDir = [Environment]::GetFolderPath("Startup")
$target = Join-Path $startupDir "start-dex-agent-__INSTANCE_ID__.cmd"
$startScript = Join-Path $PSScriptRoot "start-dex-agent.ps1"
$content = "@echo off`r`npowershell -NoProfile -ExecutionPolicy Bypass -File `"$startScript`"`r`n"
Set-Content -LiteralPath $target -Value $content -Encoding ASCII
Write-Output "Autostart registrado: $target"
'@

  $unregisterTemplate = @'
$ErrorActionPreference = "Stop"

$startupDir = [Environment]::GetFolderPath("Startup")
$target = Join-Path $startupDir "start-dex-agent-__INSTANCE_ID__.cmd"
if (Test-Path -LiteralPath $target) {
  Remove-Item -LiteralPath $target -Force
  Write-Output "Autostart removido: $target"
} else {
  Write-Output "Autostart nao encontrado: $target"
}
'@

  Write-Utf8File -Path (Join-Path $scriptsDir "start-dex-agent.ps1") -Content (Render-Template $startTemplate)
  Write-Utf8File -Path (Join-Path $scriptsDir "stop-dex-agent.ps1") -Content (Render-Template $stopTemplate)
  Write-Utf8File -Path (Join-Path $scriptsDir "status-dex-agent.ps1") -Content (Render-Template $statusTemplate)
  Write-Utf8File -Path (Join-Path $scriptsDir "register-autostart.ps1") -Content (Render-Template $registerTemplate)
  Write-Utf8File -Path (Join-Path $scriptsDir "unregister-autostart.ps1") -Content (Render-Template $unregisterTemplate)
}

Assert-Directory -Path $sourceRoot -Label "SourceRoot"
Assert-Directory -Path $ProjectRoot -Label "ProjectRoot"
Assert-InstallRoot -Path $InstallRoot

$sourceNodeModules = Join-Path $sourceRoot "node_modules"
if (-not (Test-Path -LiteralPath $sourceNodeModules -PathType Container)) {
  throw "node_modules do repo-fonte nao encontrado. Rode npm install no repo-fonte antes de instalar a skill."
}

$globalSkillRoot = Split-Path -Parent $SharedRoot
$sharedNodeModules = Join-Path $SharedRoot "node_modules"
New-Item -ItemType Directory -Force -Path $globalSkillRoot | Out-Null
New-Item -ItemType Directory -Force -Path $SharedRoot | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $globalSkillRoot "SKILL.md"))) {
  Write-Utf8File -Path (Join-Path $globalSkillRoot "SKILL.md") -Content @"
---
name: dex-agent
description: Skill global de suporte compartilhado para instalacoes Dex Agent por projeto. A execucao operacional deve acontecer na copia instalada em cada projeto.
---

# Dex Agent Global

Esta pasta guarda recursos compartilhados de instalacoes Dex Agent por projeto.

- Source/dev repo: `C:\CodexProjetos\dex-agent`
- Shared runtime assets: `shared/`
- Instalacoes operacionais: `<projeto>\skills\dex-agent`

Nao coloque tokens, `.env`, `.runtime` ou estado de projeto nesta pasta.
"@
}

if ($RefreshSharedDependencies -or -not (Test-Path -LiteralPath $sharedNodeModules -PathType Container)) {
  Invoke-RobocopyChecked -Source $sourceNodeModules -Destination $sharedNodeModules
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null

$managedDirectories = @("src", "docs", "skills", "tests", "scripts")
foreach ($dir in $managedDirectories) {
  $target = Join-Path $InstallRoot $dir
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
}

foreach ($dir in $managedDirectories) {
  $source = Join-Path $sourceRoot $dir
  if (Test-Path -LiteralPath $source -PathType Container) {
    Invoke-RobocopyChecked -Source $source -Destination (Join-Path $InstallRoot $dir)
  }
}

$managedFiles = @(
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "eslint.config.ts",
  "eslint.config.js",
  "ecosystem.config.ts",
  "ecosystem.config.cjs",
  "README.md",
  "AGENTS.md",
  ".prettierignore"
)

foreach ($file in $managedFiles) {
  $source = Join-Path $sourceRoot $file
  if (Test-Path -LiteralPath $source -PathType Leaf) {
    Copy-Item -LiteralPath $source -Destination (Join-Path $InstallRoot $file) -Force
  }
}

New-OrUpdateJunction -Path (Join-Path $InstallRoot "node_modules") -Target $sharedNodeModules

$instance = [ordered]@{
  instance_id = $InstanceId
  context_mode = "instance"
  project_label = $ProjectLabel
  source_root = $sourceRoot
  install_root = $InstallRoot
  shared_root = $SharedRoot
  workdir = $ProjectRoot
  runtime_dir = (Join-Path $InstallRoot ".runtime")
  state_file = (Join-Path $InstallRoot ".runtime\dex-agent-state.json")
  telegram = [ordered]@{
    bot = "project-exclusive"
    channel = "project-local"
  }
}
Write-Utf8File -Path (Join-Path $InstallRoot "instance.json") -Content ($instance | ConvertTo-Json -Depth 8)

Write-Utf8File -Path (Join-Path $InstallRoot ".gitignore") -Content @"
.env
.runtime/
*.log
*.err
node_modules
"@

Write-Utf8File -Path (Join-Path $InstallRoot "SKILL.md") -Content (Render-Template @'
---
name: dex-agent
description: Instancia operacional do Dex Agent fixa no projeto __PROJECT_LABEL__.
---

# dex-agent

Use esta skill para operar o Dex Agent deste projeto pelo Telegram.

## Contrato

- Esta instalacao pertence ao projeto __PROJECT_LABEL__.
- O source/dev repo fica em __SOURCE_ROOT__.
- Esta pasta e uma instalacao operacional autonoma.
- O contexto e fixo em __PROJECT_ROOT__.
- /repo, callbacks de troca e linguagem natural de troca de projeto ficam bloqueados em instance.
- Segredos ficam apenas em .env, fora do git.
- Runtime local fica em .runtime/, fora do git.
- Dependencias compartilhadas ficam em __SHARED_ROOT__.

## Comandos

- Start: .\scripts\start-dex-agent.ps1
- Stop: .\scripts\stop-dex-agent.ps1
- Status: .\scripts\status-dex-agent.ps1
- Registrar autostart: .\scripts\register-autostart.ps1
- Remover autostart: .\scripts\unregister-autostart.ps1
'@)

Write-Utf8File -Path (Join-Path $InstallRoot "README.md") -Content (Render-Template @'
# Dex Agent - __PROJECT_LABEL__

Instalacao operacional autonoma do Dex Agent para __PROJECT_LABEL__.

## Invariantes

- DEX_CONTEXT_MODE=instance
- DEX_INSTANCE_ID=__INSTANCE_ID__
- DEX_INSTANCE_PROJECT_LABEL=__PROJECT_LABEL__
- CODEX_WORKDIR=__PROJECT_ROOT__
- WORKSPACE_ROOT=__PROJECT_ROOT__
- STATE_FILE=__STATE_FILE__

## Operacao

Status: .\scripts\status-dex-agent.ps1
Start: .\scripts\start-dex-agent.ps1
Stop: .\scripts\stop-dex-agent.ps1
Registrar autostart: .\scripts\register-autostart.ps1
Remover autostart: .\scripts\unregister-autostart.ps1

## Seguranca

Nao versionar .env, .runtime/, logs ou tokens.
'@)

Write-InstanceScripts

Write-Output "Dex Agent instalado em: $InstallRoot"
Write-Output "Shared root: $SharedRoot"
Write-Output "Instance id: $InstanceId"
Write-Output "Project root: $ProjectRoot"
