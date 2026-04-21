$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env"
$runtimeDir = Join-Path $repoRoot ".runtime"
$pidPath = Join-Path $runtimeDir "dex-agent.pid"
$stdoutPath = Join-Path $runtimeDir "dex-agent.stdout.log"
$stderrPath = Join-Path $runtimeDir "dex-agent.stderr.log"
$tsxCliPath = Join-Path $repoRoot "node_modules\\tsx\\dist\\cli.mjs"

function Get-DexAgentProcesses {
  $repoPattern = [Regex]::Escape($repoRoot)
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -in @("node.exe", "cmd.exe", "powershell.exe") -and
      $_.CommandLine -and
      $_.CommandLine -match $repoPattern -and
      $_.CommandLine -match "src/index\\.ts"
    }
}

function Resolve-DexAgentProcess {
  $candidates = @(Get-DexAgentProcesses | Sort-Object CreationDate -Descending)
  if (-not $candidates.Count) {
    return $null
  }

  $preferred = $candidates | Where-Object {
    $_.Name -eq "node.exe" -and $_.CommandLine -match "loader\\.mjs"
  } | Select-Object -First 1

  if ($preferred) {
    return $preferred
  }

  return $candidates | Select-Object -First 1
}

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

$botToken = Get-DotEnvValue -Path $envPath -Name "BOT_TOKEN"
$allowedUserIds = Get-DotEnvValue -Path $envPath -Name "ALLOWED_USER_IDS"

if ([string]::IsNullOrWhiteSpace($botToken)) {
  throw "Preencha BOT_TOKEN no arquivo .env antes de iniciar o Dex Agent."
}

if ([string]::IsNullOrWhiteSpace($allowedUserIds)) {
  throw "Preencha ALLOWED_USER_IDS no arquivo .env antes de iniciar o Dex Agent."
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

if (Test-Path -LiteralPath $pidPath) {
  $existingPid = (Get-Content -LiteralPath $pidPath -Raw).Trim()
  if ($existingPid) {
    $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
    $matchedProcess = Resolve-DexAgentProcess
    if ($existingProcess -and $matchedProcess -and $existingProcess.Id -eq $matchedProcess.ProcessId) {
      Write-Output "Dex Agent ja esta em execucao. PID: $existingPid"
      Write-Output "Status: .\\scripts\\status-dex-agent.ps1"
      exit 0
    }
  }
}

Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue

$staleProcesses = @(Get-DexAgentProcesses)
foreach ($staleProcess in $staleProcesses) {
  Stop-Process -Id $staleProcess.ProcessId -Force -ErrorAction SilentlyContinue
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw "Nao encontrei o comando 'node' no PATH."
}

if (-not (Test-Path -LiteralPath $tsxCliPath)) {
  throw "Nao encontrei o CLI do tsx em $tsxCliPath"
}

$process = Start-Process `
  -FilePath $nodeCommand.Source `
  -ArgumentList @(
    $tsxCliPath,
    "src/index.ts"
  ) `
  -WindowStyle Hidden `
  -WorkingDirectory $repoRoot `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -PassThru

$resolvedPid = $process.Id
for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
  Start-Sleep -Milliseconds 250
  if (Test-Path -LiteralPath $pidPath) {
    $appPid = (Get-Content -LiteralPath $pidPath -Raw).Trim()
    if ($appPid) {
      $appProcess = Get-Process -Id $appPid -ErrorAction SilentlyContinue
      if ($appProcess) {
        $resolvedPid = $appProcess.Id
        break
      }
    }
  }

  $resolvedProcess = Resolve-DexAgentProcess
  if ($resolvedProcess) {
    $resolvedPid = $resolvedProcess.ProcessId
    break
  }
}

Set-Content -LiteralPath $pidPath -Value $resolvedPid

Write-Output "Dex Agent iniciado em background."
Write-Output "PID: $resolvedPid"
Write-Output "Status: .\\scripts\\status-dex-agent.ps1"
Write-Output "Logs:"
Write-Output "  STDOUT -> $stdoutPath"
Write-Output "  STDERR -> $stderrPath"
