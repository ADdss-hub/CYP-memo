# CYP备忘录开发文档设计方案

## 1. 项目概述

### 1.1 项目简介
CYP备忘录是一款容器化的笔记管理应用，支持WebDAV、二维码、文件解析等多种功能，为用户提供高效、安全的笔记管理体验。该应用采用前后端分离架构，支持网页端、桌面端和手机APP使用。

### 1.2 核心功能
- WebDAV支持：实现文件同步和共享
- 二维码功能：生成和扫描二维码，方便分享和导入
- 第三方笔记导入导出：支持多种格式
- 文件解析：支持PDF、Word、Excel、图片等格式
- 标签管理：对笔记进行分类和管理
- 全文搜索：快速查找笔记
- 用户认证：安全的登录和权限管理
- 通知系统：实时通知用户
- 低资源占用：优化系统资源使用

### 1.3 设计原则
- 容器化部署：方便在局域网内使用
- 模块化设计：代码模块单一、集中和统一
- 自动同步：实现数据自动同步
- 中文界面：全中文科技感界面
- 低资源占用：优化系统资源使用
- 免费开源：使用免费的接口和库

## 2. 技术栈

### 2.1 后端技术栈
| 技术/框架 | 版本 | 用途 |
|----------|------|------|
| FastAPI | 0.104.1 | Web框架 |
| SQLAlchemy | 2.0.23 | ORM框架 |
| SQLite | 3.41.2 | 数据库 |
| Redis | 7 | 缓存服务（可选） |
| JWT | 3.3.0 | 认证机制 |
| wsgidav | 4.2.0 | WebDAV实现 |
| qrcode | 7.4.2 | 二维码生成 |
| pyzbar | 0.1.9 | 二维码扫描 |
| PyPDF2 | 3.0.1 | PDF解析 |
| python-docx | 0.8.11 | Word解析 |
| openpyxl | 3.1.2 | Excel解析 |
| Pillow | 10.2.0 | 图像处理 |

### 2.2 前端技术栈
| 技术/框架 | 版本 | 用途 |
|----------|------|------|
| Vue 3 | - | 前端框架 |
| Element Plus | - | UI组件库 |
| Axios | - | HTTP客户端 |
| Quill.js | - | 富文本编辑器 |

### 2.3 容器化技术
| 技术 | 版本 | 用途 |
|------|------|------|
| Docker | 20+ | 容器化平台 |
| Docker Compose | 3.9 | 容器编排 |
| Nginx | 1.25 | 反向代理 |

## 3. 项目结构

```
CYP-memo/
├── app/                    # 主应用目录
│   ├── api/                # API接口层
│   │   ├── __init__.py     # 接口初始化
│   │   ├── auth.py         # 认证相关接口
│   │   ├── notes.py        # 笔记相关接口
│   │   ├── files.py        # 文件相关接口
│   │   ├── webdav.py       # WebDAV接口
│   │   ├── admin.py        # 管理接口
│   │   └── system.py       # 系统相关接口
│   ├── core/               # 核心功能层
│   │   ├── __init__.py     # 核心功能初始化
│   │   ├── config.py       # 配置管理
│   │   ├── database.py     # 数据库连接
│   │   ├── webdav.py       # WebDAV实现
│   │   ├── qrcode.py       # 二维码功能
│   │   └── file_parser.py  # 文件解析器
│   ├── models/             # 数据模型层
│   │   ├── __init__.py     # 模型初始化
│   │   ├── user.py         # 用户模型
│   │   ├── note.py         # 笔记模型
│   │   ├── tag.py          # 标签模型
│   │   ├── attachment.py   # 附件模型
│   │   └── notification.py # 通知模型
│   ├── schemas/            # 数据验证层
│   │   ├── __init__.py     # 验证模型初始化
│   │   ├── auth.py         # 认证验证模型
│   │   └── note.py         # 笔记验证模型
│   ├── static/             # 静态资源
│   │   ├── assets/         # 前端构建资源
│   │   │   ├── index-*.css # 样式文件
│   │   │   └── index-*.js  # JavaScript文件
│   │   ├── index.html      # 首页
│   │   └── vite.svg        # Vite图标
│   ├── templates/          # HTML模板
│   │   └── index.html      # 首页模板
│   ├── utils/              # 工具函数层
│   │   ├── __init__.py     # 工具函数初始化
│   │   └── version.py      # 版本管理
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

## 4. 容器化部署方案

### 4.1 Docker镜像设计
- **基础镜像**: python:3.11-slim
- **依赖管理**: pip安装requirements.txt
- **环境变量**: 通过.env文件配置
- **数据持久化**: 挂载卷到宿主机

### 4.2 Docker Compose配置
- **服务组件**:
  - web: 主应用服务
  - db: PostgreSQL数据库
  - redis: 缓存服务
  - nginx: 反向代理

### 4.3 网络配置
- 使用桥接网络
- 暴露端口: 80(HTTP), 443(HTTPS), 5000(WebDAV)

### 4.4 数据持久化
- **数据库**: 挂载到宿主机的postgres_data卷
- **Redis**: 挂载到宿主机的redis_data卷
- **应用数据**: 挂载到宿主机的./data目录
- **上传文件**: 挂载到宿主机的./uploads目录

## 5. 核心功能模块设计

### 5.1 WebDAV功能
- **实现方式**: 使用wsgidav库
- **根目录**: data/webdav
- **认证**: 支持基本认证
- **功能**: 文件上传、下载、删除、重命名、创建目录

### 5.2 二维码功能
- **生成二维码**: 使用qrcode库
- **扫描二维码**: 使用pyzbar库
- **支持格式**: PNG
- **用途**: 笔记分享、内容导入

### 5.3 文件解析功能
- **支持格式**:
  - PDF: 使用PyPDF2
  - Word: 使用python-docx
  - Excel: 使用openpyxl
  - 图片: 使用Pillow
  - 文本文件: 直接读取

### 5.4 通知系统
- **实现方式**: 数据库存储通知
- **通知类型**: 系统通知、用户通知
- **状态**: 已读/未读
- **用途**: 系统公告、操作提醒

### 5.5 搜索功能
- **实现方式**: 数据库全文搜索
- **搜索范围**: 笔记标题、内容、标签
- **排序**: 按相关性、时间排序

## 6. API接口设计

### 6.1 认证接口
| 方法 | 路径 | 功能 | 认证 |
|------|------|------|------|
| POST | /api/auth/register | 用户注册 | 否 |
| POST | /api/auth/token | 获取访问令牌 | 否 |
| GET | /api/auth/me | 获取当前用户信息 | 是 |
| PUT | /api/auth/me | 更新当前用户信息 | 是 |
| PUT | /api/auth/password | 修改密码 | 是 |

### 6.2 笔记接口
| 方法 | 路径 | 功能 | 认证 |
|------|------|------|------|
| GET | /api/notes | 获取笔记列表 | 是 |
| POST | /api/notes | 创建笔记 | 是 |
| GET | /api/notes/{id} | 获取笔记详情 | 是 |
| PUT | /api/notes/{id} | 更新笔记 | 是 |
| DELETE | /api/notes/{id} | 删除笔记 | 是 |
| POST | /api/notes/{id}/share | 分享笔记 | 是 |
| GET | /api/notes/share/{share_id} | 获取分享笔记 | 否 |

### 6.3 文件接口
| 方法 | 路径 | 功能 | 认证 |
|------|------|------|------|
| POST | /api/files/upload | 上传文件 | 是 |
| GET | /api/files/{id} | 下载文件 | 是 |
| DELETE | /api/files/{id} | 删除文件 | 是 |
| POST | /api/files/parse | 解析文件 | 是 |

### 6.4 WebDAV接口
| 方法 | 路径 | 功能 | 认证 |
|------|------|------|------|
| GET | /api/webdav/info | 获取WebDAV信息 | 是 |
| POST | /api/webdav/users | 创建WebDAV用户 | 是 |
| GET | /api/webdav/users | 获取WebDAV用户列表 | 是 |
| DELETE | /api/webdav/users/{id} | 删除WebDAV用户 | 是 |

### 6.5 管理接口
| 方法 | 路径 | 功能 | 认证 |
|------|------|------|------|
| GET | /api/admin/users | 获取用户列表 | 是(管理员) |
| PUT | /api/admin/users/{id} | 更新用户信息 | 是(管理员) |
| DELETE | /api/admin/users/{id} | 删除用户 | 是(管理员) |
| POST | /api/admin/notifications | 发送通知 | 是(管理员) |
| GET | /api/admin/stats | 获取系统统计 | 是(管理员) |

## 7. 数据库设计

### 7.1 用户表(users)
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY | 用户ID |
| username | String(50) | UNIQUE | 用户名 |
| email | String(100) | UNIQUE | 邮箱 |
| hashed_password | String(255) | NOT NULL | 哈希密码 |
| full_name | String(100) | - | 真实姓名 |
| is_active | Boolean | DEFAULT TRUE | 是否激活 |
| is_admin | Boolean | DEFAULT FALSE | 是否为管理员 |
| avatar | String(255) | - | 头像 |
| created_at | DateTime | DEFAULT NOW() | 创建时间 |
| updated_at | DateTime | - | 更新时间 |
| last_login | DateTime | - | 最后登录时间 |

### 7.2 笔记表(notes)
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY | 笔记ID |
| title | String(200) | NOT NULL | 笔记标题 |
| content | Text | - | 笔记内容 |
| is_public | Boolean | DEFAULT FALSE | 是否公开 |
| is_favorite | Boolean | DEFAULT FALSE | 是否收藏 |
| view_count | Integer | DEFAULT 0 | 浏览次数 |
| created_at | DateTime | DEFAULT NOW() | 创建时间 |
| updated_at | DateTime | - | 更新时间 |
| owner_id | Integer | FOREIGN KEY | 所属用户ID |
| parent_id | Integer | FOREIGN KEY | 父笔记ID |

### 7.3 标签表(tags)
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY | 标签ID |
| name | String(50) | UNIQUE | 标签名称 |
| description | String(200) | - | 标签描述 |
| color | String(20) | DEFAULT '#3498db' | 标签颜色 |
| created_at | DateTime | DEFAULT NOW() | 创建时间 |
| updated_at | DateTime | - | 更新时间 |
| owner_id | Integer | FOREIGN KEY | 所属用户ID |

### 7.4 笔记标签关联表(note_tags)
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| note_id | Integer | PRIMARY KEY, FOREIGN KEY | 笔记ID |
| tag_id | Integer | PRIMARY KEY, FOREIGN KEY | 标签ID |

### 7.5 附件表(attachments)
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY | 附件ID |
| filename | String(255) | NOT NULL | 文件名 |
| file_path | String(500) | NOT NULL | 文件路径 |
| file_type | String(50) | NOT NULL | 文件类型 |
| file_size | Integer | NOT NULL | 文件大小 |
| is_parsed | Boolean | DEFAULT FALSE | 是否已解析 |
| created_at | DateTime | DEFAULT NOW() | 创建时间 |
| owner_id | Integer | FOREIGN KEY | 所属用户ID |
| note_id | Integer | FOREIGN KEY | 所属笔记ID |

### 7.6 通知表(notifications)
| 字段名 | 数据类型 | 约束 | 描述 |
|--------|----------|------|------|
| id | Integer | PRIMARY KEY | 通知ID |
| title | String(100) | NOT NULL | 通知标题 |
| content | Text | NOT NULL | 通知内容 |
| notification_type | String(50) | NOT NULL | 通知类型 |
| is_read | Boolean | DEFAULT FALSE | 是否已读 |
| created_at | DateTime | DEFAULT NOW() | 创建时间 |
| user_id | Integer | FOREIGN KEY | 所属用户ID |

## 8. 前端界面设计

### 8.1 设计风格
- **中文界面**: 全中文操作界面
- **科技感设计**: 深色主题、渐变色彩、模糊效果
- **响应式布局**: 适配不同屏幕尺寸
- **简洁高效**: 清晰的导航结构、直观的操作流程

### 8.2 页面结构
1. **登录页面**: 用户登录和注册
2. **首页**: 笔记列表、搜索框、快捷操作
3. **笔记编辑页面**: 富文本编辑器、附件上传、标签管理
4. **文件管理页面**: 文件列表、上传、下载、解析
5. **标签管理页面**: 标签列表、创建、编辑、删除
6. **用户中心**: 个人信息、密码修改、通知中心
7. **管理后台**: 用户管理、系统设置、统计分析

### 8.3 核心组件
- **富文本编辑器**: Quill.js
- **文件上传组件**: 支持拖拽上传、多文件上传
- **二维码生成器**: 实时生成分享二维码
- **搜索组件**: 支持全文搜索、标签搜索
- **通知组件**: 实时通知提醒

## 9. 开发规范

### 9.1 代码规范
- **文件长度**: 单个文件不超过500行
- **模块单一职责**: 每个模块只负责一个功能
- **自动同步**: 实现数据自动同步机制
- **中文注释**: 关键代码添加中文注释
- **命名规范**: 采用驼峰命名法或下划线命名法

### 9.2 版本规范
- **版本格式**: vX.Y.Z
  - X: 主版本号(重大功能变更)
  - Y: 次版本号(新增功能)
  - Z: 修订号( bug修复)
- **自动版本引入**: 使用函数显示到项目文件中
- **版本记录**: 生成细化的版本记录

### 9.3 安全规范
- **密码加密**: 使用bcrypt算法
- **认证机制**: JWT令牌
- **权限管理**: 基于角色的访问控制
- **输入验证**: 严格的输入验证
- **SQL注入防护**: 使用ORM框架

### 9.4 性能规范
- **低资源占用**: 优化内存和CPU使用
- **缓存机制**: 使用Redis缓存
- **异步处理**: 异步IO操作
- **数据库优化**: 索引优化、查询优化

## 10. 版本管理

### 10.1 版本号生成
- **当前版本**: v0.1.0
- **版本函数**: `get_current_version()`
- **版本信息**: 包含作者、联系方式、版本号

### 10.2 版本记录
```
# v0.1.0 (2024-01-01)
- 初始化项目结构
- 完成用户认证功能
- 实现笔记基本操作
- 支持文件上传
- 实现WebDAV服务

# v0.2.0 (2024-01-15)
- 新增二维码生成和扫描功能
- 支持第三方笔记导入导出
- 实现文件解析功能
- 新增目录和标签管理

# v0.3.0 (2024-02-01)
- 完成管理功能
- 实现通知系统
- 优化搜索功能
- 完善中文界面
- 增强科技感设计

# v1.0.0 (2024-03-01)
- 正式发布
- 支持容器化部署
- 网页端稳定运行
- 准备桌面和手机APP开发
```

## 11. 部署流程

### 11.1 环境准备
1. 安装Docker和Docker Compose
2. 配置环境变量
3. 克隆代码仓库

### 11.2 构建镜像
```bash
docker-compose build
```

### 11.3 启动服务
```bash
docker-compose up -d
```

### 11.4 访问服务
- 网页端: http://localhost
- WebDAV: http://localhost:5000
- API文档: http://localhost/docs

### 11.5 停止服务
```bash
docker-compose down
```

## 12. 后续计划

### 12.1 第一阶段: 容器化部署和网页端
- 完成后端API开发
- 完成网页端界面开发
- 实现核心功能
- 容器化部署

### 12.2 第二阶段: 桌面软件
- 基于Electron开发桌面客户端
- 支持Windows/macOS/Linux
- 实现离线使用功能
- 实时同步

### 12.3 第三阶段: 手机APP
- 开发iOS/Android客户端
- 支持离线使用
- 实时同步
- 移动端优化

## 13. 版权声明

### 13.1 作者信息
- **作者**: CYP
- **联系方式**: nasDSSCYP@outlook.com

### 13.2 许可证
- **许可证类型**: MIT License
- **许可证内容**: 详见LICENSE文件

### 13.3 免责声明
- 本软件仅供个人学习和使用
- 作者不承担任何责任
- 请勿用于商业用途

### 13.4 使用声明
- 本软件使用的所有接口和库均为免费开源
- 请遵守相关库的许可证
- 不得修改版权信息

## 14. 开发文档维护

### 14.1 文档更新
- 每次版本迭代后更新文档
- 记录功能变更和API变更
- 保持文档与代码的一致性

### 14.2 文档格式
- 使用Markdown格式
- 清晰的章节结构
- 详细的代码示例
- 完整的API文档

### 14.3 文档共享
- 提交到代码仓库
- 提供在线访问方式
- 定期备份

---

**CYP备忘录开发文档设计方案**

**版本**: v0.1.2
**作者**: CYP
**联系方式**: nasDSSCYP@outlook.com
**创建日期**: 2024-01-01
**最后更新**: 2025-12-13
