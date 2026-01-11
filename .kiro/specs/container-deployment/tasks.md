# Implementation Plan: Container Deployment

## Overview

本实现计划将 CYP-memo 容器化部署系统分解为可执行的编码任务。任务按照依赖关系排序，从基础配置开始，逐步构建完整的容器化能力。

## Tasks

- [x] 1. 优化 Dockerfile 多阶段构建
  - [x] 1.1 重构 Dockerfile 使用优化的多阶段构建
    - 添加构建参数支持版本信息
    - 优化层缓存顺序
    - 添加 LABEL 元数据
    - _Requirements: 1.1, 1.2, 1.4, 6.5_
  - [x] 1.2 添加非 root 用户运行配置
    - 创建 node 用户
    - 设置正确的文件权限
    - _Requirements: 7.1_
  - [ ]* 1.3 编写 Dockerfile 构建测试脚本
    - 验证镜像可正常构建
    - 验证镜像不包含开发依赖
    - _Requirements: 1.5_

- [x] 2. 实现环境变量配置系统
  - [x] 2.1 创建服务器配置模块
    - 实现环境变量读取逻辑
    - 定义默认值
    - 添加配置验证
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 2.2 更新服务器启动逻辑使用配置模块
    - 集成配置模块到 index.ts
    - 启动时输出配置信息
    - _Requirements: 2.5_
  - [ ]* 2.3 编写属性测试：环境变量配置一致性
    - **Property 1: 环境变量配置一致性**
    - **Validates: Requirements 2.1, 2.2**

- [x] 3. 增强健康检查功能
  - [x] 3.1 扩展健康检查 API 响应
    - 添加版本信息
    - 添加运行时间
    - 添加数据库状态
    - _Requirements: 4.1, 4.5_
  - [x] 3.2 添加磁盘空间检查
    - 检查数据目录可用空间
    - 空间不足时返回警告状态
    - _Requirements: 4.4_
  - [ ]* 3.3 编写健康检查单元测试
    - 测试正常状态响应
    - 测试异常状态响应
    - _Requirements: 4.1, 4.2_

- [x] 4. Checkpoint - 基础功能验证
  - 确保 Dockerfile 可正常构建
  - 确保配置系统正常工作
  - 确保健康检查正常响应
  - 如有问题请询问用户

- [x] 5. 创建开发模式 Docker Compose 配置
  - [x] 5.1 创建 docker-compose.dev.yml
    - 配置源码挂载
    - 配置热重载
    - 暴露调试端口
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 5.2 更新 .dockerignore 优化开发体验
    - 排除不必要的文件
    - 保留开发所需文件
    - _Requirements: 1.5_

- [x] 6. 实现数据持久化和备份功能
  - [x] 6.1 创建数据备份脚本 (scripts/backup.sh)
    - 备份 SQLite 数据库
    - 备份上传文件
    - 生成带时间戳的备份文件
    - _Requirements: 3.4_
  - [x] 6.2 创建数据恢复脚本 (scripts/restore.sh)
    - 从备份恢复数据库
    - 从备份恢复文件
    - 验证恢复完整性
    - _Requirements: 3.4_
  - [ ]* 6.3 编写属性测试：数据持久化完整性
    - **Property 2: 数据持久化完整性 (Round-Trip)**
    - **Validates: Requirements 3.1, 3.2**

- [x] 7. 创建部署脚本和文档
  - [x] 7.1 创建一键部署脚本 (scripts/deploy.sh)
    - 构建镜像
    - 启动容器
    - 检查健康状态
    - _Requirements: 8.1, 8.2_
  - [x] 7.2 创建清理脚本 (scripts/cleanup.sh)
    - 停止容器
    - 删除镜像
    - 清理数据卷（可选）
    - _Requirements: 8.5_
  - [x] 7.3 更新 README.md 部署文档
    - 添加详细部署步骤
    - 添加环境变量说明
    - 添加故障排除指南
    - _Requirements: 8.3, 8.4_

- [x] 8. 实现镜像发布功能
  - [x] 8.1 创建镜像构建和标签脚本 (scripts/build-image.sh)
    - 读取版本号
    - 构建镜像
    - 打版本标签和 latest 标签
    - _Requirements: 6.1, 6.4_
  - [x] 8.2 创建镜像推送脚本 (scripts/push-image.sh)
    - 支持 Docker Hub
    - 支持私有仓库配置
    - _Requirements: 6.2, 6.3_
  - [ ]* 8.3 编写属性测试：版本标签一致性
    - **Property 3: 版本标签一致性**
    - **Validates: Requirements 6.5**

- [x] 9. 安全加固配置
  - [x] 9.1 更新 docker-compose.yml 添加安全配置
    - 添加 security_opt
    - 添加 cap_drop
    - 配置只读文件系统选项
    - _Requirements: 7.3, 7.4_
  - [x] 9.2 添加 .env.example 环境变量模板
    - 列出所有支持的环境变量
    - 提供安全的默认值
    - _Requirements: 7.2_

- [x] 10. Final Checkpoint - 完整功能验证
  - 运行所有测试确保通过
  - 验证完整部署流程
  - 验证备份恢复流程
  - 如有问题请询问用户

## Notes

- 任务标记 `*` 为可选测试任务，可跳过以加快 MVP 开发
- 每个任务都引用了具体的需求以确保可追溯性
- Checkpoint 任务用于阶段性验证，确保增量开发的正确性
- 属性测试验证核心正确性属性
- 单元测试验证具体示例和边界情况
