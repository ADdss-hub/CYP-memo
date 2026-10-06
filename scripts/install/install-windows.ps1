# CYP-memo · Windows 生产安装（闭集 35 · Server）
# 用法: powershell -File scripts/install/install-windows.ps1 -InstallDir <路径> [-DataDir <路径>]
param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,
  [string]$DataDir = '',
  [int]$Port = 5170
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$InstallDir = (Resolve-Path $InstallDir).Path
if (-not $DataDir) { $DataDir = Join-Path $InstallDir 'data' }

New-Item -ItemType Directory -Force -Path $DataDir, (Join-Path $DataDir 'logs'), (Join-Path $DataDir 'governance'), (Join-Path $DataDir 'logs\runtime') | Out-Null

$envFile = Join-Path $InstallDir '.env'
@"
APP_ENV=prod
NODE_ENV=production
PORT=$Port
DATA_DIR=$DataDir
LOG_LEVEL=info
TZ=Asia/Shanghai
"@ | Set-Content -Path $envFile -Encoding utf8

$serverDir = Join-Path $InstallDir 'packages\server'
if (-not (Test-Path (Join-Path $serverDir 'dist\index.js'))) {
  $serverDir = $InstallDir
}
$entry = Join-Path $serverDir 'dist\index.js'
if (-not (Test-Path $entry)) {
  Write-Error '[install-windows] 缺少 dist/index.js'
}

$env:APP_ENV = 'prod'
$env:NODE_ENV = 'production'
$env:DATA_DIR = $DataDir
$env:PORT = "$Port"

$scm = Join-Path $RepoRoot 'scripts\start\register-windows-scm.ps1'
$scmOk = $false
try {
  & $scm -InstallDir $InstallDir -Port "$Port"
  if ($LASTEXITCODE -eq 0) { $scmOk = $true }
} catch {
  Write-Host "[install-windows] SCM register skipped: $($_.Exception.Message)"
}

if (-not $scmOk) {
  $stdout = Join-Path $DataDir 'logs\runtime\win-stdout.log'
  $proc = Start-Process -FilePath 'node' -ArgumentList @('--conditions=cyp-node', $entry) -WorkingDirectory $serverDir -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stdout -PassThru
  Set-Content -Path (Join-Path $DataDir 'cyp-memo.pid') -Value $proc.Id -Encoding utf8
  Write-Host "[install-windows] started pid=$($proc.Id) (SCM tool missing; process fallback)"
}

$readyUrl = "https://127.0.0.1:$Port/healthz/ready"
$deadline = (Get-Date).AddSeconds(120)
$ready = $false
while ((Get-Date) -lt $deadline) {
  try {
    $code = 0
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
      & curl.exe -k -fsS --max-time 3 -o NUL -w '%{http_code}' $readyUrl 2>$null | ForEach-Object { $code = [int]$_ }
    }
    if ($code -eq 200) { $ready = $true; break }
  } catch { }
  Start-Sleep -Seconds 2
}
if (-not $ready) { Write-Error "[install-windows] ready probe timeout: $readyUrl" }

& (Join-Path $RepoRoot 'scripts\verify\verify-five-centers.ps1') -BaseUrl "https://127.0.0.1:$Port" -DataDir $DataDir
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '[install-windows] OK'
