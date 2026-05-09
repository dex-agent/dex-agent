param(
  [Parameter(Mandatory = $true)][string]$ArchivePath,
  [string]$TargetRoot = "",
  [switch]$IncludeSecrets,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($TargetRoot)) {
  $TargetRoot = Split-Path -Parent $PSScriptRoot
}

$resolvedArchivePath = [System.IO.Path]::GetFullPath(
  [Environment]::ExpandEnvironmentVariables($ArchivePath)
)
$resolvedTargetRoot = [System.IO.Path]::GetFullPath(
  [Environment]::ExpandEnvironmentVariables($TargetRoot)
)

if (-not (Test-Path -LiteralPath $resolvedArchivePath -PathType Leaf)) {
  throw "ArchivePath nao encontrado: $resolvedArchivePath"
}

New-Item -ItemType Directory -Force -Path $resolvedTargetRoot | Out-Null

$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("dex-agent-config-import-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null

function Assert-SafeRelativePath {
  param([Parameter(Mandatory = $true)][string]$RelativePath)

  $normalized = $RelativePath.Replace("/", "\")
  if ([System.IO.Path]::IsPathRooted($normalized)) {
    throw "Caminho absoluto nao permitido no manifest: $RelativePath"
  }

  foreach ($part in $normalized.Split("\", [System.StringSplitOptions]::RemoveEmptyEntries)) {
    if ($part -eq "..") {
      throw "Path traversal nao permitido no manifest: $RelativePath"
    }
  }

  return $normalized
}

try {
  Expand-Archive -LiteralPath $resolvedArchivePath -DestinationPath $stagingRoot -Force

  $manifestPath = Join-Path $stagingRoot "dex-agent-config-manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Manifest dex-agent-config-manifest.json nao encontrado no archive."
  }

  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ([int]$manifest.schema_version -ne 1) {
    throw "Schema de exportacao nao suportado: $($manifest.schema_version)"
  }

  $imported = @()
  $skipped = @()

  foreach ($entry in @($manifest.files)) {
    $relativePath = Assert-SafeRelativePath -RelativePath ([string]$entry.path)
    $isSecret = [bool]$entry.secret

    if ($isSecret -and -not $IncludeSecrets) {
      $skipped += [pscustomobject]@{
        path = $entry.path
        reason = "secret_requires_include_secrets"
      }
      continue
    }

    $sourcePath = Join-Path $stagingRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
      $skipped += [pscustomobject]@{
        path = $entry.path
        reason = "missing_from_archive"
      }
      continue
    }

    $targetPath = Join-Path $resolvedTargetRoot $relativePath
    if ((Test-Path -LiteralPath $targetPath) -and -not $Force) {
      $skipped += [pscustomobject]@{
        path = $entry.path
        reason = "exists_use_force"
      }
      continue
    }

    $targetParent = Split-Path -Parent $targetPath
    if ($targetParent) {
      New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
    }

    Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
    $imported += [pscustomobject]@{
      path = $entry.path
      secret = $isSecret
    }
  }

  [pscustomobject]@{
    ok = $true
    archive_path = $resolvedArchivePath
    target_root = $resolvedTargetRoot
    include_secrets = [bool]$IncludeSecrets
    force = [bool]$Force
    imported_count = $imported.Count
    skipped_count = $skipped.Count
    imported = $imported
    skipped = $skipped
  } | ConvertTo-Json -Depth 8
} finally {
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
}
