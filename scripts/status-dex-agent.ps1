$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot ".runtime"
$pidPath = Join-Path $runtimeDir "dex-agent.pid"
$stdoutPath = Join-Path $runtimeDir "dex-agent.stdout.log"
$stderrPath = Join-Path $runtimeDir "dex-agent.stderr.log"

function Get-DexAgentProcesses {
  $repoPattern = [Regex]::Escape($repoRoot)
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -in @("node.exe", "cmd.exe", "powershell.exe") -and
      $_.CommandLine -and
      $_.CommandLine -match $repoPattern -and
      $_.CommandLine -match 'src/index\.ts' -and
      $_.CommandLine -notmatch '--dex-instance-id='
    } |
    Sort-Object CreationDate -Descending
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

function Write-DexAgentProcessWarning {
  param(
    [array]$Instances
  )

  $instanceList = @($Instances)
  if ($instanceList.Count -le 1) {
    return
  }

  $processList = $instanceList |
    ForEach-Object {
      $representative = $_.Representative
      $processCount = @($_.Processes).Count
      "$($_.InstanceId) [$($representative.Name)] $($representative.CreationDate) ($processCount processo(s))"
    }

  Write-Output "AVISO: multiplas instancias do Dex Agent foram detectadas."
  Write-Output "Processos ativos:"
  foreach ($line in $processList) {
    Write-Output "  - $line"
  }
}

function Write-DexAgentProcessCount {
  param(
    [array]$Instances
  )

  $instanceList = @($Instances)
  Write-Output "Instancias detectadas no host: $($instanceList.Count)"
}

if (-not (Test-Path -LiteralPath $pidPath)) {
  $allInstances = @(Get-DexAgentInstances)
  Write-DexAgentProcessCount -Instances $allInstances
  Write-DexAgentProcessWarning -Instances $allInstances
  $matchedWithoutPid = Resolve-DexAgentInstance
  if (-not $matchedWithoutPid) {
    Write-Output "Dex Agent nao esta em execucao."
    exit 0
  }

  $pidValue = [string]$matchedWithoutPid.Representative.ProcessId
  Set-Content -LiteralPath $pidPath -Value $pidValue
  $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
  Write-Output "Dex Agent esta em execucao."
  Write-Output "PID: $pidValue"
  Write-Output "Processo: $($process.ProcessName)"
  Write-Output "Iniciado em: $($process.StartTime)"
  Write-Output "Janela: oculta ou sem janela (MainWindowHandle = $($process.MainWindowHandle))"
  Write-Output "STDOUT: $stdoutPath"
  Write-Output "STDERR: $stderrPath"
  exit 0
}

$pidValue = (Get-Content -LiteralPath $pidPath -Raw).Trim()
if (-not $pidValue) {
  $allInstances = @(Get-DexAgentInstances)
  Write-DexAgentProcessCount -Instances $allInstances
  Write-DexAgentProcessWarning -Instances $allInstances
  $matchedEmptyPid = Resolve-DexAgentInstance
  if (-not $matchedEmptyPid) {
    Write-Output "Arquivo de PID vazio e nenhum processo ativo encontrado."
    exit 1
  }

  $pidValue = [string]$matchedEmptyPid.Representative.ProcessId
  Set-Content -LiteralPath $pidPath -Value $pidValue
}

$process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
if (-not $process) {
  $allInstances = @(Get-DexAgentInstances)
  Write-DexAgentProcessCount -Instances $allInstances
  Write-DexAgentProcessWarning -Instances $allInstances
  $matchedProcess = Resolve-DexAgentInstance
  if (-not $matchedProcess) {
    Write-Output "PID salvo nao esta mais ativo: $pidValue"
    Write-Output "Pode iniciar novamente com .\\scripts\\start-dex-agent.ps1"
    exit 1
  }

  $pidValue = [string]$matchedProcess.Representative.ProcessId
  Set-Content -LiteralPath $pidPath -Value $pidValue
  $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
}

$allInstances = @(Get-DexAgentInstances)
Write-DexAgentProcessCount -Instances $allInstances
Write-DexAgentProcessWarning -Instances $allInstances

Write-Output "Dex Agent esta em execucao."
Write-Output "PID: $pidValue"
Write-Output "Processo: $($process.ProcessName)"
Write-Output "Iniciado em: $($process.StartTime)"
Write-Output "Janela: oculta ou sem janela (MainWindowHandle = $($process.MainWindowHandle))"
Write-Output "STDOUT: $stdoutPath"
Write-Output "STDERR: $stderrPath"
