# CYP-memo 单节点 Nomad 配置
# -----------------------------------------------------------------------------
# 用途：单节点即单节点集群 — Server + Client 同机部署
# 原则：即使一台机器，也要跑完整的 Nomad 控制平面 + 数据平面
# 配套：deploy/consul/consul-single-node.hcl（Consul 单节点 server）
# 启动：nomad agent -config=deploy/nomad/nomad-single-node.hcl
# -----------------------------------------------------------------------------

# ---- 数据目录 ----
data_dir  = "/opt/nomad/data"
# Windows 下可改为：data_dir = "C:/ProgramData/nomad/data"

# ---- 日志级别 ----
log_level = "INFO"

# ---- 绑定地址 ----
# 单节点绑定全部接口，便于后续扩容时直接加入新节点
bind_addr = "0.0.0.0"

# ---- 数据中心 ----
datacenter = "cyp-memo-dc1"

# ---- 区域 ----
region = "global"

# ---- Server 配置 ----
server {
  enabled          = true
  bootstrap_expect = 1   # 单节点：1 个 server 即可选举 leader

  # 服务器节点列表（单节点填自己；扩容时添加新 server 地址）
  server_join {
    retry_join = ["127.0.0.1"]
  }

  # 加密密钥（生产环境请替换，与 Consul 独立管理）
  # encrypt = "cyp-memo-nomad-gossip-encryption-key-change-me-32bytes!!"

  # 默认调度器
  enabled_schedulers = ["service", "batch", "system"]
}

# ---- Client 配置 ----
client {
  enabled    = true
  # 注册到的服务器地址（单节点即本机）
  servers = ["127.0.0.1:4647"]

  # 节点元数据（供 job 约束和调度使用）
  meta {
    "cyp-memo.role"       = "worker"
    "cyp-memo.node-type"  = "single-node"
    "cyp-memo.tier"       = "all-in-one"
  }

  # 可选的 host 网络定义
  host_network "public" {
    interface = "eth0"   # Linux 下根据实际网卡调整
    # Windows 下注释掉，使用默认接口
  }

  host_network "private" {
    interface = "lo"     # 环回/内网
    # Windows 下注释掉
  }

  # 预留资源（不被调度的资源）
  reserved {
    cpu    = 500   # MHz
    memory = 512   # MB
    disk   = 1024  # MB
  }
}

# ---- 插件配置 ----
plugin "docker" {
  config {
    allow_privileged = false
    volumes {
      enabled = true
    }
  }
}

# ---- 端口配置 ----
ports {
  http = 4646   # HTTP API / UI
  rpc  = 4647   # RPC 通信
  serf = 4648   # Serf Gossip
}

# ---- Consul 集成 ----
consul {
  address = "127.0.0.1:8500"
  # Consul token（启用 ACL 时配置）
  # token   = "nomad-consul-token"

  # 自动注册 Nomad Server 服务
  server_service_name = "nomad"
  # 自动注册 Nomad Client 服务
  client_service_name = "nomad-client"

  # 自动注册健康检查
  auto_advertise = true

  # Server 自动加入 Consul
  server_auto_join = true
  client_auto_join = true
}

# ---- ACL（单节点默认关闭，生产建议开启） ----
acl {
  enabled = false
}

# ---- Telemetry ----
telemetry {
  collection_interval        = "15s"
  disable_hostname           = true
  prometheus_metrics         = true
  publish_allocation_metrics = true
  publish_node_metrics       = true
}

# ---- 性能调优 ----
performance {
  raft_multiplier = 1
}
