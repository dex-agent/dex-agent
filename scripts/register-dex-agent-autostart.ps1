$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$bootScriptPath = Join-Path $PSScriptRoot "boot-dex-agent-autostart.ps1"
$startupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$startupCmdPath = Join-Path $startupDir "start-dex-agent.cmd"
$legacyTaskName = "Dex Agent Autostart"

if (-not (Test-Path -LiteralPath $bootScriptPath)) {
  throw "Nao encontrei o script de boot em $bootScriptPath"
}

New-Item -ItemType Directory -Force -Path $startupDir | Out-Null

$cmdContent = @"
@echo off
setlocal

set "BOOT_DELAY=%~1"
if "%BOOT_DELAY%"=="" set "BOOT_DELAY=45"

powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$bootScriptPath" -InitialDelaySeconds %BOOT_DELAY%

endlocal
"@

Set-Content -LiteralPath $startupCmdPath -Value $cmdContent -Encoding ASCII

$legacyTask = Get-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
if ($legacyTask) {
  Unregister-ScheduledTask -TaskName $legacyTaskName -Confirm:$false
  Write-Output "Tarefa legada removida: $legacyTaskName"
}

Write-Output "Autostart registrado com sucesso."
Write-Output "Modo: Startup folder do Windows"
Write-Output "Arquivo: $startupCmdPath"
Write-Output "Boot script: $bootScriptPath"
Write-Output "Boot: atraso inicial de 45s e ate 6 tentativas"
