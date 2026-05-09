$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env"

function Get-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return ""
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match "^\s*$Name\s*=\s*(.*)\s*$") {
      $value = $Matches[1].Trim()
      if ($value.StartsWith('"') -and $value.EndsWith('"')) {
        return $value.Trim('"')
      }
      return $value
    }
  }

  return ""
}

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Arquivo .env nao encontrado em $envPath"
}

$dexAgentHome = (Join-Path $env:USERPROFILE ".dex-agent").Replace("\", "/")

$checks = @(
  @{
    Name = "STATE_FILE"
    Expected = ".codex-telegram-claws-state.json"
    Actual = Get-DotEnvValue -Path $envPath -Name "STATE_FILE"
  },
  @{
    Name = "WORKSPACE_ROOT"
    Expected = $dexAgentHome
    Actual = Get-DotEnvValue -Path $envPath -Name "WORKSPACE_ROOT"
  },
  @{
    Name = "CODEX_WORKDIR"
    Expected = $dexAgentHome
    Actual = Get-DotEnvValue -Path $envPath -Name "CODEX_WORKDIR"
  },
  @{
    Name = "GITHUB_DEFAULT_WORKDIR"
    Expected = $dexAgentHome
    Actual = Get-DotEnvValue -Path $envPath -Name "GITHUB_DEFAULT_WORKDIR"
  }
)

$failed = $false

foreach ($check in $checks) {
  $actual = [Environment]::ExpandEnvironmentVariables($check.Actual).Replace("\", "/")
  if ($actual -eq $check.Expected) {
    Write-Output "[PASS] $($check.Name): $($check.Actual)"
    continue
  }

  $failed = $true
  Write-Output "[WARN] $($check.Name): esperado '$($check.Expected)' mas encontrado '$($check.Actual)'"
}

if ($failed) {
  exit 1
}

Write-Output "Baseline operacional do .env esta alinhado ao Dex Agent."
