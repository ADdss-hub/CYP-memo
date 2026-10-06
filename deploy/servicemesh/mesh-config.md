# CYP-memo 服务网格配置说明

> 版本：v1.0（预埋）
> 日期：2026-10-05
> 状态：预埋阶段 · 单机模式默认关闭

---

## 一、概述

CYP-memo 服务网格能力为**预埋设计**，当前单机部署模式下默认关闭，通过环境变量可按需启用。未来迁移至多机服务网格架构（Istio / Linkerd / Envoy Native）时，可直接对接现有能力。

### 1.1 设计原则

| 原则 | 说明 |
|------|------|
| **默认关闭** | 所有网格能力默认关闭，不影响现有单机部署 |
| **渐进启用** | 可通过环境变量逐项启用 mTLS / 限流 / 熔断 / 追踪 |
| **向下兼容** | 嵌入式模式与网格模式使用相同的 API 接口 |
| **SPIFFE 原生** | 身份体系基于 SPIFFE，与现有 KMS 信任根统一 |
| **East-West 兼容** | 与现有 East-West Token 机制双轨运行，平滑过渡 |

### 1.2 能力矩阵

| 能力 | 嵌入式模式 | 网格模式 | 配置开关 |
|------|-----------|---------|---------|
| mTLS 双向认证 | ✅ 内置（自定义证书格式） | ✅ Envoy/Istio 原生 | `CYP_MTLS_ENABLED` |
| East-West Token | ✅ 内置 | ✅ 兼容模式 | `CYP_EW_AUTH_MODE` |
| 令牌桶限流 | ✅ 内置 | ✅ Envoy RLS | `CYP_RATE_LIMIT_ENABLED` |
| 三态熔断 | ✅ 内置（出站治理） | ✅ Envoy 原生 | 内置常开 |
| 指数退避重试 | ✅ 内置 | ✅ Envoy 原生 | 内置常开 |
| 幂等性保证 | ✅ fesec 中间件 | ✅ 配合重试使用 | 内置常开 |
| 全链路追踪 | ✅ 内置（Trace ID） | ✅ Zipkin/Jaeger | 内置常开 |
| 服务注册发现 | ✅ 内存注册表 | ✅ Consul/Nomad | 内置常开 |

---

## 二、配置文件说明

### 2.1 文件清单

```
deploy/servicemesh/
├── envoy-sidecar.yaml     # Envoy sidecar 配置模板
├── traffic-policy.yaml    # 流量策略配置（路由/重试/熔断/限流）
└── mesh-config.md         # 本说明文档
```

### 2.2 envoy-sidecar.yaml

Envoy sidecar 配置模板，包含：

- **入站监听器**（5170 端口）：南北向流量，接入限流、熔断、重试
- **出站监听器**（15001 端口）：East-West 流量，mTLS 加密
- **集群定义**：主服务、KMS、MCP、限流服务
- **mTLS 配置**：SPIFFE 证书 + SAN 校验

#### 关键路径映射

| Envoy 路径 | KMS mTLS 路径 | 说明 |
|-----------|--------------|------|
| `/etc/certs/ca.crt` | `{dataDir}/kms/mtls/ca.crt` | SPIFFE 信任根 CA 证书 |
| `/etc/certs/workload.crt` | `{dataDir}/kms/mtls/workload.crt` | 工作负载证书 |
| `/etc/certs/workload.key` | `{dataDir}/kms/mtls/workload.key` | 工作负载私钥 |

### 2.3 traffic-policy.yaml

流量策略配置，定义了：

- **路由策略**：主服务、API、KMS、MCP 的路由规则
- **重试策略**：4 套预设策略（默认/快速失败/KMS专用/幂等写）
- **熔断策略**：3 套预设策略（默认/敏感服务/高并发）
- **限流策略**：5 套预设策略（IP/租户/用户/East-West/KMS）
- **mTLS 策略**：全局 + 服务级配置
- **可观测性**：访问日志、追踪、指标

---

## 三、SPIFFE 身份规划

### 3.1 信任域

```
runtimebase.local
```

与 KMS SPIFFE 信任根完全一致，确保身份体系统一。

### 3.2 服务 SPIFFE ID

| 服务 | 稳定 ID | SPIFFE ID |
|------|---------|-----------|
| 网关中心 | RB-L1-HOST-BIZ-01 | `spiffe://runtimebase.local/host/biz` |
| KMS 密钥保险箱 | RB-L1-MGMT-KMS-01 | `spiffe://runtimebase.local/mgmt/kms` |
| 身份访问管控 | RB-L1-MGMT-IAM-01 | `spiffe://runtimebase.local/mgmt/iam` |
| 审计中心 | RB-L1-HOST-AUDIT-01 | `spiffe://runtimebase.local/host/audit` |
| MCP Server | - | `spiffe://runtimebase.local/host/mcp` |
| 配置管控 | RB-L1-MGMT-CONF-01 | `spiffe://runtimebase.local/mgmt/conf` |
| 告警中心 | RB-L1-HOST-ALERT-01 | `spiffe://runtimebase.local/host/alert` |
| 任务调度 | RB-L1-HOST-SCHED-01 | `spiffe://runtimebase.local/host/sched` |

### 3.3 证书生命周期

| 阶段 | 说明 | 时长 |
|------|------|------|
| TTL | 证书有效期 | 24 小时 |
| 提前轮换 | 到期前自动轮换 | 到期前 1 小时 |
| 双证书过渡 | 新旧证书同时有效 | 轮换期内自动兼容 |
| 旧证撤销 | 确认切换后撤销 | 轮换完成后立即 |

---

## 四、部署模式切换

### 4.1 模式对比

| 维度 | 本地模式（默认） | 网格模式 |
|------|----------------|---------|
| mTLS | 关闭（可选开启） | 强制开启 |
| 认证方式 | Session / Token | mTLS (SPIFFE) + Token |
| 限流 | API Budget（IAM 内） | 令牌桶 + 网格 RLS |
| 熔断 | 出站治理（嵌入式） | Envoy outlier detection |
| 服务发现 | 内存注册表 | Consul / Nomad / K8s |
| 证书管理 | KMS 嵌入式 | Istio CA / Vault |

### 4.2 切换步骤

#### 从本地模式 → 网格模式

```bash
# 1. 启用 mTLS
export CYP_MTLS_ENABLED=1

# 2. 启用 East-West 流量管控
export CYP_EW_TRAFFIC_ENABLED=1
export CYP_EW_AUTH_MODE=both   # 双模式兼容，平滑过渡

# 3. 启用令牌桶限流
export CYP_RATE_LIMIT_ENABLED=1

# 4. 重启服务
./scripts/start/start-local.sh
```

#### 验证切换成功

```bash
# 检查 mTLS 状态
curl -k https://127.0.0.1:5170/api/health
# 应返回正常响应

# 检查 East-West 中间件
curl -H "X-EW-Caller: test" -H "X-EW-Callee: test" \
  -H "Authorization: Bearer invalid" \
  http://127.0.0.1:5170/api/internal/test
# 应返回 401 Unauthorized
```

---

## 五、与现有安全体系的集成

### 5.1 KMS 集成

- **信任根**：复用 KMS SPIFFE 信任根（`runtimebase.local`）
- **证书签发**：KMS `mtls.ts` 模块负责 CA 和工作负载证书管理
- **密钥轮换**：证书轮换与 KMS 密钥轮换机制对齐
- **完善性校验**：K1-K7 七项安全红线校验覆盖 mTLS 证书

### 5.2 East-West Token 集成

- **双模式**：`CYP_EW_AUTH_MODE=both` 时 Token 和 mTLS 任一通过即可
- **平滑过渡**：优先使用 mTLS，失败回退到 Token
- **统一中间件**：`ewTrafficMiddleware` 同时处理两种认证方式
- **授权统一**：两种认证方式均走 `isServiceCallGranted` 授权检查

### 5.3 幂等键集成

- **重试安全**：`retry.ts` 自动为写请求生成幂等键
- **格式兼容**：与 `fesec` 幂等中间件使用相同的键格式
- **头部传递**：通过 `Idempotency-Key` 请求头传递

### 5.4 全链路追踪集成

- **Trace ID 传递**：East-West 调用自动传递 `X-Trace-Id`
- **调用链标记**：`X-EW-Handled` 响应头标记经过中间件
- **事件联动**：限流/熔断/认证失败均发布领域事件

---

## 六、未来接入 Istio / Linkerd

### 6.1 Istio 接入步骤

1. **部署 Istio control plane**
   ```bash
   istioctl install --set profile=default
   ```

2. **启用 sidecar 注入**
   ```bash
   kubectl label namespace default istio-injection=enabled
   ```

3. **应用流量策略**
   ```bash
   # 将 traffic-policy.yaml 转换为 Istio CRD 格式后应用
   kubectl apply -f istio-policies/
   ```

4. **配置 SPIFFE 信任根**
   - 将 KMS CA 证书导入 Istio CA
   - 或配置 Istio 使用外部 CA（KMS）

5. **迁移认证方式**
   - 逐步将 `CYP_EW_AUTH_MODE` 从 `both` 切换到 `mtls`
   - 验证所有 East-West 调用均通过 mTLS 认证

### 6.2 Linkerd 接入步骤

1. **安装 Linkerd**
   ```bash
   linkerd install | kubectl apply -f -
   ```

2. **注入 sidecar**
   ```bash
   kubectl get deploy -o yaml | linkerd inject - | kubectl apply -f -
   ```

3. **配置服务配置文件（SP）**
   - 参考 `traffic-policy.yaml` 创建 Linkerd ServiceProfile

### 6.3 Consul / Nomad 集成

- **服务注册**：将 `l1/col/svc` 内存注册表替换为 Consul 客户端
- **健康检查**：使用 Consul 健康检查替代心跳机制
- **配置同步**：流量策略通过 Consul KV 存储和分发
- **mTLS**：使用 Consul Connect 或直接使用 KMS 证书

---

## 七、安全注意事项

1. **证书存储权限**：mTLS 证书目录权限应为 0700，证书文件 0600
2. **私钥保护**：工作负载私钥永不落盘明文（当前已通过 KMS 加密目录保护）
3. **证书轮换**：生产环境建议将 TTL 缩短至 1 小时，增加轮换频率
4. **严格模式**：确认所有服务支持 mTLS 后，切换到 `STRICT` 模式
5. **审计日志**：所有 mTLS 握手、限流、熔断事件均有审计记录
6. **East-West Token 退役**：mTLS 完全稳定后，可关闭 Token 模式

---

## 八、故障排查

### 8.1 mTLS 握手失败

- 检查 `CYP_MTLS_ENABLED` 是否设置为 `1`
- 检查证书目录：`{dataDir}/kms/mtls/`
- 查看日志：搜索 `mtls_` 前缀的日志条目
- 验证证书有效期：检查 `notAfter` 是否过期

### 8.2 限流误拦截

- 查看当前策略：`listPolicies()`
- 查看桶状态：`getBucketSnapshot()`
- 调整限流阈值：修改环境变量或动态更新策略
- 临时禁用：设置 `CYP_RATE_LIMIT_ENABLED=0`

### 8.3 熔断误触发

- 查看电路状态：`listCircuitSnapshotDetail()`
- 检查下游服务健康状态
- 调整熔断阈值：修改 `CYP_EGRESS_*` 环境变量
- 手动重置：`resetCircuit(dependency)`

---

*文档结束 · CYP-memo 服务网格配置说明*
