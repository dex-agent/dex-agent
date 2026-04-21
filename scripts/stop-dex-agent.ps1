$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot ".runtime"
$pidPath = Join-Path $runtimeDir "dex-agent.pid"

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

function Resolve-DexAgentProcesses {
  @(Get-DexAgentProcesses | Sort-Object CreationDate -Descending)
}

if (-not (Test-Path -LiteralPath $pidPath)) {
  $orphanProcesses = Resolve-DexAgentProcesses
  if (-not $orphanProcesses.Count) {
    Write-Output "Dex Agent nao esta em execucao."
    exit 0
  }

  foreach ($entry in $orphanProcesses) {
    Stop-Process -Id $entry.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Write-Output "Dex Agent finalizado usando descoberta de processos."
  exit 0
}

$pidValue = (Get-Content -LiteralPath $pidPath -Raw).Trim()
if (-not $pidValue) {
  Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
  Write-Output "PID vazio removido."
  exit 0
}

$process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
if ($process) {
  Stop-Process -Id $pidValue -Force
  Write-Output "Dex Agent finalizado. PID: $pidValue"
} else {
  Write-Output "PID salvo nao estava ativo: $pidValue"
}

$remaining = Resolve-DexAgentProcesses
foreach ($entry in $remaining) {
  Stop-Process -Id $entry.ProcessId -Force -ErrorAction SilentlyContinue
}

Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
