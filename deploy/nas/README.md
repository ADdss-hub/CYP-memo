# CYP-memo · NAS 原生部署（非 Docker）

| NAS | 建议数据目录示例 | 说明 |
|-----|------------------|------|
| 飞牛 fnOS | `/vol1/cyp-memo-data` | 系统 Node ≥ 20；任务计划开机拉起 |
| 群晖 DSM | `/volume1/cyp-memo-data` | Package Center 装 Node 或手动安装；**无 SPK 商店包（本批）** |
| 威联通 QTS | `/share/CACHEDEV1_DATA/cyp-memo-data` | 同上 |

## 强制

| 项 | 要求 |
|----|------|
| 闭集 35 | 安装末步跑 `scripts/verify/verify-five-centers.sh` |
| 环境 | `APP_ENV=prod` · `NODE_ENV=production` · `DATA_DIR=<上表>` |
| 权限 | `DATA_DIR` 与 `{DATA_DIR}/logs` · `{DATA_DIR}/governance` 对运行用户可写 |
| 禁止 | Docker / PUID 容器方案 / compose |

## 步骤

1. 解压 `cyp-memo-server-*.tar.gz`
2. `bash scripts/install/install-nas.sh <解压目录> <DATA_DIR>`
3. 用 NAS 反代或应用门户指向 `http://127.0.0.1:5170`
4. 确认 `GET /healthz/ready`
