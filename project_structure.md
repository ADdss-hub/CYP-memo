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
│   │   ├── admin.py        # 管理接口
│   │   └── system.py       # 系统相关接口
│   ├── core/               # 核心功能层
│   │   ├── __init__.py
│   │   ├── config.py       # 配置管理
│   │   ├── database.py     # 数据库连接
│   │   ├── webdav.py       # WebDAV实现
│   │   ├── qrcode.py       # 二维码功能
│   │   └── file_parser.py  # 文件解析器
│   ├── models/             # 数据模型层
│   │   ├── __init__.py
│   │   ├── user.py         # 用户模型
│   │   ├── note.py         # 笔记模型
│   │   ├── tag.py          # 标签模型
│   │   ├── attachment.py   # 附件模型
│   │   └── notification.py # 通知模型
│   ├── schemas/            # 数据验证层
│   │   ├── __init__.py
│   │   ├── auth.py         # 认证验证
│   │   └── note.py         # 笔记验证
│   ├── utils/              # 工具函数层
│   │   ├── __init__.py
│   │   └── version.py      # 版本管理
│   ├── static/             # 静态资源
│   │   ├── assets/         # 前端构建资源
│   │   │   ├── index-*.css # 样式文件
│   │   │   └── index-*.js  # JavaScript文件
│   │   ├── index.html      # 首页
│   │   └── vite.svg        # Vite图标
│   ├── templates/          # HTML模板
│   │   └── index.html      # 首页模板
│   └── main.py             # 应用入口
├── docker/                 # Docker相关文件
│   ├── nginx/              # Nginx配置
│   │   └── nginx.conf      # Nginx配置文件
│   ├── Dockerfile          # Docker镜像构建文件
│   └── docker-compose.yml  # Docker Compose配置
├── unified-version-system/ # 版本规范系统
│   ├── .version/           # 版本文件目录
│   ├── core/               # 核心功能
│   ├── docs/               # 文档
│   ├── .version-config.json # 版本配置
│   ├── .version-record.json # 版本记录
│   ├── README.md           # 版本系统说明
│   ├── package.json        # 版本系统依赖
│   └── version-record-simple.js # 版本记录脚本
├── web/                    # 前端代码目录
│   ├── .vscode/            # VSCode配置
│   ├── public/             # 公共资源
│   ├── src/                # 源代码
│   │   ├── assets/         # 静态资源
│   │   ├── components/     # Vue组件
│   │   ├── App.vue         # 根组件
│   │   ├── main.js         # 入口文件
│   │   └── style.css       # 全局样式
│   ├── .gitignore          # Git忽略文件
│   ├── README.md           # 前端项目说明
│   ├── index.html          # HTML模板
│   ├── package-lock.json   # NPM锁定文件
│   ├── package.json        # NPM依赖
│   └── vite.config.js      # Vite配置
├── .env                    # 环境变量
├── DEPLOYMENT.md           # 部署文档
├── DEVELOPMENT_DOCS.md     # 开发文档
├── cyp_memo.db             # SQLite数据库文件
├── project_structure.md    # 项目结构文档
├── requirements.txt        # Python依赖列表
├── run.py                  # 运行脚本
├── test_basic.py           # 基础功能测试
└── test_config.py          # 配置测试
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
  - nginx: 反向代理

### 3. 网络配置
- 使用桥接网络
- 暴露端口: 80(HTTP), 5000(WebDAV)

## 技术栈

### 后端
- **框架**: FastAPI
- **数据库**: SQLite
- **ORM**: SQLAlchemy
- **认证**: JWT
- **文件存储**: 本地文件系统
- **WebDAV**: wsgidav
- **二维码**: qrcode + pyzbar
- **文件解析**: PyPDF2, python-docx, openpyxl, PIL

### 前端
- **框架**: Vue 3
- **UI组件**: Element Plus (科技感主题)
- **HTTP客户端**: Axios
- **构建工具**: Vite

## 核心功能模块

### 1. 用户认证
- 注册/登录
- JWT令牌
- 权限管理

### 2. 笔记管理
- 创建/编辑/删除笔记
- 富文本编辑
- 附件上传
- 文件解析到编辑区
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

### 6. 系统管理
- 系统信息
- 存储信息
- 健康检查

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
   - API文档: http://localhost/docs

## 后续计划

### 第一阶段: 容器化部署和网页端
- 完成后端API开发
- 完成网页端界面开发
- 实现核心功能
- 容器化部署

### 第二阶段: 桌面软件
- 基于Electron开发桌面客户端
- 支持Windows/macOS/Linux
- 实现离线使用功能
- 实时同步

### 第三阶段: 手机APP
- 开发iOS/Android客户端
- 支持离线使用
- 实时同步
- 移动端优化
