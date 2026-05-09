param(
  [Parameter(Mandatory = $true)]
  [string]$To,

  [string]$Text = "",
  [string]$TextPath = "",
  [string]$Title = "",
  [string]$SourceProject = "",
  [string]$ArtifactPath = "",
  [string]$ChatId = "",
  [string]$RegistryPath = "",
  [string]$ParentRepo = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Resolve-ParentRepo {
  if (-not [string]::IsNullOrWhiteSpace($ParentRepo)) { return $ParentRepo }
  if (-not [string]::IsNullOrWhiteSpace($env:DEX_PARENT_REPO)) { return $env:DEX_PARENT_REPO }
  $defaultDexAgentHome = Join-Path $env:USERPROFILE ".dex-agent"
  if (Test-Path -LiteralPath (Join-Path $defaultDexAgentHome "scripts\send-dex-child-message.ps1")) {
    return $defaultDexAgentHome
  }

  $localCandidate = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
  if (Test-Path -LiteralPath (Join-Path $localCandidate "scripts\send-dex-child-message.ps1")) {
    return $localCandidate
  }

  throw "Repo pai dex-agent nao encontrado. Informe -ParentRepo ou DEX_PARENT_REPO."
}

$resolvedParent = Resolve-ParentRepo
$helper = Join-Path $resolvedParent "scripts\send-dex-child-message.ps1"
if (-not (Test-Path -LiteralPath $helper)) {
  throw "Helper dex-rede nao encontrado: $helper"
}

$argsList = @(
  "-ExecutionPolicy", "Bypass",
  "-File", $helper,
  "-To", $To
)

if (-not [string]::IsNullOrWhiteSpace($Text)) { $argsList += @("-Text", $Text) }
if (-not [string]::IsNullOrWhiteSpace($TextPath)) { $argsList += @("-TextPath", $TextPath) }
if (-not [string]::IsNullOrWhiteSpace($Title)) { $argsList += @("-Title", $Title) }
if (-not [string]::IsNullOrWhiteSpace($SourceProject)) { $argsList += @("-SourceProject", $SourceProject) }
if (-not [string]::IsNullOrWhiteSpace($ArtifactPath)) { $argsList += @("-ArtifactPath", $ArtifactPath) }
if (-not [string]::IsNullOrWhiteSpace($ChatId)) { $argsList += @("-ChatId", $ChatId) }
if (-not [string]::IsNullOrWhiteSpace($RegistryPath)) { $argsList += @("-RegistryPath", $RegistryPath) }
if ($DryRun) { $argsList += "-DryRun" }

& powershell @argsList
