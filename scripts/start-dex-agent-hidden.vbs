Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

repoRoot = fso.GetParentFolderName(WScript.ScriptFullName)
repoRoot = fso.GetParentFolderName(repoRoot)
shell.CurrentDirectory = repoRoot

powershellPath = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
startScriptPath = repoRoot & "\scripts\start-dex-agent.ps1"
command = Chr(34) & powershellPath & Chr(34) & " -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & startScriptPath & Chr(34)

shell.Run command, 0, False
