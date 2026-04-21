param(
  [int]$InitialDelaySeconds = 45
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot ".runtime"
$logPath = Join-Path $runtimeDir "dex-agent.boot.log"
$startScriptPath = Join-Path $PSScriptRoot "start-dex-agent.ps1"
$retryDelaysSeconds = @(9, 18, 27, 36, 45)
$maxAttempts = 6

function Write-BootLog {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$timestamp] $Message"
  Add-Content -LiteralPath $logPath -Value $line
  Write-Output $line
}

function Get-DexAgentProcess {
  $repoPattern = [Regex]::Escape($repoRoot)
  $candidates = Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq "node.exe" -and
      $_.CommandLine -and
      $_.CommandLine -match $repoPattern -and
      $_.CommandLine -match "src/index\.ts"
    } |
    Sort-Object CreationDate -Descending

  if (-not $candidates) {
    return $null
  }

  $preferred = $candidates |
    Where-Object { $_.CommandLine -match "loader\.mjs" } |
    Select-Object -First 1

  if ($preferred) {
    return $preferred
  }

  return $candidates | Select-Object -First 1
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

if (-not (Test-Path -LiteralPath $startScriptPath)) {
  throw "Nao encontrei o script de inicializacao em $startScriptPath"
}

Write-BootLog "Boot do Dex Agent iniciado."
Write-BootLog "Aguardando ${InitialDelaySeconds}s antes da primeira tentativa."
Start-Sleep -Seconds $InitialDelaySeconds

for ($attempt = 1; $attempt -le $maxAttempts; $attempt += 1) {
  Write-BootLog "Tentativa ${attempt}/${maxAttempts}: iniciando Dex Agent."

  try {
    & $startScriptPath | Out-Null
  } catch {
    Write-BootLog "Tentativa $attempt falhou ao iniciar: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds 12

  $process = Get-DexAgentProcess
  if ($process) {
    Write-BootLog "Tentativa $attempt bem-sucedida. Processo ativo: $($process.ProcessId)"
    exit 0
  }

  if ($attempt -lt $maxAttempts) {
    $delay = $retryDelaysSeconds[$attempt - 1]
    Write-BootLog "Tentativa $attempt nao manteve o processo ativo. Nova tentativa em ${delay}s."
    Start-Sleep -Seconds $delay
  }
}

Write-BootLog "Falha final: o Dex Agent nao permaneceu ativo apos $maxAttempts tentativas."
exit 1
