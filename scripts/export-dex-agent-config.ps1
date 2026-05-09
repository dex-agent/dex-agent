param(
  [string]$SourceRoot = "",
  [string]$OutputPath = "",
  [switch]$IncludeSecrets
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $PSScriptRoot
}

$resolvedSourceRoot = [System.IO.Path]::GetFullPath(
  [Environment]::ExpandEnvironmentVariables($SourceRoot)
)

if (-not (Test-Path -LiteralPath $resolvedSourceRoot -PathType Container)) {
  throw "SourceRoot nao encontrado: $resolvedSourceRoot"
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $exportDir = Join-Path $resolvedSourceRoot ".runtime\config-exports"
  New-Item -ItemType Directory -Force -Path $exportDir | Out-Null
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputPath = Join-Path $exportDir "dex-agent-config-$timestamp.zip"
}

$resolvedOutputPath = [System.IO.Path]::GetFullPath(
  [Environment]::ExpandEnvironmentVariables($OutputPath)
)
$outputParent = Split-Path -Parent $resolvedOutputPath
if ($outputParent) {
  New-Item -ItemType Directory -Force -Path $outputParent | Out-Null
}

$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("dex-agent-config-export-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null

$manifest = [ordered]@{
  schema_version = 1
  created_at = (Get-Date).ToUniversalTime().ToString("o")
  source_root = $resolvedSourceRoot
  include_secrets = [bool]$IncludeSecrets
  files = @()
}

function Add-ConfigFile {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [bool]$Secret = $false
  )

  if ($Secret -and -not $IncludeSecrets) {
    return
  }

  $sourcePath = Join-Path $resolvedSourceRoot $RelativePath
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    return
  }

  $targetPath = Join-Path $stagingRoot $RelativePath
  $targetParent = Split-Path -Parent $targetPath
  if ($targetParent) {
    New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
  }
  Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force

  $script:manifest.files += [ordered]@{
    path = $RelativePath.Replace("\", "/")
    secret = $Secret
  }
}

function Add-ConfigGlob {
  param(
    [Parameter(Mandatory = $true)][string]$RelativeDirectory,
    [Parameter(Mandatory = $true)][string]$Filter,
    [bool]$Secret = $false
  )

  $directory = Join-Path $resolvedSourceRoot $RelativeDirectory
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
    return
  }

  foreach ($file in Get-ChildItem -LiteralPath $directory -Filter $Filter -File -Force) {
    Add-ConfigFile -RelativePath (Join-Path $RelativeDirectory $file.Name) -Secret $Secret
  }
}

try {
  Add-ConfigFile -RelativePath ".env" -Secret $true
  Add-ConfigGlob -RelativeDirectory "config" -Filter "*.local.json"
  Add-ConfigGlob -RelativeDirectory ".agents" -Filter "*.local.json"
  Add-ConfigFile -RelativePath ".agents\PROMPTS.json"
  Add-ConfigFile -RelativePath ".agents\DEX_PAI.md"
  Add-ConfigFile -RelativePath ".agents\DEX_REDE.md"
  Add-ConfigFile -RelativePath "skills\dex-agent\.env" -Secret $true
  Add-ConfigFile -RelativePath "skills\dex-agent\instance.json"

  $manifestPath = Join-Path $stagingRoot "dex-agent-config-manifest.json"
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

  if (Test-Path -LiteralPath $resolvedOutputPath) {
    Remove-Item -LiteralPath $resolvedOutputPath -Force
  }

  $archiveItems = @(Get-ChildItem -LiteralPath $stagingRoot -Force)
  if (-not $archiveItems.Count) {
    throw "Nenhum arquivo encontrado para exportar."
  }

  Compress-Archive -LiteralPath $archiveItems.FullName -DestinationPath $resolvedOutputPath -Force

  [pscustomobject]@{
    ok = $true
    output_path = $resolvedOutputPath
    source_root = $resolvedSourceRoot
    include_secrets = [bool]$IncludeSecrets
    exported_files = @($manifest.files).Count
  } | ConvertTo-Json -Depth 5
} finally {
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
}
