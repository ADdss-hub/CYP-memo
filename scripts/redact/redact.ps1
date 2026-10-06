# CYP-memo redaction single entry point (Windows PowerShell) · spec 2.8 / AP-13 / LC07
#
# Performs true content replacement (not line deletion). Mirrors scripts/redact/redact.sh.
# Levels: strict (default) | normal | off. Exit codes 0/3/2/4 same as shell version.
# The actual replacement is delegated to node (temp .mjs written to $env:TEMP, removed after).
#
# Usage:
#   .\scripts\redact\redact.ps1 -In <file> -Out <file> [-Level strict|normal|off]
#   .\scripts\redact\redact.ps1 -InPlace <file>            [-Level strict|normal|off]
#   .\scripts\redact\redact.ps1 -Scan <dir>                [-Level strict|normal|off]
#   .\scripts\redact\redact.ps1 -Help
#
# Env vars:
#   $env:START_LOCAL_REDACT_LEVEL  strict|normal|off (default strict; illegal -> exit 2)
#   $env:START_LOCAL_NO_TELEMETRY  1 disables the redaction audit line
param(
  [string]$In,
  [string]$Out,
  [string]$InPlace,
  [string]$Scan,
  [string]$Level,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $ROOT | Out-Null

if ($Help) {
  Write-Host @'
Usage:
  redact.ps1 -In <file> -Out <file> [-Level strict|normal|off]
  redact.ps1 -InPlace <file>            [-Level strict|normal|off]
  redact.ps1 -Scan <dir>                [-Level strict|normal|off]
  redact.ps1 -Help

Env:
  START_LOCAL_REDACT_LEVEL  strict|normal|off (default strict; illegal -> exit 2)
  START_LOCAL_NO_TELEMETRY  1 disables the redaction audit line
'@
  exit 0
}

if (-not $Level) {
  if ($env:START_LOCAL_REDACT_LEVEL) { $Level = $env:START_LOCAL_REDACT_LEVEL } else { $Level = 'strict' }
}
$Level = $Level.ToLower()
if ($Level -notin @('strict','normal','off')) {
  [Console]::Error.WriteLine("FAIL: illegal level '$Level' (allowed: strict|normal|off)")
  exit 2
}

$MODE = 'file'
if ($InPlace) { $MODE = 'file'; $In = $InPlace; $Out = $InPlace }
elseif ($Scan) { $MODE = 'scan' }
elseif ($In -and $Out) { $MODE = 'file' }
else {
  [Console]::Error.WriteLine('FAIL: require -In/-Out, -InPlace, or -Scan'); exit 2
}

if ($env:START_LOCAL_NO_TELEMETRY -eq '1') { $AUDIT = '0' } else { $AUDIT = '1' }

# Paths are already Windows-native in PowerShell, no conversion needed.
$IN_WIN = $In
$OUT_WIN = $Out
$SCAN_WIN = $Scan

# ----- embedded node redaction core -----
$NODE_SRC = @'
const fs = require('node:fs');
const path = require('node:path');

const mode = process.env.MODE;
const level = (process.env.LEVEL || 'strict').toLowerCase();
const enabled = level === 'off' ? null
  : level === 'normal' ? ['secret','phone','email']
  : ['secret','phone','email','id','bank'];

const isText = (s) => !s.includes('\u0000');

function redactSecrets(t) {
  t = t.replace(/(password|passwd|pwd|token|secret|apikey|api_key|authorization|jwt)(["'\s]*[:=]["'\s]*)(["'])(?:\\.|[^"'])*\3/gi,
    (m, k, sep, q) => k + sep + q + '***' + q);
  t = t.replace(/(password|passwd|pwd|token|secret|apikey|api_key|authorization|jwt)(["'\s]*[:=]["'\s]*)([^\s"',;}{]+)/gi,
    (m, k, sep) => k + sep + '***');
  return t;
}
const redactPhone = (t) => t.replace(/(?<![0-9a-fA-F.])(1[3-9]\d{9})(?![0-9a-fA-F.])/g, '***');
const redactEmail = (t) => t.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '***');
const redactId    = (t) => t.replace(/(?<![0-9a-fA-F.])(\d{17}[\dXx])(?![0-9a-fA-F.])/g, '***');
const redactBank  = (t) => t.replace(/(?<![0-9a-fA-F.])(\d{16,19})(?![0-9a-fA-F.])/g, (m) => {
  let sum = 0, alt = false;
  for (let i = m.length - 1; i >= 0; i--) { let d = +m[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; alt = !alt; }
  return (sum % 10 === 0) ? '***' : m;
});

function redact(t) {
  if (!enabled) return t;
  if (enabled.includes('secret')) t = redactSecrets(t);
  if (enabled.includes('phone'))  t = redactPhone(t);
  if (enabled.includes('email'))  t = redactEmail(t);
  if (enabled.includes('id'))     t = redactId(t);
  if (enabled.includes('bank'))   t = redactBank(t);
  return t;
}

function audit(row) {
  if (process.env.AUDIT !== '1') return;
  const p = path.join(process.env.REPO_ROOT || process.cwd(), 'logs', 'redact-audit.jsonl');
  try { fs.appendFileSync(p, JSON.stringify(row) + '\n'); } catch {}
}

if (mode === 'scan') {
  const dir = process.env.SCAN;
  let total = 0, changed = 0, failed = 0;
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch { failed++; return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === '.git' || e.name === 'node_modules') continue;
        walk(p);
      } else if (e.isFile()) {
        let txt;
        try { txt = fs.readFileSync(p, 'utf8'); } catch { failed++; continue; }
        if (!isText(txt)) continue;
        const out = redact(txt);
        if (out !== txt) {
          try { fs.writeFileSync(p, out); changed++; total++; }
          catch { failed++; }
        } else total++;
      }
    }
  };
  walk(dir);
  audit({ ts: new Date().toISOString(), event: 'redact_scan', level, dir, total, changed, failed });
  process.stdout.write('scan: files=' + total + ' redacted=' + changed + ' failed=' + failed + '\n');
  process.exit(failed > 0 ? 4 : 0);
} else {
  const infile = process.argv[2];
  const outfile = process.argv[3];
  let txt;
  try { txt = fs.readFileSync(infile, 'utf8'); }
  catch (e) { process.stderr.write('read fail: ' + e.message + '\n'); process.exit(4); }
  if (!isText(txt)) { process.stderr.write('binary file skipped: ' + infile + '\n'); process.exit(4); }
  const out = redact(txt);
  try { fs.writeFileSync(outfile, out); }
  catch (e) { process.stderr.write('write fail: ' + e.message + '\n'); process.exit(4); }
  audit({ ts: new Date().toISOString(), event: 'redact_file', level, in: infile, out: outfile, changed: out !== txt });
  if (level === 'off') process.exit(0);
  process.exit(out !== txt ? 0 : 3);
}
'@

$tmp = Join-Path $env:TEMP ("cyp-redact-" + $PID + ".mjs")
Set-Content -Path $tmp -Value $NODE_SRC -Encoding utf8 -NoNewline
$env:REPO_ROOT = $ROOT
$env:MODE = $MODE
$env:LEVEL = $Level
$env:AUDIT = $AUDIT
$env:SCAN = $SCAN_WIN
try {
  Get-Content -Raw $tmp | & node - $IN_WIN $OUT_WIN
  exit $LASTEXITCODE
} finally {
  Remove-Item -Path $tmp -Force -ErrorAction SilentlyContinue
  Pop-Location | Out-Null
}
