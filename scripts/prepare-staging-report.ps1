param(
  [string]$Group = "2B2",
  [string]$Output = ".runtime/staging-2b2-report.json",
  [switch]$RunGates
)

$ErrorActionPreference = "Stop"

function Invoke-ReportCommand {
  param(
    [string]$Name,
    [string[]]$Command,
    [switch]$AllowFailure
  )

  $startedAt = (Get-Date).ToUniversalTime().ToString("o")
  $outputLines = @()
  $exitCode = 0

  try {
    $outputLines = & $Command[0] @($Command[1..($Command.Length - 1)]) 2>&1 |
      ForEach-Object { $_.ToString() }
    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  } catch {
    $outputLines += $_.Exception.Message
    $exitCode = if ($null -eq $LASTEXITCODE) { 1 } else { $LASTEXITCODE }
  }

  $finishedAt = (Get-Date).ToUniversalTime().ToString("o")

  if (($exitCode -ne 0) -and (-not $AllowFailure)) {
    return [ordered]@{
      name = $Name
      command = $Command -join " "
      exitCode = $exitCode
      ok = $false
      startedAt = $startedAt
      finishedAt = $finishedAt
      output = $outputLines
    }
  }

  [ordered]@{
    name = $Name
    command = $Command -join " "
    exitCode = $exitCode
    ok = $exitCode -eq 0
    startedAt = $startedAt
    finishedAt = $finishedAt
    output = $outputLines
  }
}

function Get-CommandOutput {
  param([string[]]$Command)
  $result = Invoke-ReportCommand -Name ($Command -join " ") -Command $Command -AllowFailure
  @($result.output)
}

$repoRoot = (Get-Location).Path
$groupConfig = @{
  "2B2" = [ordered]@{
    title = "Telegram /admin commands partial staging"
    includeFiles = @(
      "src/bot/handlers.ts",
      "src/bot/i18n.ts",
      "src/bot/commandCatalog.ts",
      "src/index.ts",
      "tests/handlers.test.ts",
      "README.md"
    )
    allowedMarkers = @(
      "/admin",
      "AdminWebServer",
      "DashboardAdminService",
      "HistoryAdminService",
      "PromptAdminService",
      "admin:",
      "menu:admin",
      "buttonAdmin",
      "adminDashboard",
      "adminPrompts",
      "adminHistory"
    )
    excludedMarkers = @(
      "specialAutopilot",
      "maybeRunSpecialAutopilotAfterFinalized",
      "finalAction",
      "FinalAction",
      "reasoning",
      "startupQueueRecovery",
      "queue recovery",
      "audioSummary",
      "AudioSummary",
      "spec.md"
    )
    mustStayUnstaged = @(
      "spec.md",
      "src/lib/finalActionContext.ts",
      "src/lib/specialAutopilot.ts",
      "tests/finalActionContext.test.ts",
      "tests/specialAutopilot.test.ts"
    )
  }
}

if (-not $groupConfig.ContainsKey($Group)) {
  throw "Unsupported group '$Group'. Supported groups: $($groupConfig.Keys -join ', ')"
}

$config = $groupConfig[$Group]
$commands = New-Object System.Collections.Generic.List[object]

$commands.Add((Invoke-ReportCommand -Name "git status --short" -Command @("git", "status", "--short") -AllowFailure))
$commands.Add((Invoke-ReportCommand -Name "git diff --cached --name-status" -Command @("git", "diff", "--cached", "--name-status") -AllowFailure))
$commands.Add((Invoke-ReportCommand -Name "git diff --cached --stat" -Command @("git", "diff", "--cached", "--stat") -AllowFailure))
$commands.Add((Invoke-ReportCommand -Name "git diff --cached --check" -Command @("git", "diff", "--cached", "--check") -AllowFailure))

$targetDiffCommand = @("git", "diff", "--name-status", "--") + $config.includeFiles
$targetCachedCommand = @("git", "diff", "--cached", "--name-status", "--") + $config.includeFiles
$targetDiffNameStatus = Get-CommandOutput -Command $targetDiffCommand
$targetCachedNameStatus = Get-CommandOutput -Command $targetCachedCommand

$riskScans = [ordered]@{}
foreach ($marker in $config.excludedMarkers) {
  $pattern = [regex]::Escape($marker)
  $scanCommand = @("git", "diff", "-G", $pattern, "--name-only", "--") + $config.includeFiles
  $files = Get-CommandOutput -Command $scanCommand
  $riskScans[$marker] = @($files | Where-Object { $_ })
}

$adminScans = [ordered]@{}
foreach ($marker in $config.allowedMarkers) {
  $pattern = [regex]::Escape($marker)
  $scanCommand = @("git", "diff", "-G", $pattern, "--name-only", "--") + $config.includeFiles
  $files = Get-CommandOutput -Command $scanCommand
  $adminScans[$marker] = @($files | Where-Object { $_ })
}

$secretScan = Get-CommandOutput -Command @(
  "git",
  "diff",
  "--cached",
  "-G",
  "BOT_TOKEN=|OPENAI_API_KEY=|OPENROUTER|ghp_[A-Za-z0-9]|sk-[A-Za-z0-9]|\d{8,12}:[A-Za-z0-9_-]{30,}",
  "--name-only"
)

if ($RunGates) {
  $commands.Add((Invoke-ReportCommand -Name "npm run check" -Command @("npm", "run", "check") -AllowFailure))
  $commands.Add((Invoke-ReportCommand -Name "npm run lint" -Command @("npm", "run", "lint") -AllowFailure))
  $commands.Add((Invoke-ReportCommand -Name "npm run format:check" -Command @("npm", "run", "format:check") -AllowFailure))
  $commands.Add((Invoke-ReportCommand -Name "npm test" -Command @("npm", "test") -AllowFailure))
  $commands.Add((Invoke-ReportCommand -Name "npm run healthcheck" -Command @("npm", "run", "healthcheck") -AllowFailure))
}

$report = [ordered]@{
  schema = "dex-agent.staging-report.v1"
  schema_version = 1
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  group = $Group
  title = $config.title
  purpose = "Recoverable diagnostic snapshot for long partial staging."
  scope = "Prepare and verify partial staging for $Group without staging or committing."
  repoRoot = $repoRoot
  repo_root = $repoRoot
  branch = (Get-CommandOutput -Command @("git", "branch", "--show-current") | Select-Object -First 1)
  head = (Get-CommandOutput -Command @("git", "rev-parse", "--short", "HEAD") | Select-Object -First 1)
  head_sha = (Get-CommandOutput -Command @("git", "rev-parse", "HEAD") | Select-Object -First 1)
  mode = if ($RunGates) { "diagnostic_with_gates" } else { "diagnostic_only" }
  policy = [ordered]@{
    noGitAddDot = $true
    noSecretOutput = $true
    noStagingPerformedByThisScript = $true
    reportMayBeRegenerated = $true
  }
  plannedIncludeFiles = $config.includeFiles
  target_files = $config.includeFiles
  mustStayUnstaged = $config.mustStayUnstaged
  excluded_scopes = $config.excludedMarkers
  allowedMarkers = $config.allowedMarkers
  excludedMarkers = $config.excludedMarkers
  targetDiffNameStatus = @($targetDiffNameStatus | Where-Object { $_ })
  targetCachedNameStatus = @($targetCachedNameStatus | Where-Object { $_ })
  unstaged_summary = @($targetDiffNameStatus | Where-Object { $_ })
  staged_summary = @($targetCachedNameStatus | Where-Object { $_ })
  untracked_summary = @((Get-CommandOutput -Command @("git", "ls-files", "--others", "--exclude-standard")) | Where-Object { $_ })
  adminMarkerFiles = $adminScans
  excludedMarkerFiles = $riskScans
  cachedSecretScanNameOnly = @($secretScan | Where-Object { $_ })
  secret_safety_checks = [ordered]@{
    cachedNameOnlyMatches = @($secretScan | Where-Object { $_ })
    note = "Name-only scan; this report intentionally avoids embedding raw diffs or secret values."
  }
  staged_diff_checks = [ordered]@{
    hasCachedChangesInTargetFiles = @($targetCachedNameStatus | Where-Object { $_ }).Count -gt 0
    cachedDiffCheckCommand = "git diff --cached --check"
  }
  admin_telegram_2b2_readiness = [ordered]@{
    hasAdminMarkers = ($adminScans.Values | ForEach-Object { $_ } | Where-Object { $_ }).Count -gt 0
    hasExcludedMarkerHits = ($riskScans.Values | ForEach-Object { $_ } | Where-Object { $_ }).Count -gt 0
    readyForCommit = $false
    reason = "Diagnostic only. Partial staging and gates must be completed after this report."
  }
  blockers = @()
  notes = @(
    "Do not commit .runtime reports.",
    "Do not use git add . for this group.",
    "This JSON is a snapshot, not a permanent source of truth."
  )
  commands = $commands
  nextSteps = @(
    "Review excludedMarkerFiles before staging 2B2.",
    "Stage only admin hunks from plannedIncludeFiles.",
    "Run this script again after staging to refresh targetCachedNameStatus.",
    "Run gates with -RunGates before commit.",
    "Keep spec.md, autopilot, audio summary, final actions, reasoning and queue recovery outside 2B2 unless explicitly approved."
  )
}

$outputPath = if ([System.IO.Path]::IsPathRooted($Output)) {
  $Output
} else {
  Join-Path $repoRoot $Output
}

$outputDir = Split-Path -Parent $outputPath
if ($outputDir) {
  New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

$json = $report | ConvertTo-Json -Depth 8
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outputPath, $json, $utf8NoBom)
Write-Output $outputPath
