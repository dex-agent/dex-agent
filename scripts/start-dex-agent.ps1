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
      $_.CommandLine -match 'src/index\.ts' -and
      $_.CommandLine -notmatch '--dex-instance-id='
    }
}

function Get-DexAgentInstances {
  $candidates = @(Get-DexAgentProcesses)
  if (-not $candidates.Count) {
    return @()
  }

  $processById = @{}
  foreach ($candidate in $candidates) {
    $processById[[string]$candidate.ProcessId] = $candidate
  }

  $grouped = @{}
  foreach ($candidate in $candidates) {
    $root = $candidate
    while ($processById.ContainsKey([string]$root.ParentProcessId)) {
      $root = $processById[[string]$root.ParentProcessId]
    }

    $instanceId = [string]$root.ProcessId
    if (-not $grouped.ContainsKey($instanceId)) {
      $grouped[$instanceId] = [System.Collections.ArrayList]::new()
    }

    [void]$grouped[$instanceId].Add($candidate)
  }

  return $grouped.Keys |
    ForEach-Object {
      $instanceProcesses = @($grouped[$_]) | Sort-Object CreationDate -Descending
      $rootProcess = $processById[$_]
      $preferred = $instanceProcesses | Where-Object {
        $_.Name -eq "node.exe" -and $_.CommandLine -match 'loader\.mjs'
      } | Select-Object -First 1

      if (-not $preferred) {
        $preferred = $instanceProcesses | Select-Object -First 1
      }

      [pscustomobject]@{
        InstanceId     = $_
        RootProcess    = $rootProcess
        Representative = $preferred
        Processes      = $instanceProcesses
        StartedAt      = $preferred.CreationDate
      }
    } |
    Sort-Object StartedAt -Descending
}

function Resolve-DexAgentInstance {
  $instances = @(Get-DexAgentInstances)
  if (-not $instances.Count) {
    return $null
  }

  return $instances | Select-Object -First 1
}

function Stop-DexAgentProcesses {
  $instances = @(Get-DexAgentInstances | Sort-Object StartedAt -Descending)
  if (-not $instances.Count) {
    return
  }

  foreach ($instance in $instances) {
    $rootPid = [string]$instance.RootProcess.ProcessId
    & taskkill.exe /PID $rootPid /T /F *> $null
    Stop-Process -Id $instance.RootProcess.ProcessId -Force -ErrorAction SilentlyContinue
    foreach ($instanceProcess in @($instance.Processes)) {
      Stop-Process -Id $instanceProcess.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }

  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    if (-not @(Get-DexAgentInstances).Count) {
      return
    }
    Start-Sleep -Milliseconds 250
  }

  throw "Nao consegui encerrar todas as instancias antigas do Dex Agent."
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
    $matchedInstances = @(Get-DexAgentInstances)
    $matchedInstance = Resolve-DexAgentInstance
    if (
      $matchedInstance -and
      $matchedInstances.Count -eq 1 -and
      (
        ($existingProcess -and @($matchedInstance.Processes | Where-Object { $_.ProcessId -eq $existingProcess.Id }).Count -gt 0) -or
        ($existingPid -eq [string]$matchedInstance.Representative.ProcessId)
      )
    ) {
      $resolvedExistingPid = [string]$matchedInstance.Representative.ProcessId
      Set-Content -LiteralPath $pidPath -Value $resolvedExistingPid
      Write-Output "Dex Agent ja esta em execucao. PID: $resolvedExistingPid"
      Write-Output "Status: .\\scripts\\status-dex-agent.ps1"
      exit 0
    }
  }
}

Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue

$staleInstances = @(Get-DexAgentInstances)
Write-Output "Instancias detectadas antes do cleanup: $($staleInstances.Count)"
if ($staleInstances.Count) {
  Write-Output "Limpando $($staleInstances.Count) instancia(s) antiga(s) do Dex Agent..."
  Stop-DexAgentProcesses
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

  $resolvedInstance = Resolve-DexAgentInstance
  if ($resolvedInstance) {
    $resolvedPid = $resolvedInstance.Representative.ProcessId
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
