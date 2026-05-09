param(
  [string]$Text = "",
  [string]$TextPath = "",
  [string]$Title = "",
  [string]$SourceProject = "",
  [string]$ArtifactPath = "",
  [switch]$DryRun,
  [string]$ParentEnvPath = "",
  [string]$ParentRepo = ""
)

$skillRoot = Split-Path -Parent $PSScriptRoot
$localRepoRoot = Split-Path -Parent (Split-Path -Parent $skillRoot)
$defaultDexAgentHome = Join-Path $env:USERPROFILE ".dex-agent"
$candidateRoots = @()
if ($ParentRepo) { $candidateRoots += $ParentRepo }
if ($env:DEX_PARENT_REPO) { $candidateRoots += $env:DEX_PARENT_REPO }
$candidateRoots += $defaultDexAgentHome
$candidateRoots += $localRepoRoot

$helper = $null
foreach ($candidateRoot in ($candidateRoots | Where-Object { $_ } | Select-Object -Unique)) {
  $candidateHelper = Join-Path $candidateRoot "scripts\send-dex-parent-message.ps1"
  if (Test-Path -LiteralPath $candidateHelper) {
    $helper = $candidateHelper
    break
  }
}

if (-not $helper -or -not (Test-Path -LiteralPath $helper)) {
  throw "Helper do dex-pai nao encontrado. Configure DEX_PARENT_REPO ou informe -ParentRepo."
}

$argsList = @()
if ($Text) { $argsList += @("-Text", $Text) }
if ($TextPath) { $argsList += @("-TextPath", $TextPath) }
if ($Title) { $argsList += @("-Title", $Title) }
if ($SourceProject) { $argsList += @("-SourceProject", $SourceProject) }
if ($ArtifactPath) { $argsList += @("-ArtifactPath", $ArtifactPath) }
if ($ParentEnvPath) { $argsList += @("-ParentEnvPath", $ParentEnvPath) }
if ($DryRun) { $argsList += "-DryRun" }

& powershell -ExecutionPolicy Bypass -File $helper @argsList
