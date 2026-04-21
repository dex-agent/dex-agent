$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot ".runtime"
$stdoutPath = Join-Path $runtimeDir "dex-agent.stdout.log"
$stderrPath = Join-Path $runtimeDir "dex-agent.stderr.log"
$tsxCliPath = Join-Path $repoRoot "node_modules\\tsx\\dist\\cli.mjs"

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$nodeCommand = Get-Command node -ErrorAction Stop
if (-not (Test-Path -LiteralPath $tsxCliPath)) {
  throw "Nao encontrei o CLI do tsx em $tsxCliPath"
}

Start-Process `
  -FilePath $nodeCommand.Source `
  -ArgumentList @(
    $tsxCliPath,
    "src/index.ts"
  ) `
  -WindowStyle Hidden `
  -WorkingDirectory $repoRoot `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath | Out-Null
