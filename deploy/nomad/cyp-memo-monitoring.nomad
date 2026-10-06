# CYP-memo 监控组件 Nomad Job Spec
# -----------------------------------------------------------------------------
# 用途：可观测性栈（Prometheus + Grafana + Alertmanager + node-exporter）
# 对应：docker-compose.monitoring.yml 的 Nomad 化版本
# 服务发现：Consul 自动发现 cyp-memo-api / cyp-memo-mcp 等服务
# -----------------------------------------------------------------------------
# 部署：nomad job run deploy/nomad/cyp-memo-monitoring.nomad
# 访问：Grafana  :3000  Prometheus :9090  Alertmanager :9093
# -----------------------------------------------------------------------------

job "cyp-memo-monitoring" {
  datacenters = ["dc1"]
  type        = "service"
  priority    = 70

  meta {
    component  = "monitoring"
    tier       = "observability"
  }

  constraint {
    attribute = "${attr.kernel.name}"
    value     = "linux"
  }

  # ---------------------------------------------------------------------------
  # 可配置变量
  # ---------------------------------------------------------------------------
  variable "prometheus_image" {
    description = "Prometheus 镜像"
    type        = string
    default     = "prom/prometheus:latest"
  }

  variable "grafana_image" {
    description = "Grafana 镜像"
    type        = string
    default     = "grafana/grafana:latest"
  }

  variable "alertmanager_image" {
    description = "Alertmanager 镜像"
    type        = string
    default     = "prom/alertmanager:latest"
  }

  variable "node_exporter_image" {
    description = "Node Exporter 镜像"
    type        = string
    default     = "prom/node-exporter:latest"
  }

  variable "data_dir_host" {
    description = "宿主机监控数据根目录"
    type        = string
    default     = "/opt/cyp-memo/monitoring"
  }

  variable "scrape_interval" {
    description = "全局抓取间隔"
    type        = string
    default     = "15s"
  }

  # ===========================================================================
  # Group: prometheus — 指标采集与存储
  # ===========================================================================
  group "prometheus" {
    count = 1

    network {
      port "http" {
        static       = 9090
        to           = 9090
        host_network = "private"
      }
    }

    volume "prometheus-data" {
      type      = "host"
      read_only = false
      source    = "cyp-memo-prometheus-data"
    }

    restart {
      attempts = 5
      interval = "10m"
      delay    = "30s"
      mode     = "delay"
    }

    service {
      name = "cyp-memo-prometheus"
      port = "http"
      tags = [
        "cyp-memo",
        "monitoring",
        "prometheus",
      ]

      check {
        name     = "prometheus-health"
        type     = "http"
        path     = "/-/healthy"
        port     = "http"
        interval = "30s"
        timeout  = "3s"
      }
    }

    task "prometheus" {
      driver = "docker"

      config {
        image = var.prometheus_image
        ports = ["http"]

        command = "--config.file=/etc/prometheus/prometheus.yml"
        args = [
          "--storage.tsdb.path=/prometheus",
          "--storage.tsdb.retention.time=30d",
          "--web.enable-lifecycle",
          "--web.enable-admin-api",
        ]

        volumes = [
          "local/prometheus.yml:/etc/prometheus/prometheus.yml:ro",
          "local/alerts.yml:/etc/prometheus/alerts.yml:ro",
        ]
      }

      resources {
        cpu    = 500   # MHz
        memory = 1024  # MB
      }

      volume_mount {
        volume      = "prometheus-data"
        destination = "/prometheus"
        read_only   = false
      }

      # Prometheus 主配置：Consul 服务发现自动抓取 cyp-memo 服务
      template {
        data = <<EOF
global:
  scrape_interval: {{ env "NOMAD_META_scrape_interval" | default "15s" }}
  evaluation_interval: 15s
  external_labels:
    cluster: cyp-memo
    environment: production

rule_files:
  - /etc/prometheus/alerts.yml

alerting:
  alertmanagers:
    - consul_sd_configs:
        - server: 'localhost:8500'
          services: ['cyp-memo-alertmanager']
      relabel_configs:
        - source_labels: [__meta_consul_service_port]
          target_label: __address__
          replacement: '${1}'

scrape_configs:
  # Prometheus 自身
  - job_name: prometheus
    static_configs:
      - targets: ['localhost:9090']

  # Consul 服务发现：自动抓取所有带 cyp-memo 标签的服务
  - job_name: consul-services
    consul_sd_configs:
      - server: 'localhost:8500'
        tag_separator: ','
        service_meta_filter: {key: "cyp-memo", value: ".*"}
    relabel_configs:
      - source_labels: [__meta_consul_service]
        target_label: job
      - source_labels: [__meta_consul_tags]
        regex: .*cyp-memo.*
        action: keep

  # cyp-memo API 服务（Consul 发现）
  - job_name: cyp-memo-api
    consul_sd_configs:
      - server: 'localhost:8500'
        services: ['cyp-memo-api']
    metrics_path: /metrics
    relabel_configs:
      - source_labels: [__meta_consul_service_address, __meta_consul_service_port]
        separator: ':'
        target_label: __address__
        replacement: '${1}:${2}'

  # cyp-memo MCP 旁路服务（Consul 发现）
  - job_name: cyp-mcp-bypass
    consul_sd_configs:
      - server: 'localhost:8500'
        services: ['cyp-memo-mcp']
    metrics_path: /metrics
    relabel_configs:
      - source_labels: [__meta_consul_service_address, __meta_consul_service_port]
        separator: ':'
        target_label: __address__
        replacement: '${1}:${2}'

  # Node Exporter（通过 Consul 发现所有节点上的 node-exporter）
  - job_name: node-exporter
    consul_sd_configs:
      - server: 'localhost:8500'
        services: ['node-exporter']
    relabel_configs:
      - source_labels: [__meta_consul_node]
        target_label: instance

  # Grafana
  - job_name: grafana
    consul_sd_configs:
      - server: 'localhost:8500'
        services: ['cyp-memo-grafana']
    metrics_path: /metrics
EOF
        destination = "local/prometheus.yml"
        change_mode   = "restart"
        change_signal = "SIGHUP"
      }

      # 告警规则（与 monitoring/prometheus/alerts.yml 对齐）
      template {
        data = <<EOF
{{ range nomadVarList "cyp-memo/monitoring/alerts" }}
{{ .Content }}
{{ else }}
# 告警规则通过 Nomad Variable 注入
# 请将 monitoring/prometheus/alerts.yml 内容写入 nomad var cyp-memo/monitoring/alerts
groups:
  - name: placeholder
    rules:
      - alert: NoAlertsConfigured
        expr: vector(1)
        for: 1m
        labels:
          tier: logging
          severity: info
        annotations:
          summary: "告警规则未配置"
          description: "Prometheus 告警规则未通过 Nomad Variable 注入，请检查 cyp-memo/monitoring/alerts"
          runbook_url: "docs/nomad-deployment-guide.md#告警规则配置"
{{ end }}
EOF
        destination = "local/alerts.yml"
        change_mode   = "restart"
        change_signal = "SIGHUP"
      }

      logs {
        max_files     = 5
        max_file_size = 50
      }
    }
  }

  # ===========================================================================
  # Group: alertmanager — 告警路由与分级
  # ===========================================================================
  group "alertmanager" {
    count = 1

    network {
      port "http" {
        static       = 9093
        to           = 9093
        host_network = "private"
      }
    }

    restart {
      attempts = 5
      interval = "10m"
      delay    = "30s"
      mode     = "delay"
    }

    service {
      name = "cyp-memo-alertmanager"
      port = "http"
      tags = [
        "cyp-memo",
        "monitoring",
        "alertmanager",
      ]

      check {
        name     = "alertmanager-health"
        type     = "http"
        path     = "/-/healthy"
        port     = "http"
        interval = "30s"
        timeout  = "3s"
      }
    }

    task "alertmanager" {
      driver = "docker"

      config {
        image = var.alertmanager_image
        ports = ["http"]

        args = [
          "--config.file=/etc/alertmanager/alertmanager.yml",
          "--storage.path=/alertmanager",
        ]

        volumes = [
          "local/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro",
        ]
      }

      resources {
        cpu    = 100   # MHz
        memory = 128   # MB
      }

      # Alertmanager 分级路由配置（与 monitoring/alertmanager.yml 对齐）
      template {
        data = <<EOF
global:
  resolve_timeout: 5m

route:
  receiver: cyp-catch-all
  group_by: ['alertname', 'tier', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    # page 级：立即呼叫
    - matchers:
        - tier = "page"
      receiver: cyp-page-webhook
      group_by: ['alertname', 'tier']
      group_wait: 10s
      group_interval: 2m
      repeat_interval: 1h
      continue: false
    # ticket 级：建单跟进
    - matchers:
        - tier = "ticket"
      receiver: cyp-ticket
      group_by: ['alertname', 'tier']
      group_wait: 30s
      group_interval: 10m
      repeat_interval: 12h
      continue: false
    # logging 级：仅记录
    - matchers:
        - tier = "logging"
      receiver: cyp-logging
      group_by: ['alertname', 'tier']
      group_wait: 1m
      group_interval: 30m
      repeat_interval: 24h
      continue: false

receivers:
  - name: cyp-page-webhook
    webhook_configs:
      - url: '{{ with nomadVar "cyp-memo/monitoring/webhooks" }}{{ .page_url }}{{ else }}http://127.0.0.1:9094/alerts/page{{ end }}'
        send_resolved: true
  - name: cyp-ticket
    webhook_configs:
      - url: '{{ with nomadVar "cyp-memo/monitoring/webhooks" }}{{ .ticket_url }}{{ else }}http://127.0.0.1:9094/alerts/ticket{{ end }}'
        send_resolved: true
  - name: cyp-logging
    webhook_configs:
      - url: '{{ with nomadVar "cyp-memo/monitoring/webhooks" }}{{ .logging_url }}{{ else }}http://127.0.0.1:9094/alerts/logging{{ end }}'
        send_resolved: true
  - name: cyp-catch-all
    webhook_configs:
      - url: '{{ with nomadVar "cyp-memo/monitoring/webhooks" }}{{ .catch_all_url }}{{ else }}http://127.0.0.1:9094/alerts/catch-all{{ end }}'
        send_resolved: true

inhibit_rules:
  - source_matchers:
      - tier = "page"
    target_matchers:
      - tier = "ticket"
    equal: ['alertname']
  - source_matchers:
      - tier = "page"
    target_matchers:
      - tier = "logging"
    equal: ['alertname']
EOF
        destination = "local/alertmanager.yml"
        change_mode   = "restart"
      }

      logs {
        max_files     = 5
        max_file_size = 20
      }
    }
  }

  # ===========================================================================
  # Group: grafana — 可视化仪表板
  # ===========================================================================
  group "grafana" {
    count = 1

    network {
      port "http" {
        static       = 3000
        to           = 3000
        host_network = "private"
      }
    }

    volume "grafana-data" {
      type      = "host"
      read_only = false
      source    = "cyp-memo-grafana-data"
    }

    restart {
      attempts = 5
      interval = "10m"
      delay    = "30s"
      mode     = "delay"
    }

    service {
      name = "cyp-memo-grafana"
      port = "http"
      tags = [
        "cyp-memo",
        "monitoring",
        "grafana",
      ]

      check {
        name     = "grafana-health"
        type     = "http"
        path     = "/api/health"
        port     = "http"
        interval = "30s"
        timeout  = "3s"
      }
    }

    task "grafana" {
      driver = "docker"

      config {
        image = var.grafana_image
        ports = ["http"]

        volumes = [
          "local/datasources.yml:/etc/grafana/provisioning/datasources/datasource.yml:ro",
          "local/dashboards.yml:/etc/grafana/provisioning/dashboards/dashboards.yml:ro",
        ]
      }

      resources {
        cpu    = 200   # MHz
        memory = 512   # MB
      }

      volume_mount {
        volume      = "grafana-data"
        destination = "/var/lib/grafana"
        read_only   = false
      }

      env {
        GF_SECURITY_ADMIN_USER     = "admin"
        GF_USERS_ALLOW_SIGN_UP     = "false"
        GF_ANALYTICS_REPORTING_ENABLED = "false"
        GF_ANALYTICS_CHECK_FOR_UPDATES = "false"
      }

      # 数据源配置（指向 Consul 中的 Prometheus）
      template {
        data = <<EOF
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://cyp-memo-prometheus.service.consul:9090
    isDefault: true
    editable: false
EOF
        destination = "local/datasources.yml"
      }

      # 仪表板配置（从 Nomad Variable 加载仪表板 JSON）
      template {
        data = <<EOF
apiVersion: 1
providers:
  - name: cyp-memo
    orgId: 1
    folder: 'CYP-memo'
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /var/lib/grafana/dashboards
EOF
        destination = "local/dashboards.yml"
      }

      logs {
        max_files     = 5
        max_file_size = 20
      }
    }
  }

  # ===========================================================================
  # Group: node-exporter — 主机指标采集（system 模式，每个节点一个）
  # ===========================================================================
  group "node-exporter" {
    count = 1

    network {
      port "http" {
        static       = 9100
        to           = 9100
        host_network = "private"
      }
    }

    # 使用 system 模式在每个客户端节点上运行（可选）
    # 将 type 改为 "system" 可实现每节点一个实例
    # type = "system"

    restart {
      attempts = 3
      interval = "10m"
      delay    = "1m"
      mode     = "delay"
    }

    service {
      name = "node-exporter"
      port = "http"
      tags = [
        "cyp-memo",
        "monitoring",
        "node-exporter",
      ]

      check {
        name     = "node-exporter-health"
        type     = "http"
        path     = "/metrics"
        port     = "http"
        interval = "30s"
        timeout  = "3s"
      }
    }

    task "node-exporter" {
      driver = "docker"

      config {
        image = var.node_exporter_image
        ports = ["http"]

        args = [
          "--path.procfs=/host/proc",
          "--path.sysfs=/host/sys",
          "--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)",
        ]

        volumes = [
          "/proc:/host/proc:ro",
          "/sys:/host/sys:ro",
          "/:/rootfs:ro",
        ]
      }

      resources {
        cpu    = 50    # MHz
        memory = 64    # MB
      }

      logs {
        max_files     = 3
        max_file_size = 10
      }
    }
  }
}
