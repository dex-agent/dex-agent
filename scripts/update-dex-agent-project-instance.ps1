param(
  [string]$ProjectRoot = "",
  [string]$InstallRoot = "",
  [string]$Aliases = "",
  [switch]$Restart,
  [switch]$RunTelegramTest,
  [string]$TelegramTestPrompt = "",
  [int]$ChildTimeoutSeconds = 110
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$null = $ChildTimeoutSeconds

function Import-DotEnv {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Arquivo .env nao encontrado: $Path"
  }

  $map = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*$' -or $line -match '^\s*#') { continue }
    $match = [regex]::Match($line, '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$')
    if (-not $match.Success) { continue }
    $name = $match.Groups[1].Value
    $value = $match.Groups[2].Value.Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or $value.StartsWith("'") -and $value.EndsWith("'")) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $map[$name] = $value
  }
  return $map
}

if ([string]::IsNullOrWhiteSpace($ProjectRoot) -and [string]::IsNullOrWhiteSpace($InstallRoot)) {
  throw "Informe -ProjectRoot ou -InstallRoot."
}

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  $InstallRoot = Join-Path $ProjectRoot "skills\dex-agent"
}
$resolvedInstallRoot = [System.IO.Path]::GetFullPath($InstallRoot).TrimEnd("\")
$instancePath = Join-Path $resolvedInstallRoot "instance.json"
if (-not (Test-Path -LiteralPath $instancePath)) {
  throw "instance.json nao encontrado. Use dex-install para nova instalacao: $instancePath"
}

$instance = Get-Content -LiteralPath $instancePath -Raw | ConvertFrom-Json
$resolvedProjectRoot = [System.IO.Path]::GetFullPath($instance.workdir).TrimEnd("\")
if (-not [string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $candidateProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd("\")
  if ($candidateProjectRoot -ne $resolvedProjectRoot) {
    throw "ProjectRoot informado diverge do instance.json. Informado: $candidateProjectRoot | Instance: $resolvedProjectRoot"
  }
}

$envPath = Join-Path $resolvedInstallRoot ".env"
$envValues = Import-DotEnv -Path $envPath
$token = $envValues["BOT_TOKEN"]
if ([string]::IsNullOrWhiteSpace($token)) { throw "BOT_TOKEN vazio em $envPath" }

$allowedUserIds = $envValues["ALLOWED_USER_IDS"]
$proactiveUserIds = $envValues["PROACTIVE_USER_IDS"]
if ([string]::IsNullOrWhiteSpace($allowedUserIds)) { throw "ALLOWED_USER_IDS vazio em $envPath" }

$me = Invoke-RestMethod -Method Get -Uri ("https://api.telegram.org/bot" + $token + "/getMe") -TimeoutSec 25
if (-not $me.ok) { throw "Telegram getMe falhou para a instancia existente." }

$provision = Join-Path $repoRoot "scripts\provision-dex-agent-project-instance.ps1"
if (-not (Test-Path -LiteralPath $provision)) { throw "Provisionador nao encontrado: $provision" }

$tokenPath = Join-Path ([System.IO.Path]::GetTempPath()) ("dex-agent-update-token-" + [guid]::NewGuid().ToString("N") + ".txt")
Set-Content -LiteralPath $tokenPath -Value $token -Encoding ASCII

if ($Restart) {
  $stopScript = Join-Path $resolvedInstallRoot "scripts\stop-dex-agent.ps1"
  if (Test-Path -LiteralPath $stopScript) {
    & $stopScript | Out-Host
    Start-Sleep -Seconds 2
  }
}

$provisionParams = @{
  ProjectRoot = $resolvedProjectRoot
  InstanceId = $instance.instance_id
  ProjectLabel = $instance.project_label
  BotTokenPath = $tokenPath
  BotUsername = $me.result.username
  EnvTemplatePath = $envPath
  AllowedUserIds = $allowedUserIds
}
if (-not [string]::IsNullOrWhiteSpace($proactiveUserIds)) { $provisionParams.ProactiveUserIds = $proactiveUserIds }
if (-not [string]::IsNullOrWhiteSpace($Aliases)) { $provisionParams.Aliases = $Aliases }
if ($RunTelegramTest) { $provisionParams.RunTelegramTest = $true }
if (-not [string]::IsNullOrWhiteSpace($TelegramTestPrompt)) { $provisionParams.TelegramTestPrompt = $TelegramTestPrompt }

try {
  & $provision @provisionParams
  if ($Restart) {
    $startScript = Join-Path $resolvedInstallRoot "scripts\start-dex-agent.ps1"
    if (-not (Test-Path -LiteralPath $startScript)) {
      throw "Start script nao encontrado apos update: $startScript"
    }
    & $startScript | Out-Host
  }
}
finally {
  Remove-Item -LiteralPath $tokenPath -Force -ErrorAction SilentlyContinue
}
