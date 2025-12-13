# CYP备忘录项目结构设计

## 项目概述
容器化的CYP备忘录，支持WebDAV、二维码、第三方笔记导入导出、文件解析等功能，中文科技感界面。

## 目录结构
```
CYP-memo/
├── app/                    # 主应用目录
│   ├── api/                # API接口层
│   │   ├── __init__.py
│   │   ├── auth.py         # 认证相关接口
│   │   ├── notes.py        # 笔记相关接口
│   │   ├── files.py        # 文件相关接口
│   │   ├── webdav.py       # WebDAV接口
│   │   └── admin.py        # 管理接口
│   ├── core/               # 核心功能层
│   │   ├── __init__.py
│   │   ├── config.py       # 配置管理
│   │   ├── database.py     # 数据库连接
│   │   ├── webdav.py       # WebDAV实现
│   │   ├── qrcode.py       # 二维码功能
│   │   ├── file_parser.py  # 文件解析器
│   │   └── notifications.py # 通知系统
│   ├── models/             # 数据模型层
│   │   ├── __init__.py
│   │   ├── user.py         # 用户模型
│   │   ├── note.py         # 笔记模型
│   │   ├── tag.py          # 标签模型
│   │   ├── attachment.py   # 附件模型
│   │   └── notification.py # 通知模型
│   ├── schemas/            # 数据验证层
│   │   ├── __init__.py
│   │   ├── user.py         # 用户验证
│   │   ├── note.py         # 笔记验证
│   │   └── auth.py         # 认证验证
│   ├── utils/              # 工具函数层
│   │   ├── __init__.py
│   │   ├── encryption.py   # 加密工具
│   │   ├── file_utils.py   # 文件处理工具
│   │   └── version.py      # 版本管理
│   ├── static/             # 静态资源
│   │   ├── css/            # CSS样式
│   │   ├── js/             # JavaScript
│   │   └── images/         # 图片资源
│   ├── templates/          # HTML模板
│   └── main.py             # 应用入口
├── config/                 # 配置文件目录
│   ├── .env.example        # 环境变量示例
│   └── config.py           # 配置加载
├── docker/                 # Docker相关文件
│   ├── Dockerfile          # Docker镜像构建文件
│   └── docker-compose.yml  # Docker Compose配置
├── tests/                  # 测试目录
│   ├── __init__.py
│   ├── test_auth.py        # 认证测试
│   └── test_notes.py       # 笔记测试
├── .gitignore              # Git忽略文件
├── LICENSE                 # 许可证
├── README.md               # 项目说明
├── requirements.txt        # 依赖列表
└── run.py                  # 运行脚本
```

## 容器化部署方案

### 1. Docker镜像设计
- **基础镜像**: python:3.11-slim
- **依赖管理**: pip安装requirements.txt
- **环境变量**: 通过.env文件配置
- **数据持久化**: 挂载卷到宿主机

### 2. Docker Compose配置
- **服务组件**:
  - web: 主应用服务
  - db: PostgreSQL数据库
  - redis: 缓存服务
  - nginx: 反向代理

### 3. 网络配置
- 使用桥接网络
- 暴露端口: 80(HTTP), 443(HTTPS), 5000(WebDAV)

## 技术栈

### 后端
- **框架**: FastAPI
- **数据库**: PostgreSQL
- **ORM**: SQLAlchemy
- **认证**: JWT
- **文件存储**: 本地文件系统/MinIO
- **WebDAV**: wsgidav
- **二维码**: qrcode + pyzbar
- **文件解析**: PyPDF2, python-docx, openpyxl, PIL

### 前端
- **框架**: Vue 3
- **UI组件**: Element Plus (科技感主题)
- **HTTP客户端**: Axios
- **编辑器**: Quill.js

## 核心功能模块

### 1. 用户认证
- 注册/登录
- JWT令牌
- 权限管理
- 密码重置

### 2. 笔记管理
- 创建/编辑/删除笔记
- 富文本编辑
- 附件上传
- 文件解析到编辑区
- 目录管理
- 标签管理

### 3. 文件处理
- 支持格式: 表格、PDF、文档、图片
- 文件上传/下载
- 文件解析
- 存储位置设置

### 4. WebDAV支持
- 标准WebDAV协议
- 目录同步
- 文件管理

### 5. 二维码功能
- 生成笔记分享二维码
- 扫描二维码导入

### 6. 第三方导入导出
- 支持多种格式
- 批量操作

### 7. 搜索功能
- 全文搜索
- 标签搜索
- 目录搜索

### 8. 管理功能
- 用户管理
- 通知管理
- 系统设置
- 日志查看

## 开发规范

### 代码规范
- 代码文件长度限制: 500行以内
- 模块单一职责
- 自动同步机制
- 中文注释

### 版本规范
- 版本格式: vX.Y.Z
  - X: 主版本号(重大功能变更)
  - Y: 次版本号(新增功能)
  - Z: 修订号( bug修复)
- 自动版本引入
- 版本记录自动生成

### 界面设计
- 中文界面
- 科技感设计
- 响应式布局
- 低资源占用

## 部署流程

1. **环境准备**
   - 安装Docker和Docker Compose
   - 配置环境变量

2. **构建镜像**
   ```bash
docker-compose build
   ```

3. **启动服务**
   ```bash
docker-compose up -d
   ```

4. **访问服务**
   - 网页端: http://localhost
   - WebDAV: http://localhost:5000

## 后续计划

### 第一阶段: 容器化部署和网页端
- 完成后端API开发
- 完成网页端界面开发
- 实现核心功能
- 容器化部署

### 第二阶段: 桌面软件
- 基于Electron开发桌面客户端
- 支持Windows/macOS/Linux

### 第三阶段: 手机APP
- 开发iOS/Android客户端
- 支持离线使用
- 实时同步

## 版权声明

- 作者: CYP
- 联系方式: nasDSSCYP@outlook.com
- 许可证: MIT License
- 免责声明: 本软件仅供个人学习和使用，作者不承担任何责任

## 版本记录

### v0.1.0 (2024-01-01)
- 初始化项目结构
- 完成用户认证功能
- 实现笔记基本操作
- 支持文件上传
- 实现WebDAV服务

### v0.2.0 (2024-01-15)
- 新增二维码生成和扫描功能
- 支持第三方笔记导入导出
- 实现文件解析功能
- 新增目录和标签管理

### v0.3.0 (2024-02-01)
- 完成管理功能
- 实现通知系统
- 优化搜索功能
- 完善中文界面
- 增强科技感设计

### v1.0.0 (2024-03-01)
- 正式发布
- 支持容器化部署
- 网页端稳定运行
- 准备桌面和手机APP开发
