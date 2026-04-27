param(
  [Parameter(Mandatory = $true)]
  [string[]]$Path,

  [string]$Caption = "",

  [string]$ChatId = "",

  [ValidateSet("auto", "photo", "document")]
  [string]$Mode = "auto",

  [string]$EnvFile = "",

  [switch]$DryRun,

  [switch]$Json
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeScript = Join-Path $scriptDir "send-dex-print.mjs"

if (-not (Test-Path -LiteralPath $nodeScript)) {
  throw "Helper JS nao encontrado: $nodeScript"
}

$argsList = @($nodeScript, "--mode", $Mode)

if ($Caption) {
  $argsList += @("--caption", $Caption)
}

if ($ChatId) {
  $argsList += @("--chat-id", $ChatId)
}

if ($EnvFile) {
  $argsList += @("--env-file", $EnvFile)
}

if ($Json) {
  $argsList += "--json"
}

if ($DryRun) {
  $argsList += "--dry-run"
}

foreach ($item in $Path) {
  $resolved = Resolve-Path -LiteralPath $item -ErrorAction Stop
  $argsList += @("--path", $resolved.Path)
}

& node @argsList
exit $LASTEXITCODE
