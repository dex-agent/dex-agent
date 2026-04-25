$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot ".runtime"
$pidPath = Join-Path $runtimeDir "dex-agent.pid"
$startScriptPath = Join-Path $PSScriptRoot "start-dex-agent.ps1"

if (-not (Test-Path -LiteralPath $startScriptPath)) {
  throw "Nao encontrei o script de inicializacao em $startScriptPath"
}

# Remove the saved PID first so the canonical start flow actually cleans up the
# previous instance instead of short-circuiting on the already-running check.
Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue

# Reuse the canonical start flow so restart inherits the same singleton cleanup.
& $startScriptPath | Out-Null
