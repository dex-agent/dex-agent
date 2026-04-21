$ErrorActionPreference = "Stop"

$startupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$startupCmdPath = Join-Path $startupDir "start-dex-agent.cmd"
$legacyTaskName = "Dex Agent Autostart"

if (Test-Path -LiteralPath $startupCmdPath) {
  Remove-Item -LiteralPath $startupCmdPath -Force
  Write-Output "Arquivo de autostart removido: $startupCmdPath"
} else {
  Write-Output "Arquivo de autostart nao existe: $startupCmdPath"
}

$legacyTask = Get-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
if ($legacyTask) {
  Unregister-ScheduledTask -TaskName $legacyTaskName -Confirm:$false
  Write-Output "Tarefa legada removida: $legacyTaskName"
}
