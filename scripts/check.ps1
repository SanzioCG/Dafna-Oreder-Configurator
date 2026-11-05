<#
.SYNOPSIS
  Quality gate for the Dafna Configurator monorepo: lint + typecheck + test + build.

.DESCRIPTION
  Runs `pnpm run lint|typecheck|test|build` from the repository root.
  Every step runs even if an earlier one fails, so one run reports all failures.
  Exit code: 0 = all steps passed, 1 = at least one step failed (or timed out),
  2 = environment problem (pnpm or node_modules missing).

  Environment-independent: pnpm is resolved explicitly to an executable that cmd.exe can run
  (pnpm.cmd / pnpm.exe on PATH, the corepack shim in %APPDATA%\npm, or `corepack pnpm`).
  pnpm.ps1 is never used: cmd.exe cannot run a .ps1 (it would open it in an editor and hang).
  Each step has a timeout; a step that exceeds it is killed (whole process tree) and fails.

.PARAMETER Quiet
  Print one line per step; print a step's full output only if it fails.

.PARAMETER StepTimeoutSec
  Maximum seconds per step (default 600).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1 -Quiet
#>
[CmdletBinding()]
param(
  [switch]$Quiet,
  [int]$StepTimeoutSec = 600
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

<#
  Returns the command line prefix that runs pnpm from cmd.exe, or $null.
  Only .cmd / .exe launchers are accepted (never pnpm.ps1).
#>
function Resolve-Pnpm {
  foreach ($name in @('pnpm.cmd', 'pnpm.exe')) {
    $cmd = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($cmd) { return @{ Line = '"' + $cmd.Source + '"'; Dir = Split-Path -Parent $cmd.Source } }
  }
  # corepack shim installed with --install-directory "$env:APPDATA\npm" (not always on PATH)
  $shim = Join-Path $env:APPDATA 'npm\pnpm.cmd'
  if (Test-Path -LiteralPath $shim) { return @{ Line = '"' + $shim + '"'; Dir = Split-Path -Parent $shim } }
  $corepack = Get-Command 'corepack.cmd', 'corepack.exe' -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($corepack) { return @{ Line = '"' + $corepack.Source + '" pnpm'; Dir = $null } }
  return $null
}

$pnpm = Resolve-Pnpm
if (-not $pnpm) {
  Write-Host 'pnpm not found (looked for pnpm.cmd / pnpm.exe on PATH, %APPDATA%\npm\pnpm.cmd, corepack).' -ForegroundColor Red
  Write-Host 'Fix: install Node.js >= 20, then run:  corepack enable   (see README.md)' -ForegroundColor Red
  exit 2
}
# Root scripts call `pnpm -r ...` themselves: the launcher's folder must be on PATH for cmd.exe.
if ($pnpm.Dir -and -not (($env:PATH -split ';') -contains $pnpm.Dir)) {
  $env:PATH = $pnpm.Dir + ';' + $env:PATH
}
if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules'))) {
  Write-Host 'node_modules missing. Run: pnpm install' -ForegroundColor Red
  exit 2
}

<# Runs one pnpm script with a timeout; returns @{ Code; Output; TimedOut }. #>
function Invoke-Step([string]$step) {
  $log = [IO.Path]::GetTempFileName()
  try {
    # Output goes to a file (not a pipe), so a chatty step can never block on a full buffer.
    $cmdArgs = '/d /s /c "' + $pnpm.Line + ' run ' + $step + ' > "' + $log + '" 2>&1"'
    $p = Start-Process -FilePath 'cmd.exe' -ArgumentList $cmdArgs -WorkingDirectory $root `
      -NoNewWindow -PassThru
    $null = $p.Handle # keeps ExitCode available after exit
    if (-not $p.WaitForExit($StepTimeoutSec * 1000)) {
      & taskkill.exe /T /F /PID $p.Id *> $null
      return @{ Code = 124; Output = (Get-Content -LiteralPath $log -ErrorAction SilentlyContinue); TimedOut = $true }
    }
    $p.WaitForExit()
    return @{ Code = $p.ExitCode; Output = (Get-Content -LiteralPath $log -ErrorAction SilentlyContinue); TimedOut = $false }
  }
  finally {
    Remove-Item -LiteralPath $log -ErrorAction SilentlyContinue
  }
}

$steps = @('lint', 'typecheck', 'test', 'build')
$failed = @()
$total = [Diagnostics.Stopwatch]::StartNew()

foreach ($step in $steps) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  if (-not $Quiet) { Write-Host "==> pnpm run $step" -ForegroundColor Cyan }
  $r = Invoke-Step $step
  $sw.Stop()
  $secs = '{0:N1}s' -f $sw.Elapsed.TotalSeconds
  if (-not $Quiet) { $r.Output | ForEach-Object { Write-Host $_ } }

  if ($r.Code -eq 0) {
    Write-Host ("[PASS] {0,-10} {1}" -f $step, $secs) -ForegroundColor Green
  }
  else {
    $why = if ($r.TimedOut) { "timed out after ${StepTimeoutSec}s" } else { "exit $($r.Code)" }
    Write-Host ("[FAIL] {0,-10} {1}  ({2})" -f $step, $secs, $why) -ForegroundColor Red
    if ($Quiet) { $r.Output | ForEach-Object { Write-Host "    $_" } }
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
