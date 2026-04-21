Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

repoRoot = fso.GetParentFolderName(WScript.ScriptFullName)
repoRoot = fso.GetParentFolderName(repoRoot)
shell.CurrentDirectory = repoRoot

powershellPath = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
restartScriptPath = repoRoot & "\scripts\restart-dex-agent-hidden.ps1"
command = Chr(34) & powershellPath & Chr(34) & " -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & restartScriptPath & Chr(34)

shell.Run command, 0, False
