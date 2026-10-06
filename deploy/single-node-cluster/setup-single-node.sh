#!/usr/bin/env bash
# =============================================================================
# CYP-memo · 单节点集群一键部署脚本（Linux / macOS）
# =============================================================================
# 核心原则：单节点不是简化版，而是最小完整集群。
#   即使一台机器，也要跑完整的 Consul + Nomad + 服务网格，
#   用 Nomad 管理所有服务。
#
# 功能：
#   1. 检查依赖（Docker / Nomad / Consul）
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
#   ./deploy/single-node-cluster/setup-single-node.sh
#   ./deploy/single-node-cluster/setup-single-node.sh --image-tag v2.0.0
#   ./deploy/single-node-cluster/setup-single-node.sh --no-mcp
# =============================================================================
set -euo pipefail

# ---- 默认参数 ----
IMAGE_TAG="latest"
IMAGE_REGISTRY="registry.example.com/cyp-memo"
ENABLE_MCP=true
ENABLE_KMS=false
DATA_DIR="/opt/cyp-memo/data"
CONSUL_DATA_DIR="/opt/consul/data"
NOMAD_DATA_DIR="/opt/nomad/data"
WAIT_TIMEOUT=120

# ---- 解析参数 ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --image-tag)      IMAGE_TAG="$2"; shift 2 ;;
    --image-registry) IMAGE_REGISTRY="$2"; shift 2 ;;
    --no-mcp)         ENABLE_MCP=false; shift ;;
    --enable-kms)     ENABLE_KMS=true; shift ;;
    --data-dir)       DATA_DIR="$2"; shift 2 ;;
    --timeout)        WAIT_TIMEOUT="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo "  --image-tag TAG       镜像版本标签 (default: latest)"
      echo "  --image-registry URL  镜像仓库地址"
      echo "  --no-mcp              禁用 MCP 旁路服务"
      echo "  --enable-kms          启用独立 KMS 服务"
      echo "  --data-dir PATH       数据目录 (default: /opt/cyp-memo/data)"
      echo "  --timeout SECONDS     等待超时时间 (default: 120)"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ---- 脚本根目录 ----
SCRIPT_ROOT="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_ROOT/../.." && pwd)"

echo "============================================================"
echo " CYP-memo · 单节点集群部署（Linux/macOS）"
echo "============================================================"
echo "项目根目录: $PROJECT_ROOT"
echo ""

# =============================================================================
# 步骤 1：检查依赖
# =============================================================================
echo "[1/10] 检查依赖..."

missing_deps=()

# --- Docker ---
if command -v docker >/dev/null 2>&1; then
  docker_ver="$(docker --version 2>/dev/null || true)"
  echo "  [OK] Docker: $docker_ver"
  if ! docker info >/dev/null 2>&1; then
    echo "  [WARN] Docker 已安装但未启动，请启动 Docker 守护进程"
    missing_deps+=("Docker (未启动)")
  fi
else
  echo "  [缺失] Docker 未安装"
  echo "         下载地址: https://docs.docker.com/engine/install/"
  echo "         macOS: brew install --cask docker"
  missing_deps+=("Docker")
fi

# --- Consul ---
if command -v consul >/dev/null 2>&1; then
  consul_ver="$(consul version 2>/dev/null | head -1 || true)"
  echo "  [OK] Consul: $consul_ver"
else
  echo "  [缺失] Consul 未安装"
  echo "         下载地址: https://developer.hashicorp.com/consul/downloads"
  echo "         macOS: brew install hashicorp/tap/consul"
  echo "         Linux: 参见官方安装文档"
  missing_deps+=("Consul")
fi

# --- Nomad ---
if command -v nomad >/dev/null 2>&1; then
  nomad_ver="$(nomad version 2>/dev/null | head -1 || true)"
  echo "  [OK] Nomad: $nomad_ver"
else
  echo "  [缺失] Nomad 未安装"
  echo "         下载地址: https://developer.hashicorp.com/nomad/downloads"
  echo "         macOS: brew install hashicorp/tap/nomad"
  echo "         Linux: 参见官方安装文档"
  missing_deps+=("Nomad")
fi

if [[ ${#missing_deps[@]} -gt 0 ]]; then
  echo ""
  echo "ERROR: 缺少以下依赖，请先安装后再运行本脚本："
  for dep in "${missing_deps[@]}"; do
    echo "  - $dep"
  done
  echo ""
  echo "如果不想安装 Nomad/Consul，可使用 Docker Compose 备选方案："
  echo "  docker compose -f deploy/single-node-cluster/docker-compose.unified.yml up -d"
  exit 1
fi

echo ""

# =============================================================================
# 步骤 2-3：生成配置文件
# =============================================================================
echo "[2/10] 生成 Consul 单节点配置..."
echo "[3/10] 生成 Nomad 单节点配置..."

consul_config_src="$PROJECT_ROOT/deploy/consul/consul-single-node.hcl"
nomad_config_src="$PROJECT_ROOT/deploy/nomad/nomad-single-node.hcl"

if [[ ! -f "$consul_config_src" ]]; then
  echo "ERROR: Consul 配置模板不存在: $consul_config_src"
  exit 1
fi
if [[ ! -f "$nomad_config_src" ]]; then
  echo "ERROR: Nomad 配置模板不存在: $nomad_config_src"
  exit 1
fi

# 确保数据目录存在
sudo mkdir -p "$CONSUL_DATA_DIR" "$NOMAD_DATA_DIR" "$DATA_DIR"
# 放宽权限给当前用户（开发环境）
sudo chown -R "$(whoami)" "$CONSUL_DATA_DIR" "$NOMAD_DATA_DIR" "$DATA_DIR" 2>/dev/null || true

# 运行时配置
consul_runtime="$SCRIPT_ROOT/runtime-consul.hcl"
nomad_runtime="$SCRIPT_ROOT/runtime-nomad.hcl"

# 复制模板并调整路径
sed "s|data_dir = \"/opt/consul/data\"|data_dir = \"$CONSUL_DATA_DIR\"|" \
  "$consul_config_src" > "$consul_runtime"
echo "  Consul 运行时配置: $consul_runtime"

sed "s|data_dir = \"/opt/nomad/data\"|data_dir = \"$NOMAD_DATA_DIR\"|" \
  "$nomad_config_src" > "$nomad_runtime"
echo "  Nomad 运行时配置: $nomad_runtime"

echo ""

# =============================================================================
# 步骤 4：启动 Consul
# =============================================================================
echo "[4/10] 启动 Consul（单节点 server 模式）..."

# 检查是否已在运行
consul_running=false
if curl -fsS "http://127.0.0.1:8500/v1/status/leader" >/dev/null 2>&1; then
  leader="$(curl -s "http://127.0.0.1:8500/v1/status/leader")"
  if [[ "$leader" != '""' ]]; then
    consul_running=true
    echo "  Consul 已在运行，跳过启动"
  fi
fi

if [[ "$consul_running" == "false" ]]; then
  consul_log="$SCRIPT_ROOT/consul.log"
  echo "  启动 Consul，日志: $consul_log"

  nohup consul agent -config-file="$consul_runtime" \
    > "$consul_log" 2>&1 &
  echo $! > "$SCRIPT_ROOT/consul.pid"

  # 等待 Consul 就绪
  echo "  等待 Consul 启动..."
  deadline=$((SECONDS + WAIT_TIMEOUT))
  consul_ready=false
  while (( SECONDS < deadline )); do
    if curl -fsS "http://127.0.0.1:8500/v1/status/leader" >/dev/null 2>&1; then
      leader="$(curl -s "http://127.0.0.1:8500/v1/status/leader")"
      if [[ "$leader" != '""' ]]; then
        consul_ready=true
        break
      fi
    fi
    sleep 2
  done

  if [[ "$consul_ready" == "false" ]]; then
    echo "ERROR: Consul 启动超时（${WAIT_TIMEOUT} 秒）"
    echo "  请查看日志: $consul_log"
    exit 1
  fi
  echo "  Consul 已就绪（leader 选举完成）"
fi

echo ""

# =============================================================================
# 步骤 5：启动 Nomad
# =============================================================================
echo "[5/10] 启动 Nomad（单节点 server + client）..."

# 检查是否已在运行
nomad_running=false
if curl -fsS "http://127.0.0.1:4646/v1/status/leader" >/dev/null 2>&1; then
  leader="$(curl -s "http://127.0.0.1:4646/v1/status/leader")"
  if [[ "$leader" != '""' ]]; then
    nomad_running=true
    echo "  Nomad 已在运行，跳过启动"
  fi
fi

if [[ "$nomad_running" == "false" ]]; then
  nomad_log="$SCRIPT_ROOT/nomad.log"
  echo "  启动 Nomad，日志: $nomad_log"

  nohup nomad agent -config="$nomad_runtime" \
    > "$nomad_log" 2>&1 &
  echo $! > "$SCRIPT_ROOT/nomad.pid"

  # 等待 Nomad Server 就绪
  echo "  等待 Nomad Server 启动..."
  deadline=$((SECONDS + WAIT_TIMEOUT))
  nomad_ready=false
  while (( SECONDS < deadline )); do
    if curl -fsS "http://127.0.0.1:4646/v1/status/leader" >/dev/null 2>&1; then
      leader="$(curl -s "http://127.0.0.1:4646/v1/status/leader")"
      if [[ "$leader" != '""' ]]; then
        nomad_ready=true
        break
      fi
    fi
    sleep 2
  done

  if [[ "$nomad_ready" == "false" ]]; then
    echo "ERROR: Nomad 启动超时（${WAIT_TIMEOUT} 秒）"
    echo "  请查看日志: $nomad_log"
    exit 1
  fi
  echo "  Nomad Server 已就绪"
fi

export NOMAD_ADDR="http://127.0.0.1:4646"

echo ""

# =============================================================================
# 步骤 6：等待集群就绪
# =============================================================================
echo "[6/10] 等待集群就绪..."

deadline=$((SECONDS + WAIT_TIMEOUT))
cluster_ready=false
while (( SECONDS < deadline )); do
  if nodes_json="$(curl -fsS "http://127.0.0.1:4646/v1/nodes" 2>/dev/null)"; then
    ready_count="$(echo "$nodes_json" | grep -o '"Status":"ready"' | wc -l | tr -d ' ')"
    if [[ "$ready_count" -ge 1 ]]; then
      echo "  Nomad Client 节点已就绪: ${ready_count} 个 ready"
      $cluster_ready = true
      cluster_ready=true
      break
    fi
  fi
  sleep 3
done

if [[ "$cluster_ready" == "false" ]]; then
  echo "  WARNING: Nomad Client 节点就绪超时，继续下一步..."
fi

# 验证 Consul 成员
if members="$(curl -fsS "http://127.0.0.1:8500/v1/agent/members" 2>/dev/null)"; then
  member_count="$(echo "$members" | grep -o '"Name":' | wc -l | tr -d ' ')"
  echo "  Consul 集群成员: ${member_count} 个"
fi

echo ""

# =============================================================================
# 步骤 7：部署 CYP-memo 服务
# =============================================================================
echo "[7/10] 部署 CYP-memo 服务（Nomad Job）..."

job_file="$PROJECT_ROOT/deploy/nomad/cyp-memo-server.nomad"
if [[ ! -f "$job_file" ]]; then
  echo "ERROR: Nomad Job 文件不存在: $job_file"
  exit 1
fi

# 单节点适配：关闭 distinct_hosts 约束（同机部署所有 group）
single_node_job="$SCRIPT_ROOT/cyp-memo-single-node.nomad"
sed 's/operator  = "distinct_hosts"/operator  = "distinct_hosts"\n    # 单节点集群：关闭节点反亲和（所有 group 同机）/g' "$job_file" \
  | sed '/constraint {/,/}/{ s/value     = "true"/value     = "false"/; t; }' > "$single_node_job"

# 更简单的方式：直接替换所有 distinct_hosts 值为 false
sed -i.bak 's/operator  = "distinct_hosts"\n    value     = "true"/operator  = "distinct_hosts"\n    value     = "false"/g' "$single_node_job" 2>/dev/null || true
# 兼容 macOS sed
sed -i '' 's/value     = "true"/value     = "false"/g' "$single_node_job" 2>/dev/null || \
  sed -i 's/value     = "true"/value     = "false"/g' "$single_node_job" 2>/dev/null || true

echo "  提交 Nomad Job: cyp-memo"
nomad job run \
  -var="image_registry=$IMAGE_REGISTRY" \
  -var="image_tag=$IMAGE_TAG" \
  -var="enable_mcp=$ENABLE_MCP" \
  -var="enable_kms=$ENABLE_KMS" \
  -var="api_count=1" \
  -var="gateway_count=1" \
  -var="mcp_count=1" \
  "$single_node_job"

echo "  Job 提交成功"

echo ""

# =============================================================================
# 步骤 8：验证服务健康
# =============================================================================
echo "[8/10] 验证服务健康..."

deadline=$((SECONDS + WAIT_TIMEOUT * 2))  # 部署需要更长时间
all_healthy=false

echo "  等待服务部署完成（可能需要几分钟拉取镜像）..."

while (( SECONDS < deadline )); do
  gateway_healthy=false
  api_healthy=false
  mcp_healthy=true

  # 检查 Gateway
  if gw_resp="$(curl -fsS "http://127.0.0.1:8500/v1/health/service/cyp-memo-gateway?passing" 2>/dev/null)"; then
    gw_count="$(echo "$gw_resp" | grep -o '"ServiceName":"cyp-memo-gateway"' | wc -l | tr -d ' ')"
    if [[ "$gw_count" -gt 0 ]]; then
      gateway_healthy=true
    fi
  fi

  # 检查 API
  if api_resp="$(curl -fsS "http://127.0.0.1:8500/v1/health/service/cyp-memo-api?passing" 2>/dev/null)"; then
    api_count="$(echo "$api_resp" | grep -o '"ServiceName":"cyp-memo-api"' | wc -l | tr -d ' ')"
    if [[ "$api_count" -gt 0 ]]; then
      api_healthy=true
    fi
  fi

  # 检查 MCP（如果启用）
  if [[ "$ENABLE_MCP" == "true" ]]; then
    mcp_healthy=false
    if mcp_resp="$(curl -fsS "http://127.0.0.1:8500/v1/health/service/cyp-memo-mcp?passing" 2>/dev/null)"; then
      mcp_count="$(echo "$mcp_resp" | grep -o '"ServiceName":"cyp-memo-mcp"' | wc -l | tr -d ' ')"
      if [[ "$mcp_count" -gt 0 ]]; then
        mcp_healthy=true
      fi
    fi
  fi

  if [[ "$gateway_healthy" == "true" && "$api_healthy" == "true" && "$mcp_healthy" == "true" ]]; then
    all_healthy=true
    break
  fi

  sleep 5
  echo -n "."
done
echo ""

if [[ "$all_healthy" == "true" ]]; then
  echo "  所有服务健康检查通过"
else
  echo "  WARNING: 服务健康检查超时，请手动检查："
  echo "    nomad job status cyp-memo"
  echo "    consul catalog services"
fi

echo ""

# =============================================================================
# 步骤 9-10：输出访问地址
# =============================================================================
echo "[9/10] 单节点集群部署完成！"
echo "[10/10] 访问地址汇总："
echo ""
echo "============================================================"
echo "  CYP-memo 单节点集群 · 访问地址"
echo "============================================================"
echo ""
echo "  产品入口（网关）:   http://127.0.0.1:5170"
echo ""
echo "  Consul UI:         http://127.0.0.1:8500"
echo "  Consul DNS:        127.0.0.1:8600"
echo ""
echo "  Nomad UI:          http://127.0.0.1:4646"
echo ""
echo "  运维命令："
echo "    consul members              # 查看集群成员"
echo "    nomad node status           # 查看节点状态"
echo "    nomad job status cyp-memo   # 查看服务状态"
echo ""
echo "  数据目录: $DATA_DIR"
echo "  Consul 数据: $CONSUL_DATA_DIR"
echo "  Nomad 数据: $NOMAD_DATA_DIR"
echo ""
echo "  停止集群："
echo "    kill \$(cat $SCRIPT_ROOT/nomad.pid)  # 停止 Nomad"
echo "    kill \$(cat $SCRIPT_ROOT/consul.pid) # 停止 Consul"
echo ""
echo "============================================================"
echo "  提示：单节点是最小完整集群，扩容指南见 docs/scaling-guide.md"
echo "============================================================"
