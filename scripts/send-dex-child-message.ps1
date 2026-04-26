param(
  [Parameter(Mandatory = $true)]
  [string]$To,

  [string]$Text = "",
  [string]$TextPath = "",
  [string]$Title = "",
  [string]$SourceProject = "",
  [string]$ArtifactPath = "",
  [string]$ChatId = "",
  [string]$RegistryPath = "",
  [string]$TargetEnvPath = "",
  [string]$ExpectedUsername = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

function Import-DotEnv {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Arquivo .env do destino nao encontrado: $Path"
  }

  $map = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*$' -or $line -match '^\s*#') { continue }
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

function Resolve-RegistryPath {
  if (-not [string]::IsNullOrWhiteSpace($RegistryPath)) { return $RegistryPath }
  if (-not [string]::IsNullOrWhiteSpace($env:DEX_AGENT_NETWORK_REGISTRY)) { return $env:DEX_AGENT_NETWORK_REGISTRY }

  $local = Join-Path $repoRoot "config\dex-agent-network.local.json"
  if (Test-Path -LiteralPath $local) { return $local }

  return (Join-Path $repoRoot "config\dex-agent-network.example.json")
}

function Read-Registry {
  $path = Resolve-RegistryPath
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Registro dex-rede nao encontrado: $path"
  }
  return [PSCustomObject]@{
    Path = $path
    Data = (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json)
  }
}

function Get-MessageText {
  if (-not [string]::IsNullOrWhiteSpace($TextPath)) {
    if (-not (Test-Path -LiteralPath $TextPath)) {
      throw "TextPath nao encontrado: $TextPath"
    }
    return (Get-Content -LiteralPath $TextPath -Raw).Trim()
  }

  if (-not [string]::IsNullOrWhiteSpace($Text)) {
    return $Text.Trim()
  }

  throw "Informe -Text ou -TextPath."
}

function Normalize-Alias {
  param([string]$Value)

  return $Value.Trim().TrimStart("@").ToLowerInvariant()
}

function Resolve-Target {
  param($Registry)

  if (-not [string]::IsNullOrWhiteSpace($TargetEnvPath)) {
    return [PSCustomObject]@{
      ProjectLabel = $To
      BotUsername = $ExpectedUsername
      EnvPath = $TargetEnvPath
      Match = "TargetEnvPath"
    }
  }

  $target = Normalize-Alias $To
  foreach ($instance in @($Registry.Data.instances)) {
    $candidates = @()
    if ($instance.projectLabel) { $candidates += $instance.projectLabel }
    if ($instance.botUsername) { $candidates += $instance.botUsername }
    if ($instance.aliases) { $candidates += @($instance.aliases) }

    foreach ($candidate in $candidates) {
      if ((Normalize-Alias $candidate) -eq $target) {
        return [PSCustomObject]@{
          ProjectLabel = $instance.projectLabel
          BotUsername = $instance.botUsername
          EnvPath = $instance.envPath
          Match = $candidate
        }
      }
    }
  }

  $known = @($Registry.Data.instances | ForEach-Object { $_.projectLabel }) -join ", "
  throw "Destino '$To' nao encontrado em $($Registry.Path). Destinos conhecidos: $known"
}

function Select-ChatId {
  param([hashtable]$Env, $RegistryData)

  if (-not [string]::IsNullOrWhiteSpace($ChatId)) { return $ChatId.Trim() }

  $priority = @("PROACTIVE_USER_IDS", "ALLOWED_USER_IDS")
  if ($RegistryData.chatIdEnvPriority) { $priority = @($RegistryData.chatIdEnvPriority) }

  foreach ($name in $priority) {
    if (-not $Env.ContainsKey($name)) { continue }
    $candidate = ($Env[$name] -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -First 1)
    if ($candidate) { return $candidate }
  }

  throw "Nao encontrei ChatId. Informe -ChatId ou configure PROACTIVE_USER_IDS/ALLOWED_USER_IDS no .env do destino."
}

$registry = Read-Registry
$target = Resolve-Target -Registry $registry
$resolvedEnvPath = [Environment]::ExpandEnvironmentVariables($target.EnvPath)
$targetEnv = Import-DotEnv -Path $resolvedEnvPath
$token = $targetEnv["BOT_TOKEN"]
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "BOT_TOKEN vazio no .env do destino: $resolvedEnvPath"
}

$targetChatId = Select-ChatId -Env $targetEnv -RegistryData $registry.Data
$bodyText = Get-MessageText
$parts = @()
if (-not [string]::IsNullOrWhiteSpace($Title)) { $parts += $Title.Trim() }
if (-not [string]::IsNullOrWhiteSpace($SourceProject)) { $parts += "Origem: $($SourceProject.Trim())" }
if (-not [string]::IsNullOrWhiteSpace($target.ProjectLabel)) { $parts += "Destino: $($target.ProjectLabel)" }
if (-not [string]::IsNullOrWhiteSpace($ArtifactPath)) { $parts += "Artefato: $($ArtifactPath.Trim())" }
$parts += $bodyText
$message = ($parts -join "`n`n").Trim()

$me = Invoke-RestMethod -Method Get -Uri ("https://api.telegram.org/bot" + $token + "/getMe") -TimeoutSec 25
if (-not $me.ok) {
  throw "Telegram getMe falhou para o destino '$To'."
}

$expected = $ExpectedUsername
if ([string]::IsNullOrWhiteSpace($expected)) { $expected = $target.BotUsername }
if (-not [string]::IsNullOrWhiteSpace($expected) -and $me.result.username -ne $expected.TrimStart("@")) {
  throw "Token do destino aponta para @$($me.result.username), esperado @$($expected.TrimStart("@"))."
}

if ($DryRun) {
  [PSCustomObject]@{
    Ok = $true
    DryRun = $true
    Alias = "dex-rede"
    To = $To
    Match = $target.Match
    TargetProject = $target.ProjectLabel
    BotUsername = $me.result.username
    ChatId = $targetChatId
    RegistryPath = $registry.Path
    EnvPath = $resolvedEnvPath
    TextLength = $message.Length
  } | ConvertTo-Json -Depth 5
  exit 0
}

$send = Invoke-RestMethod `
  -Method Post `
  -Uri ("https://api.telegram.org/bot" + $token + "/sendMessage") `
  -Body @{ chat_id = $targetChatId; text = $message } `
  -TimeoutSec 25

[PSCustomObject]@{
  Ok = [bool]$send.ok
  Alias = "dex-rede"
  To = $To
  TargetProject = $target.ProjectLabel
  BotUsername = $me.result.username
  ChatId = $targetChatId
  MessageId = $send.result.message_id
  Date = $send.result.date
  RegistryPath = $registry.Path
} | ConvertTo-Json -Depth 5
