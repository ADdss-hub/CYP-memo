# CYP-memo 单节点 Consul 配置
# -----------------------------------------------------------------------------
# 用途：单节点即单节点集群 — Server 模式，bootstrap_expect=1
# 原则：即使一台机器，也要跑完整的 Consul 服务发现 + KV + 健康检查
# 配套：deploy/nomad/nomad-single-node.hcl（Nomad 单节点 server+client）
# 启动：consul agent -config-file=deploy/consul/consul-single-node.hcl
# -----------------------------------------------------------------------------

# ---- 基础信息 ----
node_name  = "cyp-consul-single-01"
datacenter = "cyp-memo-dc1"
data_dir   = "/opt/consul/data"
# Windows 下可改为：data_dir = "C:/ProgramData/consul/data"

# ---- 日志级别 ----
log_level = "INFO"

# ---- 模式：Server ----
server = true

# ---- 单节点 Bootstrap ----
bootstrap_expect = 1

# ---- UI ----
ui_config {
  enabled = true
}

# ---- 绑定地址 ----
# client_addr 开放 HTTP/DNS，供本机 Nomad 及服务查询
client_addr = "0.0.0.0"
# bind_addr 用于集群内通信（Serf/RPC）
bind_addr   = "0.0.0.0"

# ---- 通告地址 ----
# 单节点用 127.0.0.1，扩容时改为实际内网 IP
advertise_addr = "127.0.0.1"
# advertise_addr = "192.168.1.100"  # 扩容时替换为实际 IP

# ---- 端口配置 ----
ports {
  http      = 8500   # HTTP API / UI
  dns       = 8600   # DNS 查询
  serf_lan  = 8301   # Serf LAN Gossip
  serf_wan  = 8302   # Serf WAN Gossip
  server    = 8300   # Server RPC
  grpc      = 8502   # gRPC（Consul 1.10+）
  grpc_tls  = 8503   # gRPC TLS
}

# ---- DNS 配置 ----
dns_config {
  only_passing    = true   # 只返回健康检查通过的节点
  allow_stale     = true   # 允许从非 leader 节点查询
  max_stale       = "5s"
  service_ttl {
    "*" = "10s"
  }
  node_ttl = "10s"
}

# ---- 连接超时 ----
limits {
  http_max_conns_per_client  = 200
  rpc_max_conns_per_client   = 100
}

# ---- ACL（单节点默认关闭，生产建议开启） ----
acl {
  enabled        = false
  default_policy = "allow"
  down_policy    = "extend-cache"
  tokens {
    # 初始管理 Token（首次启动后修改）
    initial_management = "cyp-memo-consul-bootstrap-token"
  }
}

# ---- Gossip 加密（生产环境务必启用并替换密钥） ----
# encrypt = "cyp-memo-consul-gossip-encryption-key-change-me-32bytes!!"

# ---- Telemetry ----
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname          = true
}

# ---- 性能 ----
performance {
  raft_multiplier = 1
}

# ---- 脚本检查 ----
enable_script_checks        = false
enable_local_script_checks  = true

# ---- 自动清理 ----
autopilot {
  cleanup_dead_servers      = true
  last_contact_threshold    = "200ms"
  max_trailing_logs         = 250
  server_stabilization_time = "10s"
}

# ---- 自动重新加入 ----
rejoin_after_leave = true
leave_on_terminate = false   # 单节点不自动离开，避免重启后数据丢失

# ---- 节点元数据 ----
node_meta {
  "cyp-memo.role"      = "infra"
  "cyp-memo.node-type" = "single-node"
  "cyp-memo.tier"      = "all-in-one"
}
