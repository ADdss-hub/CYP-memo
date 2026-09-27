# CYP-memo · Windows 生产安装（非容器 · 闭集 35 · Server）
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

$stdout = Join-Path $DataDir 'logs\runtime\win-stdout.log'
$proc = Start-Process -FilePath 'node' -ArgumentList $entry -WorkingDirectory $serverDir -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stdout -PassThru
Set-Content -Path (Join-Path $DataDir 'cyp-memo.pid') -Value $proc.Id -Encoding utf8
Write-Host "[install-windows] started pid=$($proc.Id)"

# 计划任务（登录时拉起）— 幂等注册
$taskName = 'CYP-memo-server'
$action = New-ScheduledTaskAction -Execute 'node' -Argument "`"$entry`"" -WorkingDirectory $serverDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
try {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Description 'CYP-memo five centers server' | Out-Null
  Write-Host "[install-windows] scheduled task: $taskName"
} catch {
  Write-Host "[install-windows] scheduled task skipped: $($_.Exception.Message)"
}

Start-Sleep -Seconds 3
& (Join-Path $RepoRoot 'scripts\verify\verify-five-centers.ps1') -BaseUrl "http://127.0.0.1:$Port" -DataDir $DataDir
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '[install-windows] OK'
