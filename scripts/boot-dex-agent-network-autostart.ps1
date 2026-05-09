param(
  [int]$InitialDelaySeconds = 45
)

$ErrorActionPreference = "Continue"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot ".runtime"
$logPath = Join-Path $runtimeDir "dex-agent-network.boot.log"
$registryPath = Join-Path $repoRoot "config\dex-agent-network.local.json"

function Write-BootLog {
  param([Parameter(Mandatory = $true)][string]$Message)

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$timestamp] $Message"
  Add-Content -LiteralPath $logPath -Value $line
  Write-Output $line
}

function Get-InstallRootFromEnvPath {
  param([Parameter(Mandatory = $true)][string]$EnvPath)

  return Split-Path -Parent ([Environment]::ExpandEnvironmentVariables($EnvPath))
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

Write-BootLog "Boot da rede Dex Agent iniciado."

if (-not (Test-Path -LiteralPath $registryPath)) {
  Write-BootLog "Registry nao encontrado: $registryPath"
  exit 1
}

if ($InitialDelaySeconds -gt 0) {
  Write-BootLog "Aguardando ${InitialDelaySeconds}s antes de iniciar instancias."
  Start-Sleep -Seconds $InitialDelaySeconds
}

try {
  $registry = Get-Content -LiteralPath $registryPath -Raw | ConvertFrom-Json
} catch {
  Write-BootLog "Falha ao ler registry: $($_.Exception.Message)"
  exit 1
}

$instances = @($registry.instances)
if (-not $instances.Count) {
  Write-BootLog "Nenhuma instancia registrada."
  exit 0
}

foreach ($instance in $instances) {
  $label = [string]$instance.projectLabel
  $envPath = [string]$instance.envPath
  $installRoot = Get-InstallRootFromEnvPath -EnvPath $envPath
  $startScript = Join-Path $installRoot "scripts\start-dex-agent.ps1"

  if (-not (Test-Path -LiteralPath $startScript)) {
    Write-BootLog "[$label] start script nao encontrado: $startScript"
    continue
  }

  try {
    $process = Start-Process `
      -FilePath "powershell.exe" `
      -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $startScript) `
      -WindowStyle Hidden `
      -PassThru
    Write-BootLog "[$label] start disparado. Launcher PID: $($process.Id)"
  } catch {
    Write-BootLog "[$label] falha ao disparar start: $($_.Exception.Message)"
  }
}

Start-Sleep -Seconds 12

foreach ($instance in $instances) {
  $label = [string]$instance.projectLabel
  $envPath = [string]$instance.envPath
  $installRoot = Get-InstallRootFromEnvPath -EnvPath $envPath
  $statusScript = Join-Path $installRoot "scripts\status-dex-agent.ps1"

  if (-not (Test-Path -LiteralPath $statusScript)) {
    Write-BootLog "[$label] status script nao encontrado."
    continue
  }

  try {
    $status = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $statusScript) -join " | "
    Write-BootLog "[$label] $status"
  } catch {
    Write-BootLog "[$label] falha no status: $($_.Exception.Message)"
  }
}

Write-BootLog "Boot da rede Dex Agent finalizado."
