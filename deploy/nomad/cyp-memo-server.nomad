# CYP-memo 服务端 Nomad Job Spec
# -----------------------------------------------------------------------------
# 用途：服务端独立部署场景下的 Nomad 编排模板
# 架构：group "api" (后端 API) + group "gateway" (前端网关) + group "mcp" (MCP 旁路)
# 驱动：默认 docker，exec 驱动见各 group 的注释
# 服务发现：依赖 Consul，gateway 通过 Consul 发现 api 与 mcp
# -----------------------------------------------------------------------------
# 部署：nomad job run -var='image_tag=v2.0.0' deploy/nomad/cyp-memo-server.nomad
# 停用 MCP：nomad job run -var='enable_mcp=false' deploy/nomad/cyp-memo-server.nomad
# 启用 KMS 远程：nomad job run -var='enable_kms=true' deploy/nomad/cyp-memo-server.nomad
# -----------------------------------------------------------------------------

job "cyp-memo" {
  datacenters = ["dc1"]
  type        = "service"
  priority    = 80

  # 全 job 级 meta，可通过 nomad job meta set 动态调整
  meta {
    version    = "v2.0.0"
    tier       = "production"
    component  = "cyp-memo-server"
  }

  # 全 job 级约束：Linux amd64 节点
  constraint {
    attribute = "${attr.kernel.name}"
    value     = "linux"
  }

  # ---------------------------------------------------------------------------
  # 可配置变量（部署时通过 -var 覆盖）
  # ---------------------------------------------------------------------------
  variable "image_registry" {
    description = "Docker 镜像仓库地址"
    type        = string
    default     = "registry.example.com/cyp-memo"
  }

  variable "image_tag" {
    description = "服务镜像版本标签"
    type        = string
    default     = "latest"
  }

  variable "gateway_image" {
    description = "网关镜像（nginx 静态资源 + 反代）"
    type        = string
    default     = "registry.example.com/cyp-memo/gateway:latest"
  }

  variable "data_dir_host" {
    description = "宿主机数据目录（用于 host 卷挂载 SQLite 数据、TLS 证书等）"
    type        = string
    default     = "/opt/cyp-memo/data"
  }

  variable "log_dir_host" {
    description = "宿主机日志目录"
    type        = string
    default     = "/opt/cyp-memo/logs"
  }

  variable "enable_mcp" {
    description = "是否启用 MCP 旁路服务"
    type        = bool
    default     = true
  }

  variable "enable_kms" {
    description = "是否启用独立 KMS 远程模式（默认嵌入式，与 API 同进程）"
    type        = bool
    default     = false
  }

  variable "app_env" {
    description = "应用环境标识（军械库强制 prod）"
    type        = string
    default     = "prod"
  }

  variable "log_level" {
    description = "日志级别 (debug|info|warn|error)"
    type        = string
    default     = "info"
  }

  variable "api_count" {
    description = "API 服务实例数"
    type        = number
    default     = 1
  }

  variable "gateway_count" {
    description = "网关实例数"
    type        = number
    default     = 1
  }

  variable "mcp_count" {
    description = "MCP 旁路实例数（enable_mcp=true 时生效）"
    type        = number
    default     = 1
  }

  # ===========================================================================
  # Group: api — 后端 API 服务（端口 10170）
  # ===========================================================================
  group "api" {
    count = var.api_count

    network {
      port "api" {
        static       = 10170
        to           = 10170
        host_network = "private"  # 仅内网/环回，不对外暴露
      }
      port "kms" {
        static       = 12000
        to           = 12000
        host_network = "private"
      }
      port "metrics" {
        to           = 9091
        host_network = "private"
      }
    }

    # 与 gateway 组反亲和：尽量分布到不同节点
    constraint {
      operator  = "distinct_hosts"
      value     = "true"
    }

    # API 服务需要持久化卷（SQLite 数据库、附件存储、TLS 证书）
    volume "cyp-memo-data" {
      type      = "host"
      read_only = false
      source    = "cyp-memo-data"
    }

    volume "cyp-memo-logs" {
      type      = "host"
      read_only = false
      source    = "cyp-memo-logs"
    }

    restart {
      attempts = 5
      interval = "5m"
      delay    = "10s"
      mode     = "delay"
    }

    # 滚动升级策略
    update {
      max_parallel      = 1
      min_healthy_time  = "30s"
      healthy_deadline  = "2m"
      progress_deadline = "5m"
      auto_revert       = true
      canary            = 0
    }

    service {
      name = "cyp-memo-api"
      port = "api"
      tags = [
        "cyp-memo",
        "backend",
        "api",
        "traefik.enable=false",
      ]

      # 就绪探针：/healthz/ready
      check {
        name     = "api-ready"
        type     = "http"
        path     = "/healthz/ready"
        port     = "api"
        interval = "10s"
        timeout  = "3s"
        check_restart {
          limit           = 3
          grace           = "30s"
          ignore_warnings = false
        }
      }

      # 存活探针：/healthz/live
      check {
        name     = "api-live"
        type     = "http"
        path     = "/healthz/live"
        port     = "api"
        interval = "30s"
        timeout  = "3s"
      }

      # Prometheus 指标抓取
      check {
        name     = "api-metrics"
        type     = "http"
        path     = "/metrics"
        port     = "metrics"
        interval = "15s"
        timeout  = "3s"
      }
    }

    # KMS 健康检查（仅当启用独立 KMS 时注册）
    service {
      name = "cyp-memo-kms"
      port = "kms"
      tags = [
        "cyp-memo",
        "infrastructure",
        "kms",
        "traefik.enable=false",
      ]

      check {
        name     = "kms-health"
        type     = "http"
        path     = "/kms/v1/health"
        port     = "kms"
        interval = "15s"
        timeout  = "3s"
      }
    }

    task "api-server" {
      driver = "docker"

      config {
        image = "${var.image_registry}/server:${var.image_tag}"
        ports = ["api", "kms", "metrics"]

        # 与单机模式保持一致的启动命令
        command = "node"
        args = [
          "--conditions=cyp-node",
          "dist/index.js",
        ]

        # 容器内以非 root 用户运行
        user = "1000:1000"
      }

      # 资源限制（与单机模式资源预算对齐）
      resources {
        cpu    = 500   # MHz
        memory = 512   # MB
        memory_max = 1024  # MB（burst 上限）
      }

      # 数据卷挂载
      volume_mount {
        volume      = "cyp-memo-data"
        destination = "/data"
        read_only   = false
      }

      volume_mount {
        volume      = "cyp-memo-logs"
        destination = "/var/log/cyp-memo"
        read_only   = false
      }

      # -----------------------------------------------------------------------
      # 环境变量配置
      # -----------------------------------------------------------------------
      env {
        APP_ENV             = var.app_env
        NODE_ENV            = "production"
        LOG_LEVEL           = var.log_level
        TZ                  = "Asia/Shanghai"
        API_PORT            = "10170"
        DATA_DIR            = "/data"
        CYP_KMS_REMOTE      = var.enable_kms ? "1" : "0"
        KMS_PORT            = "12000"
      }

      # 敏感配置通过 Nomad Variable / Consul KV / Vault 注入
      # 生产环境请勿直接写在 job spec 中，以下为占位示例：
      template {
        data = <<EOF
{{ with nomadVar "cyp-memo/secrets" }}
KMS_AUTH_TOKEN={{ .kms_auth_token }}
CYP_KMS_MASTER_KEY={{ .kms_master_key }}
CYP_BOOTSTRAP_OWNER_PASSWORD={{ .bootstrap_owner_password }}
{{ end }}
EOF
        destination   = "secrets/.env.secrets"
        env           = true
        change_mode   = "restart"
        change_signal = "SIGUSR1"
      }

      # 日志配置
      logs {
        max_files     = 5
        max_file_size = 20
      }

      # 优雅终止
      kill_signal = "SIGTERM"
      kill_timeout = "30s"

      # 任务启动后钩子：等待健康检查通过（用于联动依赖）
      # Nomad 1.6+ 支持 poststart
    }
  }

  # ===========================================================================
  # Group: gateway — 前端网关（端口 5170）
  # 职责：静态资源服务 + 反向代理到 API / MCP + TLS 终止
  # ===========================================================================
  group "gateway" {
    count = var.gateway_count

    network {
      port "http" {
        static       = 5170
        to           = 5170
        host_network = "public"  # 对外暴露
      }
    }

    constraint {
      operator  = "distinct_hosts"
      value     = "true"
    }

    restart {
      attempts = 5
      interval = "5m"
      delay    = "10s"
      mode     = "delay"
    }

    update {
      max_parallel      = 1
      min_healthy_time  = "30s"
      healthy_deadline  = "2m"
      progress_deadline = "5m"
      auto_revert       = true
    }

    service {
      name = "cyp-memo-gateway"
      port = "http"
      tags = [
        "cyp-memo",
        "frontend",
        "gateway",
        "urlprefix-/",
      ]

      # 健康检查：就绪探针
      check {
        name     = "gateway-ready"
        type     = "http"
        path     = "/healthz/ready"
        port     = "http"
        interval = "10s"
        timeout  = "3s"
        check_restart {
          limit           = 3
          grace           = "30s"
          ignore_warnings = false
        }
      }

      # 存活探针
      check {
        name     = "gateway-live"
        type     = "http"
        path     = "/healthz/live"
        port     = "http"
        interval = "30s"
        timeout  = "3s"
      }
    }

    task "gateway-nginx" {
      driver = "docker"

      config {
        image = var.gateway_image
        ports = ["http"]

        # 网关需要能解析 Consul 中的 API / MCP 服务名
        dns_servers = ["${attr.unique.network.ip-address}"]
      }

      resources {
        cpu    = 200   # MHz
        memory = 256   # MB
      }

      # nginx 配置模板：通过 Consul DNS 发现后端服务
      template {
        data = <<EOF
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent" '
                    'rt=$request_time uct="$upstream_connect_time" '
                    'uht="$upstream_header_time" urt="$upstream_response_time"';

    access_log /var/log/nginx/access.log main;
    error_log  /var/log/nginx/error.log warn;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    client_max_body_size 10240m;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # 上游：API 服务（Consul DNS 发现）
    upstream api_backend {
        server cyp-memo-api.service.consul:10170;
        keepalive 32;
    }

    # 上游：MCP 旁路服务（Consul DNS 发现）
    upstream mcp_backend {
        server cyp-memo-mcp.service.consul:13175;
        keepalive 16;
    }

    server {
        listen 5170;
        server_name _;

        # 健康检查端点
        location = /healthz/ready {
            access_log off;
            return 200 '{"success":true,"service":"gateway","status":"ready"}';
            add_header Content-Type application/json;
        }

        location = /healthz/live {
            access_log off;
            return 200 '{"success":true,"service":"gateway","status":"alive"}';
            add_header Content-Type application/json;
        }

        # API 代理
        location /api/ {
            proxy_pass https://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_read_timeout 300s;
            proxy_send_timeout 300s;
        }

        # MCP 代理
        location /mcp/ {
            proxy_pass https://mcp_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_read_timeout 300s;
            proxy_buffering off;
        }

        # 静态资源
        location / {
            root /usr/share/nginx/html;
            index index.html;
            try_files $uri $uri/ /index.html;
        }
    }
}
EOF
        destination = "local/nginx.conf"
      }

      # 启动时加载模板配置
      config {
        volumes = [
          "local/nginx.conf:/etc/nginx/nginx.conf:ro",
        ]
      }

      logs {
        max_files     = 5
        max_file_size = 20
      }

      kill_signal = "SIGTERM"
      kill_timeout = "30s"
    }
  }

  # ===========================================================================
  # Group: mcp — MCP 旁路服务（端口 13175）
  # 可选组，通过 enable_mcp 变量控制是否启动
  # ===========================================================================
  group "mcp" {
    count = var.enable_mcp ? var.mcp_count : 0

    network {
      port "mcp" {
        static       = 13175
        to           = 13175
        host_network = "private"  # 仅内网/环回，不对外暴露
      }
    }

    constraint {
      operator  = "distinct_hosts"
      value     = "true"
    }

    restart {
      attempts = 5
      interval = "5m"
      delay    = "10s"
      mode     = "delay"
    }

    update {
      max_parallel      = 1
      min_healthy_time  = "10s"
      healthy_deadline  = "1m"
      progress_deadline = "3m"
      auto_revert       = true
    }

    service {
      name = "cyp-memo-mcp"
      port = "mcp"
      tags = [
        "cyp-memo",
        "bypass",
        "mcp",
        "traefik.enable=false",
      ]

      # 健康检查：/healthz
      check {
        name     = "mcp-health"
        type     = "http"
        path     = "/healthz"
        port     = "mcp"
        interval = "10s"
        timeout  = "3s"
        check_restart {
          limit           = 3
          grace           = "30s"
          ignore_warnings = false
        }
      }
    }

    task "mcp-server" {
      driver = "docker"

      config {
        image = "${var.image_registry}/mcp:${var.image_tag}"
        ports = ["mcp"]

        command = "node"
        args = [
          "dist/index.js",
        ]

        user = "1000:1000"
      }

      resources {
        cpu    = 200   # MHz
        memory = 256   # MB
      }

      env {
        APP_ENV       = var.app_env
        NODE_ENV      = "production"
        LOG_LEVEL     = var.log_level
        TZ            = "Asia/Shanghai"
        MCP_PORT      = "13175"
        # 通过 Consul 服务发现连接 API
        API_BASE_URL  = "https://cyp-memo-api.service.consul:10170"
      }

      # 共享密钥：MCP 与 API 之间的 East-West Token
      template {
        data = <<EOF
{{ with nomadVar "cyp-memo/secrets" }}
MCP_AUTH_TOKEN={{ .mcp_auth_token }}
{{ end }}
EOF
        destination   = "secrets/.env.mcp"
        env           = true
        change_mode   = "restart"
      }

      logs {
        max_files     = 5
        max_file_size = 20
      }

      kill_signal = "SIGTERM"
      kill_timeout = "15s"
    }
  }
}
