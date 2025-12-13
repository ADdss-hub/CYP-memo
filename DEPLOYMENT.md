# CYP备忘录部署指南

## 1. 容器化部署

### 1.1 环境要求

- Docker 20.10+ 
- Docker Compose 1.29+
- 至少 1GB 可用内存
- 至少 10GB 可用存储空间

### 1.2 快速开始

#### 1.2.1 克隆仓库

```bash
git clone https://github.com/your-repo/cyp-memo.git
cd cyp-memo
```

#### 1.2.2 配置环境变量

复制并修改环境变量文件：

```bash
cp .env.example .env
```

根据需要修改 `.env` 文件中的配置，主要包括：

- `APP_NAME`: 应用名称
- `SECRET_KEY`: 密钥，用于JWT加密
- `DATABASE_URL`: 数据库连接字符串
- `WEBDAV_ENABLED`: 是否启用WebDAV服务
- `WEBDAV_PORT`: WebDAV服务端口

#### 1.2.3 启动服务

```bash
# 在项目根目录执行
docker-compose -f docker/docker-compose.yml up -d
```

### 1.3 NAS环境部署

#### 1.3.1 NAS环境要求

- 支持Docker的NAS设备（如群晖Synology、威联通QNAP、铁威马TerraMaster等）
- 足够的存储空间用于数据存储
- 网络访问权限

#### 1.3.2 NAS部署步骤

1. **创建共享文件夹**
   - 在NAS上创建共享文件夹，如 `docker/cyp-memo`
   - 在该文件夹下创建子文件夹：`data`、`uploads`

2. **配置docker-compose.yml**
   - 修改 `docker/docker-compose.yml` 文件中的卷配置：
   
   ```yaml
   volumes:
     app_data:
       driver: local
       driver_opts:
         type: none
         device: /volume1/docker/cyp-memo/data  # 替换为你的NAS共享文件夹路径
         o: bind
     app_uploads:
       driver: local
       driver_opts:
         type: none
         device: /volume1/docker/cyp-memo/uploads  # 替换为你的NAS共享文件夹路径
         o: bind
   ```

3. **部署到NAS**
   - 将项目文件复制到NAS共享文件夹
   - 通过NAS的Docker管理界面或SSH连接到NAS
   - 执行启动命令：
   
   ```bash
   cd /volume1/docker/cyp-memo
   docker-compose -f docker/docker-compose.yml up -d
   ```

#### 1.3.3 NAS设备特定配置

##### 群晖Synology

1. 安装Docker套件
2. 打开File Station，创建共享文件夹
3. 通过SSH连接到群晖：
   
   ```bash
   ssh admin@your-synology-ip
   ```

4. 执行部署命令

##### 威联通QNAP

1. 安装Container Station
2. 创建共享文件夹
3. 通过SSH连接到QNAP：
   
   ```bash
   ssh admin@your-qnap-ip
   ```

4. 执行部署命令

##### 铁威马TerraMaster

1. 安装TOS系统
2. 安装Docker应用
3. 创建共享文件夹
4. 通过SSH连接到TerraMaster：
   
   ```bash
   ssh admin@your-terramaster-ip
   ```

5. 执行部署命令

### 1.4 多平台部署

#### 1.4.1 Linux服务器

```bash
docker-compose -f docker/docker-compose.yml up -d
```

#### 1.4.2 Windows

```powershell
docker-compose -f docker\docker-compose.yml up -d
```

#### 1.4.3 macOS

```bash
docker-compose -f docker/docker-compose.yml up -d
```

### 1.5 服务访问

- **网页端**: http://your-ip:8000
- **WebDAV服务**: http://your-ip:5000
- **API文档**: http://your-ip:8000/docs

## 2. 服务管理

### 2.1 查看服务状态

```bash
docker-compose -f docker/docker-compose.yml ps
```

### 2.2 查看日志

```bash
docker-compose -f docker/docker-compose.yml logs
# 查看特定服务日志
docker-compose -f docker/docker-compose.yml logs web
```

### 2.3 停止服务

```bash
docker-compose -f docker/docker-compose.yml down
```

### 2.4 重启服务

```bash
docker-compose -f docker/docker-compose.yml restart
```

### 2.5 更新服务

```bash
docker-compose -f docker/docker-compose.yml pull
docker-compose -f docker/docker-compose.yml up -d
```

## 3. 配置说明

### 3.1 端口映射

| 服务 | 容器端口 | 主机端口 | 用途 |
|------|----------|----------|------|
| web | 8000 | 8000 | 网页端访问 |
| web | 5000 | 5000 | WebDAV服务 |
| db | 5432 | 5432 | PostgreSQL数据库 |
| redis | 6379 | 6379 | Redis缓存 |
| nginx | 80 | 80 | Nginx反向代理 |
| nginx | 443 | 443 | HTTPS服务 |

### 3.2 环境变量

主要环境变量说明：

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| `APP_NAME` | 应用名称 | CYP备忘录 |
| `APP_ENV` | 应用环境 | production |
| `DEBUG` | 调试模式 | false |
| `DATABASE_URL` | 数据库连接字符串 | sqlite:///./cyp_memo.db |
| `REDIS_URL` | Redis连接字符串 | redis://redis:6379/0 |
| `SECRET_KEY` | 密钥，用于JWT加密 | your-secret-key-change-me-in-production |
| `ALGORITHM` | JWT算法 | HS256 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT过期时间 | 30 |
| `WEBDAV_ENABLED` | 是否启用WebDAV服务 | true |
| `WEBDAV_PORT` | WebDAV服务端口 | 5000 |
| `UPLOAD_DIR` | 文件上传目录 | uploads |
| `DATA_DIR` | 数据存储目录 | data |
| `MAX_FILE_SIZE` | 最大文件大小 | 52428800 |

### 3.3 数据卷

| 卷名称 | 用途 | 默认路径 |
|--------|------|----------|
| `app_data` | 应用数据存储 | ./data |
| `app_uploads` | 文件上传存储 | ./uploads |
| `postgres_data` | PostgreSQL数据 | 自动管理 |
| `redis_data` | Redis数据 | 自动管理 |

## 4. 高级配置

### 4.1 使用HTTPS

1. **准备SSL证书**
   - 将SSL证书文件（如 `cert.pem` 和 `key.pem`）复制到 `docker/nginx/ssl/certs` 目录

2. **配置Nginx**
   - 修改 `docker/nginx/nginx.conf`，启用HTTPS配置
   - 配置SSL证书路径

3. **重启Nginx服务**
   ```bash
   docker-compose -f docker/docker-compose.yml restart nginx
   ```

### 4.2 性能优化

1. **数据库优化**
   - 根据实际使用情况调整PostgreSQL配置
   - 修改 `docker-compose.yml` 中的 `command` 部分

2. **Redis优化**
   - 根据实际使用情况调整Redis配置
   - 修改 `docker-compose.yml` 中的 `command` 部分

3. **资源限制**
   - 根据服务器资源情况调整服务的资源限制
   - 修改 `docker-compose.yml` 中的 `deploy.resources` 部分

## 5. 故障排除

### 5.1 常见问题

1. **服务无法启动**
   - 检查日志：`docker-compose -f docker/docker-compose.yml logs`
   - 检查端口是否被占用：`netstat -tuln`
   - 检查环境变量配置是否正确

2. **数据库连接失败**
   - 检查数据库服务是否正常运行
   - 检查数据库连接字符串是否正确
   - 检查网络配置是否正确

3. **WebDAV服务无法访问**
   - 检查WebDAV服务是否启用
   - 检查WebDAV端口是否正确映射
   - 检查防火墙设置

4. **文件上传失败**
   - 检查上传目录权限
   - 检查文件大小是否超过限制
   - 检查磁盘空间是否足够

### 5.2 日志查看

```bash
# 查看所有服务日志
docker-compose -f docker/docker-compose.yml logs

# 查看特定服务日志
docker-compose -f docker/docker-compose.yml logs web

# 实时查看日志
docker-compose -f docker/docker-compose.yml logs -f web
```

## 6. 备份与恢复

### 6.1 数据备份

1. **备份数据库**
   ```bash
   docker-compose -f docker/docker-compose.yml exec db pg_dump -U cyp cyp_memo > backup.sql
   ```

2. **备份数据卷**
   ```bash
   # 备份数据目录
   tar -czvf data-backup.tar.gz ./data
   
   # 备份上传目录
   tar -czvf uploads-backup.tar.gz ./uploads
   ```

### 6.2 数据恢复

1. **恢复数据库**
   ```bash
   docker-compose -f docker/docker-compose.yml exec -i db psql -U cyp cyp_memo < backup.sql
   ```

2. **恢复数据卷**
   ```bash
   # 恢复数据目录
   tar -xzvf data-backup.tar.gz -C ./data
   
   # 恢复上传目录
   tar -xzvf uploads-backup.tar.gz -C ./uploads
   ```

## 7. 版本更新

1. **停止服务**
   ```bash
   docker-compose -f docker/docker-compose.yml down
   ```

2. **更新代码**
   ```bash
   git pull
   ```

3. **更新服务**
   ```bash
   docker-compose -f docker/docker-compose.yml up -d --build
   ```

## 8. 卸载服务

```bash
# 停止并删除容器、网络、卷
docker-compose -f docker/docker-compose.yml down -v

# 删除数据目录（可选）
rm -rf ./data ./uploads
```

## 9. 联系方式

- 作者：CYP
- 邮箱：nasDSSCYP@outlook.com
- 项目地址：https://github.com/your-repo/cyp-memo

## 10. 许可证

MIT License
