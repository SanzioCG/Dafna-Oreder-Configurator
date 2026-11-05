<#
.SYNOPSIS
  Quality gate for the Dafna Configurator monorepo: lint + typecheck + test + build.

.DESCRIPTION
  Runs `pnpm run lint|typecheck|test|build` from the repository root.
  Every step runs even if an earlier one fails, so one run reports all failures.
  Exit code: 0 = all steps passed, 1 = at least one step failed, 2 = environment problem.

.PARAMETER Quiet
  Print one line per step; print a step's full output only if it fails.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1 -Quiet
#>
[CmdletBinding()]
param(
  [switch]$Quiet
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

function Resolve-Pnpm {
  $cmd = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($cmd) { return '"' + $cmd.Source + '"' }
  # corepack shim installed with --install-directory "$env:APPDATA\npm" (not always on PATH)
  $shim = Join-Path $env:APPDATA 'npm\pnpm.cmd'
  if (Test-Path -LiteralPath $shim) {
    # Root scripts call `pnpm -r ...` themselves, so the shim folder must be on PATH too.
    $env:PATH = (Split-Path -Parent $shim) + ';' + $env:PATH
    return '"' + $shim + '"'
  }
  if (Get-Command corepack -ErrorAction SilentlyContinue) { return 'corepack pnpm' }
  return $null
}

$pnpm = Resolve-Pnpm
if (-not $pnpm) {
  Write-Host 'pnpm not found. Run: corepack enable  (see README.md)' -ForegroundColor Red
  exit 2
}
if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules'))) {
  Write-Host 'node_modules missing. Run: pnpm install' -ForegroundColor Red
  exit 2
}

$steps = @('lint', 'typecheck', 'test', 'build')
$failed = @()
$total = [Diagnostics.Stopwatch]::StartNew()

foreach ($step in $steps) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  if ($Quiet) {
    # Run through cmd so stderr is merged as plain text (no PowerShell ErrorRecords).
    $output = & cmd.exe /d /s /c "$pnpm run $step 2>&1"
  }
  else {
    Write-Host "==> pnpm run $step" -ForegroundColor Cyan
    & cmd.exe /d /s /c "$pnpm run $step"
  }
  $code = $LASTEXITCODE
  $sw.Stop()
  $secs = '{0:N1}s' -f $sw.Elapsed.TotalSeconds

  if ($code -eq 0) {
    Write-Host ("[PASS] {0,-10} {1}" -f $step, $secs) -ForegroundColor Green
  }
  else {
    Write-Host ("[FAIL] {0,-10} {1}  (exit {2})" -f $step, $secs, $code) -ForegroundColor Red
    if ($Quiet) { $output | ForEach-Object { Write-Host "    $_" } }
    $failed += $step
  }
}

$total.Stop()
if ($failed.Count -gt 0) {
  Write-Host ("Gate FAILED ({0}): {1}" -f ('{0:N1}s' -f $total.Elapsed.TotalSeconds), ($failed -join ', ')) -ForegroundColor Red
  exit 1
}
Write-Host ("Gate PASSED ({0:N1}s)" -f $total.Elapsed.TotalSeconds) -ForegroundColor Green
exit 0
