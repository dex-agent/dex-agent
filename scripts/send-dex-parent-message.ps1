param(
  [string]$Text = "",
  [string]$TextPath = "",
  [string]$Title = "",
  [string]$SourceProject = "",
  [string]$ArtifactPath = "",
  [string]$ChatId = "",
  [string]$ParentEnvPath = "",
  [string]$ExpectedUsername = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ParentEnvPath)) {
  $ParentEnvPath = Join-Path $repoRoot ".env"
}

function Import-DotEnv {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Parent .env nao encontrado: $Path"
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

function Select-ChatId {
  param([hashtable]$Env)

  if (-not [string]::IsNullOrWhiteSpace($ChatId)) { return $ChatId.Trim() }

  foreach ($name in @("PROACTIVE_USER_IDS", "ALLOWED_USER_IDS")) {
    if (-not $Env.ContainsKey($name)) { continue }
    $candidate = ($Env[$name] -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -First 1)
    if ($candidate) { return $candidate }
  }

  throw "Nao encontrei ChatId. Informe -ChatId ou configure PROACTIVE_USER_IDS/ALLOWED_USER_IDS no .env do pai."
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

$envMap = Import-DotEnv -Path $ParentEnvPath
$token = $envMap["BOT_TOKEN"]
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "BOT_TOKEN vazio no .env do pai."
}
$expectedUsernameFromEnv = $envMap["TELEGRAM_EXPECTED_USERNAME"]

$targetChatId = Select-ChatId -Env $envMap
$bodyText = Get-MessageText
$parts = @()
if (-not [string]::IsNullOrWhiteSpace($Title)) { $parts += $Title.Trim() }
if (-not [string]::IsNullOrWhiteSpace($SourceProject)) { $parts += "Origem: $($SourceProject.Trim())" }
if (-not [string]::IsNullOrWhiteSpace($ArtifactPath)) { $parts += "Artefato: $($ArtifactPath.Trim())" }
$parts += $bodyText
$message = ($parts -join "`n`n").Trim()

$me = Invoke-RestMethod -Method Get -Uri ("https://api.telegram.org/bot" + $token + "/getMe") -TimeoutSec 25
if (-not $me.ok) {
  throw "Telegram getMe falhou para o dex-pai."
}
$expected = $ExpectedUsername
if ([string]::IsNullOrWhiteSpace($expected)) { $expected = $expectedUsernameFromEnv }
if (-not [string]::IsNullOrWhiteSpace($expected) -and $me.result.username -ne $expected.TrimStart("@")) {
  throw "Token do pai aponta para @$($me.result.username), esperado @$($expected.TrimStart("@"))."
}

if ($DryRun) {
  [PSCustomObject]@{
    Ok = $true
    DryRun = $true
    Alias = "dex-pai"
    BotUsername = $me.result.username
    ChatId = $targetChatId
    TextLength = $message.Length
  } | ConvertTo-Json -Depth 4
  exit 0
}

$send = Invoke-RestMethod `
  -Method Post `
  -Uri ("https://api.telegram.org/bot" + $token + "/sendMessage") `
  -Body @{ chat_id = $targetChatId; text = $message } `
  -TimeoutSec 25

[PSCustomObject]@{
  Ok = [bool]$send.ok
  Alias = "dex-pai"
  BotUsername = $me.result.username
  ChatId = $targetChatId
  MessageId = $send.result.message_id
  Date = $send.result.date
} | ConvertTo-Json -Depth 4
