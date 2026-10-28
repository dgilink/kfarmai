# KFarmAI Dev Loop v1. PowerShell 7+; Node 20+; Codex CLI for -Task.
[CmdletBinding()]
param(
  [string]$Task = '',
  [string]$TaskFile = '',
  [switch]$Full,
  [switch]$VerifyOnly
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$report = Join-Path ([IO.Path]::GetTempPath()) 'kfarmai-dev-loop-v1-report.json'
if ($Task -and $TaskFile) { throw 'HOLD: choose -Task OR -TaskFile.' }
$remote = (& git -C $root remote get-url origin)
if ($LASTEXITCODE -ne 0 -or $remote -notmatch '^(https://github\.com/|git@github\.com:|ssh://git@github\.com/)dgilink/kfarmai(\.git)?$') {
  throw 'HOLD: official dgilink/kfarmai remote mismatch.'
}
$branch = (& git -C $root branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw 'HOLD: cannot establish branch.' }
$head = (& git -C $root rev-parse HEAD).Trim()
$before = (& git -C $root status --porcelain=v1)
if ($LASTEXITCODE -ne 0) { throw 'HOLD: cannot establish working tree status.' }
$staged = (& git -C $root diff --cached --name-only)
if ($LASTEXITCODE -ne 0) { throw 'HOLD: cannot establish staged files.' }
Write-Output "Repository: dgilink/kfarmai | Branch: $branch | HEAD: $head"
if (-not $VerifyOnly -and ($Task -or $TaskFile)) {
  if ($branch -notmatch '^(preview/|dev-loop/|feature/|fix/)' -or $branch -eq 'main') {
    throw 'HOLD: Codex tasks require a non-main preview branch/worktree.'
  }
  if (@($before | Where-Object { $_ -ne '' }).Count -gt 0) {
    throw 'HOLD: working tree is dirty. Use a clean isolated worktree; never reset or clean user files.'
  }
  if (@($staged | Where-Object { $_ -ne '' }).Count -gt 0) { throw 'HOLD: staged files exist.' }
  $codex = Get-Command codex -ErrorAction SilentlyContinue
  if (-not $codex) { throw 'HOLD: Codex CLI is not on PATH. Verify installation/login.' }
  $taskText = if ($TaskFile) { Get-Content -LiteralPath $TaskFile -Raw -Encoding utf8 } else { $Task }
  if ([string]::IsNullOrWhiteSpace($taskText)) { throw 'HOLD: empty task.' }
  $guard = @'
Work only inside this clean KFarmAI preview worktree.
Read AGENTS.md. Verify Git owner/name, remote, HEAD and changes before editing.
Implement the task and relevant regression tests.
Do NOT git commit/push, change main, deploy, run reset/clean/force, or modify production DB/Storage/Edge/Worker.
Never print secrets, touch other projects, or overwrite user files. Leave reviewable local diff.
Report concise PASS/FAIL/UNVERIFIED without claiming production release.
'@
  $logPath = Join-Path ([IO.Path]::GetTempPath()) 'kfarmai-dev-loop-v1-codex.log'
  $request = $guard + [Environment]::NewLine + 'TASK:' + [Environment]::NewLine + $taskText
  $request | & $codex.Source exec --cd $root --sandbox workspace-write - *> $logPath
  if ($LASTEXITCODE -ne 0) { throw "HOLD: Codex failed. Local diagnostic log: $logPath" }
  Write-Output "Codex edited the preview worktree. Local log: $logPath"
}
$nodeArgs = @((Join-Path $PSScriptRoot 'dev-loop/check.cjs'), "--report=$report")
if ($Full) { $nodeArgs += '--full' }
& node @nodeArgs
if ($LASTEXITCODE -ne 0) { throw "HOLD: checks failed. Report: $report" }
Write-Output "CHECK_PASS (not production release approval). Report: $report"
