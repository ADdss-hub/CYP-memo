# CYP-memo devloop metric recorder (Windows PowerShell) · spec 2.7
#
# A metric recorder (does NOT actually start the server or rerun tests).
# Subcommands: start / rerun / locate / fix-check / record / report
# Each call appends one line to logs/devloop-metrics.jsonl.
# result=fail also appends to logs/devloop-failures.jsonl.
param(
  [string]$Sub,
  [string]$Tag,
  [string]$Stage,
  [string]$File,
  [string]$Result = 'ok',
  [int]$DurationMs = 0,
  [string]$Since = '7d',
  [string]$Actor,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $ROOT | Out-Null

if ($Help -or -not $Sub) {
  Write-Host @'
Usage (PowerShell):
  devloop.ps1 start [-DurationMs <n>]
  devloop.ps1 rerun -Tag <tag> [-DurationMs <n>]
  devloop.ps1 locate "<error message>" [-DurationMs <n>]
  devloop.ps1 fix-check [-Result pass|fail] [-DurationMs <n>]
  devloop.ps1 record -Stage <stage> [-File <f>] [-Result <r>] [-DurationMs <n>] [-Tag <t>]
  devloop.ps1 report [-Since 7d]
'@
  if (-not $Sub) { exit 2 } else { exit 0 }
}

$COMMIT = (& git rev-parse HEAD 2>$null)
if (-not $COMMIT) { $COMMIT = 'nogit' }

$NODE_SRC = @'
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.ROOT;
const mode = process.env.DEVLOOP_MODE;
if (mode === 'report') {
  const since = process.env.SINCE || '7d';
  const m = /^(\d+)([dhw])$/.exec(since);
  if (!m) { console.error('illegal --since: ' + since); process.exit(2); }
  const unit = { d: 86400000, w: 604800000, h: 3600000 }[m[2]];
  const cutoff = Date.now() - Number(m[1]) * unit;
  const f = path.join(root, 'logs', 'devloop-metrics.jsonl');
  let rows = [];
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const s = line.trim(); if (!s) continue;
      let o; try { o = JSON.parse(s); } catch { continue; }
      if (Date.parse(o.ts) >= cutoff) rows.push(o);
    }
  }
  const stages = {};
  for (const r of rows) { (stages[r.stage] ||= { n: 0, dur: 0, fail: 0 }); stages[r.stage].n++; stages[r.stage].dur += r.duration_ms; if (r.result === 'fail') stages[r.stage].fail++; }
  const thr = { cold_start: 120000, hot_reload: 5000, rerun: 30000, locate: 60000, fix_check: 300000 };
  const pad = (s,n)=>String(s).padStart(n);
  console.log('Devloop weekly report (since=' + since + ', window events=' + rows.length + ')');
  console.log(pad('stage',12), pad('count',6), pad('avg_ms',10), pad('fail',5), 'threshold');
  for (const st of ['cold_start','hot_reload','rerun','locate','fix_check']) {
    const s = stages[st]; if (!s) continue;
    const avg = Math.round(s.dur / s.n);
    const ok = avg <= thr[st];
    console.log(pad(st,12), pad(s.n,6), pad(avg,10), pad(s.fail,5), thr[st] + 'ms ' + (ok?'OK':'OVER'));
  }
  const failRate = rows.length ? (rows.filter(r=>r.result==='fail').length/rows.length*100).toFixed(1)+'%' : 'n/a';
  const doneRate = rows.length ? (rows.filter(r=>r.result!=='fail').length/rows.length*100).toFixed(1)+'%' : 'n/a';
  console.log('verify fail rate :', failRate, '(threshold <=10%)');
  console.log('Devloop done rate:', doneRate, '(threshold >=80%)');
  process.exit(0);
}
const ts = new Date().toISOString();
const trace = require('crypto').randomBytes(8).toString('hex');
const row = {
  ts,
  commit_sha: process.env.COMMIT,
  file: process.env.FILE || '',
  stage: process.env.STAGE,
  duration_ms: Number(process.env.DUR) || 0,
  result: process.env.RESULT || 'ok',
  actor: process.env.ACTOR || 'ci',
  trace_id: trace
};
fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
fs.appendFileSync(path.join(root, 'logs', 'devloop-metrics.jsonl'), JSON.stringify(row) + '\n');
if ((process.env.RESULT || 'ok') === 'fail') {
  fs.appendFileSync(path.join(root, 'logs', 'devloop-failures.jsonl'), JSON.stringify({ ...row, event: 'failure' }) + '\n');
}
process.stdout.write('recorded: ' + JSON.stringify(row) + '\n');
'@

function Invoke-DevloopNode {
  param([string]$Mode)
  $tmp = Join-Path $env:TEMP ("cyp-devloop-" + $PID + ".mjs")
  Set-Content -Path $tmp -Value $NODE_SRC -Encoding utf8 -NoNewline
  $env:ROOT = $ROOT
  $env:COMMIT = $COMMIT
  $env:DEVLOOP_MODE = $Mode
  $env:STAGE = $Stage
  $env:FILE = $File
  $env:RESULT = $Result
  $env:DUR = [string]$DurationMs
  $env:SINCE = $Since
  $env:ACTOR = if ($Actor) { $Actor } else { $env:USERNAME }
  try {
    Get-Content -Raw $tmp | & node -
    exit $LASTEXITCODE
  } finally {
    Remove-Item -Path $tmp -Force -ErrorAction SilentlyContinue
    Pop-Location | Out-Null
  }
}

switch ($Sub) {
  'start' {
    if ($DurationMs -eq 0 -and (Test-Path "$ROOT/logs/start-time.json")) {
      $DurationMs = [int]((Get-Content "$ROOT/logs/start-time.json" -Raw | ConvertFrom-Json).cold_start_ms)
      if (-not $DurationMs) { $DurationMs = 0 }
    }
    $Stage = 'cold_start'; $File = 'start-time.json'; $Result = 'ok'
    Invoke-DevloopNode -Mode 'emit'
  }
  'rerun' {
    if (-not $Tag) { [Console]::Error.WriteLine('FAIL: rerun requires -Tag'); exit 2 }
    $Stage = 'rerun'; $File = $Tag; $Result = 'ok'
    Invoke-DevloopNode -Mode 'emit'
  }
  'locate' {
    if (-not $File) { [Console]::Error.WriteLine('FAIL: locate requires an error message as -File'); exit 2 }
    $Stage = 'locate'; $Result = 'found'
    if ($File.Length -gt 200) { $File = $File.Substring(0,200) }
    Invoke-DevloopNode -Mode 'emit'
  }
  'fix-check' {
    $Stage = 'fix_check'; if (-not $Result) { $Result = 'pass' }
    Invoke-DevloopNode -Mode 'emit'
  }
  'record' {
    if (-not $Stage) { [Console]::Error.WriteLine('FAIL: record requires -Stage'); exit 2 }
    if ($Tag) { $File = $Tag }
    Invoke-DevloopNode -Mode 'emit'
  }
  'report' { Invoke-DevloopNode -Mode 'report' }
  default { [Console]::Error.WriteLine("unknown subcommand: $Sub"); exit 2 }
}
