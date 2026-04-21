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
      $_.CommandLine -match "src/index\\.ts"
    } |
    Sort-Object CreationDate -Descending
}

function Resolve-DexAgentProcess {
  $candidates = @(Get-DexAgentProcesses)
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

if (-not (Test-Path -LiteralPath $pidPath)) {
  $matchedWithoutPid = Resolve-DexAgentProcess
  if (-not $matchedWithoutPid) {
    Write-Output "Dex Agent nao esta em execucao."
    exit 0
  }

  $pidValue = [string]$matchedWithoutPid.ProcessId
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
  $matchedEmptyPid = Resolve-DexAgentProcess
  if (-not $matchedEmptyPid) {
    Write-Output "Arquivo de PID vazio e nenhum processo ativo encontrado."
    exit 1
  }

  $pidValue = [string]$matchedEmptyPid.ProcessId
  Set-Content -LiteralPath $pidPath -Value $pidValue
}

$process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
if (-not $process) {
  $matchedProcess = Resolve-DexAgentProcess
  if (-not $matchedProcess) {
    Write-Output "PID salvo nao esta mais ativo: $pidValue"
    Write-Output "Pode iniciar novamente com .\\scripts\\start-dex-agent.ps1"
    exit 1
  }

  $pidValue = [string]$matchedProcess.ProcessId
  Set-Content -LiteralPath $pidPath -Value $pidValue
  $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
}

Write-Output "Dex Agent esta em execucao."
Write-Output "PID: $pidValue"
Write-Output "Processo: $($process.ProcessName)"
Write-Output "Iniciado em: $($process.StartTime)"
Write-Output "Janela: oculta ou sem janela (MainWindowHandle = $($process.MainWindowHandle))"
Write-Output "STDOUT: $stdoutPath"
Write-Output "STDERR: $stderrPath"
