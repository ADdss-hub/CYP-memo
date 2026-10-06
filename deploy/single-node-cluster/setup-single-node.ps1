# =============================================================================
# CYP-memo · 单节点集群一键部署脚本（Windows）
# =============================================================================
# 核心原则：单节点不是简化版，而是最小完整集群。
#   即使一台机器，也要跑完整的 Consul + Nomad + 服务网格，
#   用 Nomad 管理所有服务。
#
# 功能：
#   1. 检查依赖（Docker Desktop / Nomad / Consul）
#   2. 生成 Nomad 单节点配置（server + client 同机）
#   3. 生成 Consul 单节点配置（server 模式，bootstrap_expect=1）
#   4. 启动 Consul
#   5. 启动 Nomad
#   6. 等待集群就绪
#   7. 部署 CYP-memo 服务（nomad job run）
#   8. 验证所有服务健康
#   9. 输出访问地址
#
# 使用：
#   .\deploy\single-node-cluster\setup-single-node.ps1
#   .\deploy\single-node-cluster\setup-single-node.ps1 -ImageTag v2.0.0
#   .\deploy\single-node-cluster\setup-single-node.ps1 -EnableMCP $false
# =============================================================================

[CmdletBinding()]
param(
  [string]$ImageTag = "latest",
  [string]$ImageRegistry = "registry.example.com/cyp-memo",
  [bool]$EnableMCP = $true,
  [bool]$EnableKMS = $false,
  [string]$DataDir = "C:\cyp-memo\data",
  [string]$ConsulDataDir = "C:\ProgramData\consul\data",
  [string]$NomadDataDir = "C:\ProgramData\nomad\data",
  [int]$WaitTimeout = 120
)

# ---- 严格模式 ----
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---- 脚本根目录 ----
$ScriptRoot = $PSScriptRoot
$ProjectRoot = Resolve-Path (Join-Path $ScriptRoot '..\..')
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " CYP-memo · 单节点集群部署（Windows）" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "项目根目录: $ProjectRoot"
Write-Host ""

# =============================================================================
# 步骤 1：检查依赖
# =============================================================================
Write-Host "[1/10] 检查依赖..." -ForegroundColor Yellow

$missingDeps = @()

# --- Docker Desktop ---
$dockerOk = $false
try {
  $dockerVer = & docker --version 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Docker: $dockerVer" -ForegroundColor Green
    $dockerOk = $true
  }
} catch {
  $dockerOk = $false
}
if (-not $dockerOk) {
  Write-Host "  [缺失] Docker Desktop 未安装或未启动" -ForegroundColor Red
  Write-Host "         下载地址: https://www.docker.com/products/docker-desktop/"
  Write-Host "         安装后请启动 Docker Desktop 并确保 Linux 容器模式"
  $missingDeps += "Docker Desktop"
}

# --- Consul ---
$consulOk = $false
try {
  $consulVer = & consul version 2>&1 | Select-Object -First 1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Consul: $consulVer" -ForegroundColor Green
    $consulOk = $true
  }
} catch {
  $consulOk = $false
}
if (-not $consulOk) {
  Write-Host "  [缺失] Consul 未安装" -ForegroundColor Red
  Write-Host "         下载地址: https://developer.hashicorp.com/consul/downloads"
  Write-Host "         安装后将 consul.exe 加入 PATH"
  $missingDeps += "Consul"
}

# --- Nomad ---
$nomadOk = $false
try {
  $nomadVer = & nomad version 2>&1 | Select-Object -First 1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Nomad: $nomadVer" -ForegroundColor Green
    $nomadOk = $true
  }
} catch {
  $nomadOk = $false
}
if (-not $nomadOk) {
  Write-Host "  [缺失] Nomad 未安装" -ForegroundColor Red
  Write-Host "         下载地址: https://developer.hashicorp.com/nomad/downloads"
  Write-Host "         安装后将 nomad.exe 加入 PATH"
  $missingDeps += "Nomad"
}

if ($missingDeps.Count -gt 0) {
  Write-Host ""
  Write-Host "ERROR: 缺少以下依赖，请先安装后再运行本脚本：" -ForegroundColor Red
  $missingDeps | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  Write-Host ""
  Write-Host "如果不想安装 Nomad/Consul，可使用 Docker Compose 备选方案：" -ForegroundColor Yellow
  Write-Host "  docker compose -f deploy/single-node-cluster/docker-compose.unified.yml up -d" -ForegroundColor Yellow
  exit 1
}

Write-Host ""

# =============================================================================
# 步骤 2-3：生成配置文件
# =============================================================================
Write-Host "[2/10] 生成 Consul 单节点配置..." -ForegroundColor Yellow
Write-Host "[3/10] 生成 Nomad 单节点配置..." -ForegroundColor Yellow

# 使用项目中已有的配置模板，复制一份到工作目录
$consulConfigSrc = Join-Path $ProjectRoot "deploy\consul\consul-single-node.hcl"
$nomadConfigSrc  = Join-Path $ProjectRoot "deploy\nomad\nomad-single-node.hcl"

if (-not (Test-Path $consulConfigSrc)) {
  Write-Host "ERROR: Consul 配置模板不存在: $consulConfigSrc" -ForegroundColor Red
  exit 1
}
if (-not (Test-Path $nomadConfigSrc)) {
  Write-Host "ERROR: Nomad 配置模板不存在: $nomadConfigSrc" -ForegroundColor Red
  exit 1
}

# 确保数据目录存在
New-Item -ItemType Directory -Force -Path $ConsulDataDir | Out-Null
New-Item -ItemType Directory -Force -Path $NomadDataDir | Out-Null
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

# 生成运行时配置（Windows 路径适配）
$consulRuntime = Join-Path $ScriptRoot "runtime-consul.hcl"
$nomadRuntime  = Join-Path $ScriptRoot "runtime-nomad.hcl"

# 替换数据目录路径
$consulContent = Get-Content -LiteralPath $consulConfigSrc -Raw
$consulContent = $consulContent -replace 'data_dir\s*=\s*"/opt/consul/data"', "data_dir = `"$($ConsulDataDir -replace '\\','/')`""
$consulContent | Set-Content -LiteralPath $consulRuntime -Encoding UTF8
Write-Host "  Consul 运行时配置: $consulRuntime" -ForegroundColor Green

$nomadContent = Get-Content -LiteralPath $nomadConfigSrc -Raw
$nomadContent = $nomadContent -replace 'data_dir\s*=\s*"/opt/nomad/data"', "data_dir = `"$($NomadDataDir -replace '\\','/')`""
# Windows 下注释掉 host_network（依赖 Linux 网卡名）
$nomadContent = $nomadContent -replace '(host_network "public" \{)', '# $1 (Windows: 使用默认网络)'
$nomadContent = $nomadContent -replace '(host_network "private" \{)', '# $1 (Windows: 使用默认网络)'
$nomadContent | Set-Content -LiteralPath $nomadRuntime -Encoding UTF8
Write-Host "  Nomad 运行时配置: $nomadRuntime" -ForegroundColor Green

Write-Host ""

# =============================================================================
# 步骤 4：启动 Consul
# =============================================================================
Write-Host "[4/10] 启动 Consul（单节点 server 模式）..." -ForegroundColor Yellow

# 检查是否已在运行
$consulRunning = $false
try {
  $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8500/v1/status/leader" -UseBasicParsing -TimeoutSec 3
  if ($resp.StatusCode -eq 200 -and $resp.Content -ne '""') {
    $consulRunning = $true
    Write-Host "  Consul 已在运行，跳过启动" -ForegroundColor Green
  }
} catch {
  $consulRunning = $false
}

if (-not $consulRunning) {
  # 以后台进程启动 Consul
  $consulLog = Join-Path $ScriptRoot "consul.log"
  Write-Host "  启动 Consul，日志: $consulLog"

  $consulArgs = @(
    "agent",
    "-config-file=$consulRuntime"
  )

  Start-Process -FilePath "consul.exe" -ArgumentList $consulArgs `
    -RedirectStandardOutput $consulLog -RedirectStandardError "$consulLog.err" `
    -WindowStyle Hidden -PassThru | Out-Null

  # 等待 Consul 就绪
  Write-Host "  等待 Consul 启动..."
  $deadline = (Get-Date).AddSeconds($WaitTimeout)
  $consulReady = $false
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8500/v1/status/leader" -UseBasicParsing -TimeoutSec 2
      if ($resp.StatusCode -eq 200 -and $resp.Content -ne '""') {
        $consulReady = $true
        break
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  if (-not $consulReady) {
    Write-Host "ERROR: Consul 启动超时（$WaitTimeout 秒）" -ForegroundColor Red
    Write-Host "  请查看日志: $consulLog"
    exit 1
  }
  Write-Host "  Consul 已就绪（leader 选举完成）" -ForegroundColor Green
}

Write-Host ""

# =============================================================================
# 步骤 5：启动 Nomad
# =============================================================================
Write-Host "[5/10] 启动 Nomad（单节点 server + client）..." -ForegroundColor Yellow

# 检查是否已在运行
$nomadRunning = $false
try {
  $resp = Invoke-WebRequest -Uri "http://127.0.0.1:4646/v1/status/leader" -UseBasicParsing -TimeoutSec 3
  if ($resp.StatusCode -eq 200 -and $resp.Content -ne '""') {
    $nomadRunning = $true
    Write-Host "  Nomad 已在运行，跳过启动" -ForegroundColor Green
  }
} catch {
  $nomadRunning = $false
}

if (-not $nomadRunning) {
  $nomadLog = Join-Path $ScriptRoot "nomad.log"
  Write-Host "  启动 Nomad，日志: $nomadLog"

  $nomadArgs = @(
    "agent",
    "-config=$nomadRuntime"
  )

  Start-Process -FilePath "nomad.exe" -ArgumentList $nomadArgs `
    -RedirectStandardOutput $nomadLog -RedirectStandardError "$nomadLog.err" `
    -WindowStyle Hidden -PassThru | Out-Null

  # 等待 Nomad Server 就绪
  Write-Host "  等待 Nomad Server 启动..."
  $deadline = (Get-Date).AddSeconds($WaitTimeout)
  $nomadReady = $false
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri "http://127.0.0.1:4646/v1/status/leader" -UseBasicParsing -TimeoutSec 2
      if ($resp.StatusCode -eq 200 -and $resp.Content -ne '""') {
        $nomadReady = $true
        break
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  if (-not $nomadReady) {
    Write-Host "ERROR: Nomad 启动超时（$WaitTimeout 秒）" -ForegroundColor Red
    Write-Host "  请查看日志: $nomadLog"
    exit 1
  }
  Write-Host "  Nomad Server 已就绪" -ForegroundColor Green
}

Write-Host ""

# =============================================================================
# 步骤 6：等待集群就绪（Client 节点注册 + Consul 集成）
# =============================================================================
Write-Host "[6/10] 等待集群就绪..." -ForegroundColor Yellow

$deadline = (Get-Date).AddSeconds($WaitTimeout)
$clusterReady = $false
while ((Get-Date) -lt $deadline) {
  try {
    $nodesResp = Invoke-WebRequest -Uri "http://127.0.0.1:4646/v1/nodes" -UseBasicParsing -TimeoutSec 2
    $nodes = $nodesResp.Content | ConvertFrom-Json
    $readyNodes = @($nodes | Where-Object { $_.Status -eq "ready" })
    if ($readyNodes.Count -ge 1) {
      Write-Host "  Nomad Client 节点已就绪: $($readyNodes.Count) 个 ready" -ForegroundColor Green
      $clusterReady = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 3
  }
}

if (-not $clusterReady) {
  Write-Host "WARNING: Nomad Client 节点就绪超时，继续下一步..." -ForegroundColor Yellow
}

# 验证 Consul 成员
try {
  $membersResp = Invoke-WebRequest -Uri "http://127.0.0.1:8500/v1/agent/members" -UseBasicParsing -TimeoutSec 2
  $members = $membersResp.Content | ConvertFrom-Json
  Write-Host "  Consul 集群成员: $($members.Count) 个" -ForegroundColor Green
} catch {
  Write-Host "  WARNING: 无法查询 Consul 成员" -ForegroundColor Yellow
}

Write-Host ""

# =============================================================================
# 步骤 7：部署 CYP-memo 服务
# =============================================================================
Write-Host "[7/10] 部署 CYP-memo 服务（Nomad Job）..." -ForegroundColor Yellow

$jobFile = Join-Path $ProjectRoot "deploy\nomad\cyp-memo-server.nomad"
if (-not (Test-Path $jobFile)) {
  Write-Host "ERROR: Nomad Job 文件不存在: $jobFile" -ForegroundColor Red
  exit 1
}

# 设置环境变量供 nomad 命令使用
$env:NOMAD_ADDR = "http://127.0.0.1:4646"

# 运行 job
$runArgs = @(
  "job", "run",
  "-var=`"image_registry=$ImageRegistry`"",
  "-var=`"image_tag=$ImageTag`"",
  "-var=`"enable_mcp=`$$EnableMCP`"",
  "-var=`"enable_kms=`$$EnableKMS`"",
  "-var=`"api_count=1`"",
  "-var=`"gateway_count=1`"",
  "-var=`"mcp_count=1`""
)

# 由于单节点约束，需要移除 distinct_hosts 约束
# 创建单节点适配版 job spec
$singleNodeJob = Join-Path $ScriptRoot "cyp-memo-single-node.nomad"
$jobContent = Get-Content -LiteralPath $jobFile -Raw

# 移除 Linux 内核约束（Windows 单节点可能用 Docker Desktop 的 Linux 容器）
# 但保留 distinct_hosts 的处理：单节点下需要关闭，否则所有 group 无法调度
$jobContent = $jobContent -replace 'constraint \{\s*\n\s*operator\s*=\s*"distinct_hosts"\s*\n\s*value\s*=\s*"true"\s*\n\s*\}', @'
# 单节点集群：关闭 distinct_hosts 约束（同机部署所有 group）
  constraint {
    operator  = "distinct_hosts"
    value     = "false"
  }
'@

$jobContent | Set-Content -LiteralPath $singleNodeJob -Encoding UTF8

Write-Host "  提交 Nomad Job: cyp-memo"
& nomad job run $singleNodeJob
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: Nomad Job 提交失败" -ForegroundColor Red
  exit 1
}
Write-Host "  Job 提交成功" -ForegroundColor Green

Write-Host ""

# =============================================================================
# 步骤 8：验证服务健康
# =============================================================================
Write-Host "[8/10] 验证服务健康..." -ForegroundColor Yellow

$deadline = (Get-Date).AddSeconds($WaitTimeout * 2)  # 部署需要更长时间
$allHealthy = $false

Write-Host "  等待服务部署完成（可能需要几分钟拉取镜像）..."

while ((Get-Date) -lt $deadline) {
  try {
    $jobStatus = & nomad job status cyp-memo 2>&1
    $deployments = & nomad job status -json cyp-memo 2>&1 | ConvertFrom-Json

    # 简单检查：通过 Consul 健康检查
    $consulServices = Invoke-WebRequest -Uri "http://127.0.0.1:8500/v1/health/service/cyp-memo-gateway?passing" -UseBasicParsing -TimeoutSec 2
    $gatewayHealthy = ($consulServices.Content | ConvertFrom-Json).Count -gt 0

    if ($gatewayHealthy) {
      Write-Host "  Gateway 服务健康检查通过" -ForegroundColor Green
    }

    # 检查 API
    try {
      $apiHealth = Invoke-WebRequest -Uri "http://127.0.0.1:8500/v1/health/service/cyp-memo-api?passing" -UseBasicParsing -TimeoutSec 2
      $apiHealthy = ($apiHealth.Content | ConvertFrom-Json).Count -gt 0
      if ($apiHealthy) {
        Write-Host "  API 服务健康检查通过" -ForegroundColor Green
      }
    } catch {
      $apiHealthy = $false
    }

    # 检查 MCP（如果启用）
    $mcpHealthy = $true
    if ($EnableMCP) {
      try {
        $mcpHealth = Invoke-WebRequest -Uri "http://127.0.0.1:8500/v1/health/service/cyp-memo-mcp?passing" -UseBasicParsing -TimeoutSec 2
        $mcpHealthy = ($mcpHealth.Content | ConvertFrom-Json).Count -gt 0
        if ($mcpHealthy) {
          Write-Host "  MCP 服务健康检查通过" -ForegroundColor Green
        }
      } catch {
        $mcpHealthy = $false
      }
    }

    if ($gatewayHealthy -and $apiHealthy -and $mcpHealthy) {
      $allHealthy = $true
      break
    }
  } catch {
    # 继续等待
  }

  Start-Sleep -Seconds 5
  Write-Host "  等待中..." -NoNewline
  Write-Host "`r  等待中...  " -NoNewline
}

if (-not $allHealthy) {
  Write-Host ""
  Write-Host "WARNING: 服务健康检查超时，请手动检查：" -ForegroundColor Yellow
  Write-Host "  nomad job status cyp-memo"
  Write-Host "  consul catalog services"
}

Write-Host ""

# =============================================================================
# 步骤 9-10：输出访问地址
# =============================================================================
Write-Host "[9/10] 单节点集群部署完成！" -ForegroundColor Green
Write-Host "[10/10] 访问地址汇总：" -ForegroundColor Green
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  CYP-memo 单节点集群 · 访问地址" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  产品入口（网关）:   http://127.0.0.1:5170" -ForegroundColor White
Write-Host ""
Write-Host "  Consul UI:         http://127.0.0.1:8500" -ForegroundColor White
Write-Host "  Consul DNS:        127.0.0.1:8600"
Write-Host ""
Write-Host "  Nomad UI:          http://127.0.0.1:4646" -ForegroundColor White
Write-Host ""
Write-Host "  运维命令："
Write-Host "    consul members              # 查看集群成员"
Write-Host "    nomad node status           # 查看节点状态"
Write-Host "    nomad job status cyp-memo   # 查看服务状态"
Write-Host ""
Write-Host "  数据目录: $DataDir"
Write-Host "  Consul 数据: $ConsulDataDir"
Write-Host "  Nomad 数据: $NomadDataDir"
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  提示：单节点是最小完整集群，扩容指南见 docs/scaling-guide.md" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan
