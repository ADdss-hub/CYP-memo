# 需求文档 - CYP-memo 容器备忘录系统

## 简介

CYP-memo 是一款现代化的容器备忘录系统，提供中文界面、完善的窗口提示和日志记录功能。系统采用先开发网页应用，后容器化部署的策略，使用免费开源的接口和库。

系统包含两个独立的网页应用：
- **用户端应用**：供普通用户使用，提供备忘录管理、标签、分享等功能
- **系统管理员端应用**：供系统管理员使用，用于管理用户、数据库等系统操作

## 术语表

- **备忘录系统 (Memo_System)**: 用于创建、管理和查看备忘录的应用程序
- **容器 (Container)**: Docker 容器化部署环境
- **日志记录器 (Logger)**: 记录系统运行日志的组件
- **版本管理器 (Version_Manager)**: 管理和显示应用版本信息的组件
- **Web_Application**: 基于浏览器的网页应用程序
- **个人令牌 (Personal_Token)**: 用于用户身份验证的唯一标识符
- **认证系统 (Auth_System)**: 管理用户登录和注册的组件

## 需求

### 需求 1: 用户认证

**用户故事:** 作为用户，我想要通过账号密码或个人令牌登录，以便安全地访问我的备忘录数据。

#### 验收标准

1. THE Auth_System SHALL 支持账号密码登录和个人令牌登录两种方式
2. WHEN 用户选择账号密码注册时，THE Auth_System SHALL 要求输入用户名、密码和确认密码
3. WHEN 用户输入密码时，THE Auth_System SHALL 验证密码强度（至少 8 位，包含字母和数字）
4. WHEN 用户选择个人令牌注册时，THE Auth_System SHALL 自动生成唯一的个人令牌
5. WHEN 生成个人令牌时，THE Auth_System SHALL 使用加密安全的随机数生成器
6. THE Auth_System SHALL 将个人令牌显示给用户并提示保存
7. WHEN 用户使用账号密码登录时，THE Auth_System SHALL 验证用户名和密码的正确性
8. WHEN 用户使用个人令牌登录时，THE Auth_System SHALL 验证令牌格式和有效性
9. WHEN 登录成功时，THE Auth_System SHALL 将认证信息存储在浏览器本地存储
10. WHEN 用户再次访问应用时，THE Auth_System SHALL 使用本地存储的认证信息自动登录
11. WHEN 认证验证失败时，THE Auth_System SHALL 显示错误消息并拒绝访问
12. WHEN 用户选择注销时，THE Auth_System SHALL 清除本地存储的认证信息
13. THE Web_Application SHALL 提供复制个人令牌到剪贴板的功能
14. THE Web_Application SHALL 在用户设置页面显示当前个人令牌（仅限令牌注册用户）
15. THE Web_Application SHALL 在登录页面提供"账号密码登录"和"个人令牌登录"的切换选项

### 需求 2: 账号管理和找回

**用户故事:** 作为用户，我想要能够找回我的账号和密码/令牌，以便在遗忘时恢复访问权限。

#### 验收标准

1. WHEN 用户使用账号密码注册时，THE Auth_System SHALL 要求用户设置安全问题和答案
2. WHEN 用户请求密码找回时，THE Web_Application SHALL 显示密码找回表单
3. WHEN 用户提交密码找回请求时，THE Auth_System SHALL 验证安全问题答案
4. WHEN 安全问题答案正确时，THE Auth_System SHALL 允许用户重置密码
5. WHEN 用户使用个人令牌登录且丢失令牌时，THE Web_Application SHALL 显示管理员联系方式
6. WHEN 所有找回方式都失败时，THE Web_Application SHALL 显示管理员联系方式
7. THE Web_Application SHALL 在设置页面允许用户更新安全问题
8. THE Auth_System SHALL 记录所有账号找回尝试到日志

### 需求 3: 备忘录管理

**用户故事:** 作为用户，我想要创建、编辑、删除和查看备忘录，以便我可以记录和管理重要信息。

#### 验收标准

1. WHEN 用户创建新备忘录时，THE Memo_System SHALL 保存备忘录内容并分配唯一标识符
2. WHEN 用户编辑现有备忘录时，THE Memo_System SHALL 更新备忘录内容并保留修改历史
3. WHEN 用户删除备忘录时，THE Memo_System SHALL 移除备忘录并记录删除操作
4. WHEN 用户查看备忘录列表时，THE Memo_System SHALL 显示所有备忘录的摘要信息
5. WHEN 用户搜索备忘录时，THE Memo_System SHALL 返回匹配搜索条件的备忘录

### 需求 3.1: 备忘录编辑器

**用户故事:** 作为用户，我想要使用功能丰富的编辑器，以便创建格式化的备忘录内容。

#### 验收标准

1. THE Web_Application SHALL 提供富文本编辑器用于编辑备忘录
2. THE Web_Application SHALL 支持 Markdown 语法编辑
3. THE Web_Application SHALL 提供实时预览功能
4. THE Web_Application SHALL 在编辑器工具栏提供常用格式化按钮（加粗、斜体、下划线、删除线）
5. THE Web_Application SHALL 在编辑器工具栏提供标题级别选择（H1-H6）
6. THE Web_Application SHALL 在编辑器工具栏提供列表按钮（有序列表、无序列表）
7. THE Web_Application SHALL 在编辑器工具栏提供插入链接功能
8. THE Web_Application SHALL 在编辑器工具栏提供插入代码块功能
9. THE Web_Application SHALL 在编辑器工具栏提供插入引用块功能
10. THE Web_Application SHALL 在编辑器工具栏提供插入表格功能
11. THE Web_Application SHALL 支持代码高亮显示
12. THE Web_Application SHALL 支持表情符号插入
13. WHEN 用户输入时，THE Web_Application SHALL 自动保存草稿
14. THE Web_Application SHALL 显示字数统计
15. THE Web_Application SHALL 支持全屏编辑模式
16. THE Web_Application SHALL 支持快捷键操作（Ctrl+B 加粗、Ctrl+I 斜体等）
17. THE Web_Application SHALL 在编辑器工具栏提供插入文件按钮
18. WHEN 用户点击插入文件按钮时，THE Web_Application SHALL 打开文件选择对话框
19. WHEN 用户上传文件到备忘录时，THE Memo_System SHALL 支持图片、文本等文件类型
20. THE Memo_System SHALL 限制单个文件大小不超过 10GB
21. WHEN 用户上传图片文件时，THE Memo_System SHALL 在编辑区中显示图片预览
22. WHEN 用户上传文本文件时，THE Memo_System SHALL 读取文本内容并插入到编辑器
23. THE Web_Application SHALL 支持通过拖拽方式将文件插入到编辑器
24. WHEN 插入图片时，THE Web_Application SHALL 在编辑器中显示图片预览
25. THE Web_Application SHALL 支持调整插入图片的大小
26. WHEN 文件上传失败时，THE Memo_System SHALL 显示错误提示并说明原因
27. THE Memo_System SHALL 在备忘录中保存文件的引用和元数据

### 需求 4: 备忘录标签

**用户故事:** 作为用户，我想要为备忘录添加标签，以便我可以分类和快速查找相关备忘录。

#### 验收标准

1. WHEN 用户创建或编辑备忘录时，THE Memo_System SHALL 允许用户添加多个标签
2. WHEN 用户添加标签时，THE Memo_System SHALL 验证标签名称不为空且不超过 20 个字符
3. WHEN 用户点击标签时，THE Memo_System SHALL 显示所有包含该标签的备忘录
4. THE Memo_System SHALL 在界面显示所有已使用的标签列表
5. WHEN 用户删除备忘录的最后一个使用某标签的实例时，THE Memo_System SHALL 从标签列表中移除该标签
6. THE Memo_System SHALL 支持标签的自动补全功能
7. WHEN 用户搜索备忘录时，THE Memo_System SHALL 支持按标签筛选

### 需求 5: 中文界面

**用户故事:** 作为中文用户，我想要使用中文界面，以便我可以更方便地使用系统。

#### 验收标准

1. THE Web_Application SHALL 使用中文作为默认界面语言
2. WHEN 显示任何用户界面元素时，THE Web_Application SHALL 使用中文文本标签
3. WHEN 显示错误消息时，THE Web_Application SHALL 使用中文描述错误信息
4. WHEN 显示日期和时间时，THE Web_Application SHALL 使用中文格式

### 需求 6: 现代界面设计

**用户故事:** 作为用户，我想要使用现代化的界面，以便获得良好的用户体验。

#### 验收标准

1. THE Web_Application SHALL 使用响应式设计适配不同屏幕尺寸
2. THE Web_Application SHALL 提供清晰的视觉层次和布局
3. WHEN 用户与界面交互时，THE Web_Application SHALL 提供即时的视觉反馈
4. THE Web_Application SHALL 使用现代化的配色方案和字体
5. THE Web_Application SHALL 支持深色和浅色主题切换
6. THE Web_Application SHALL 使用卡片式设计展示备忘录列表
7. THE Web_Application SHALL 在顶部提供导航栏包含搜索框和操作按钮
8. THE Web_Application SHALL 在侧边栏显示标签列表和筛选选项
9. WHEN 用户悬停在交互元素上时，THE Web_Application SHALL 显示悬停效果
10. THE Web_Application SHALL 使用图标增强界面可读性
11. THE Web_Application SHALL 使用动画过渡效果提升用户体验
12. THE Web_Application SHALL 在移动设备上提供底部导航栏
13. THE Web_Application SHALL 在界面底部固定显示版本号、作者信息和版权信息
14. THE Web_Application SHALL 确保底部信息栏在所有页面保持可见
15. THE Web_Application SHALL 为所有操作按钮提供清晰的图标和文字标签
16. THE Web_Application SHALL 使用统一的按钮样式（主要按钮、次要按钮、危险按钮）
17. THE Web_Application SHALL 为按钮提供悬停、点击和禁用状态的视觉反馈
18. THE Web_Application SHALL 确保按钮大小适合触摸操作（最小 44x44 像素）

### 需求 7: 界面功能引导

**用户故事:** 作为新用户，我想要看到界面功能介绍，以便快速了解如何使用系统。

#### 验收标准

1. WHEN 用户首次访问应用时，THE Web_Application SHALL 显示欢迎引导页面
2. THE Web_Application SHALL 提供分步功能介绍教程
3. WHEN 用户完成引导时，THE Web_Application SHALL 记录引导完成状态
4. THE Web_Application SHALL 在设置中提供重新查看功能介绍的选项
5. THE Web_Application SHALL 在关键功能区域提供工具提示说明
6. WHEN 用户悬停在功能按钮上时，THE Web_Application SHALL 显示功能说明提示
7. THE Web_Application SHALL 提供帮助文档链接

### 需求 8: 窗口提示系统

**用户故事:** 作为用户，我想要收到清晰的窗口提示，以便了解操作结果和系统状态。

#### 验收标准

1. WHEN 用户执行操作成功时，THE Web_Application SHALL 显示成功提示消息
2. WHEN 用户执行操作失败时，THE Web_Application SHALL 显示错误提示消息并说明原因
3. WHEN 用户执行危险操作时，THE Web_Application SHALL 显示确认对话框
4. WHEN 显示提示消息时，THE Web_Application SHALL 在 3 秒后自动关闭非关键提示
5. THE Web_Application SHALL 允许用户手动关闭任何提示消息

### 需求 9: 日志记录

**用户故事:** 作为系统管理员，我想要完善的日志记录，以便追踪系统运行状态和排查问题。

#### 验收标准

1. WHEN 系统启动时，THE Logger SHALL 记录启动时间和配置信息
2. WHEN 用户执行任何操作时，THE Logger SHALL 记录操作类型、时间戳和用户标识
3. WHEN 系统发生错误时，THE Logger SHALL 记录错误详情、堆栈跟踪和上下文信息
4. THE Logger SHALL 将日志按日期分类存储
5. THE Logger SHALL 支持不同日志级别（调试、信息、警告、错误）
6. WHEN 日志文件超过指定大小时，THE Logger SHALL 自动轮转日志文件
7. WHEN 系统发生未捕获的错误时，THE Logger SHALL 记录全局错误信息
8. THE Logger SHALL 提供全局错误处理机制捕获所有未处理的异常
9. WHEN 全局错误被捕获时，THE Web_Application SHALL 显示友好的错误提示
10. THE Logger SHALL 记录错误发生时的用户操作上下文

### 需求 9.1: 数据同步和异步操作

**用户故事:** 作为用户，我想要系统能够高效地处理数据同步和异步操作，以便获得流畅的使用体验。

#### 验收标准

1. THE Memo_System SHALL 使用异步操作处理所有文件读写
2. THE Memo_System SHALL 使用异步操作处理所有数据持久化操作
3. THE Memo_System SHALL 支持同步和异步两种并发处理方式
4. THE Memo_System SHALL 根据操作类型自动选择合适的并发处理方式
5. WHEN 执行异步操作时，THE Web_Application SHALL 显示加载指示器
6. THE Memo_System SHALL 使用乐观锁机制处理并发数据修改
7. WHEN 数据同步冲突时，THE Memo_System SHALL 自动解决冲突或提示用户
8. THE Memo_System SHALL 提供数据同步状态指示器
9. THE Memo_System SHALL 使用消息队列处理异步任务
10. THE Memo_System SHALL 提供统一的异步操作错误处理机制
11. WHEN 数据发生变更时，THE Memo_System SHALL 通知所有相关的界面组件更新
12. THE Memo_System SHALL 自动无缝地完成所有并发操作，用户无需干预
13. THE Memo_System SHALL 使用 Promise 或 async/await 模式处理异步流程
14. THE Memo_System SHALL 支持并发执行多个独立的异步操作
15. THE Memo_System SHALL 确保关键操作的原子性和一致性
16. THE Memo_System SHALL 使用 Web Workers 处理计算密集型任务
17. THE Memo_System SHALL 使用懒加载技术延迟加载非关键资源
18. THE Memo_System SHALL 使用虚拟滚动技术优化大列表渲染性能
19. THE Memo_System SHALL 使用防抖和节流技术优化高频操作
20. THE Memo_System SHALL 使用缓存机制减少重复计算和数据加载
21. THE Memo_System SHALL 使用预加载技术提前加载可能需要的资源
22. THE Memo_System SHALL 使用代码分割技术减小初始加载体积
23. THE Memo_System SHALL 使用图片懒加载和压缩技术优化图片加载
24. THE Memo_System SHALL 使用 IndexedDB 存储大量数据以提升性能
25. THE Memo_System SHALL 使用批量操作减少数据库访问次数
26. THE Memo_System SHALL 使用增量更新技术只更新变化的数据
27. WHEN 执行耗时操作时，THE Web_Application SHALL 提供进度指示
28. THE Memo_System SHALL 确保所有用户交互响应时间不超过 100 毫秒
29. THE Memo_System SHALL 确保页面初始加载时间不超过 2 秒
30. THE Memo_System SHALL 使用性能监控工具持续优化系统性能

### 需求 10: 数据持久化

**用户故事:** 作为用户，我想要我的备忘录数据被安全保存，以便在重启后仍然可以访问。

#### 验收标准

1. WHEN 用户创建或修改备忘录时，THE Memo_System SHALL 立即将数据持久化到存储
2. WHEN 系统重启时，THE Memo_System SHALL 从存储中恢复所有备忘录数据
3. THE Memo_System SHALL 使用 JSON 格式存储备忘录数据
4. WHEN 数据保存失败时，THE Memo_System SHALL 通知用户并保留内存中的数据

### 需求 10.1: 数据库自动清理

**用户故事:** 作为用户，我想要系统自动清理无用数据，以便保持系统性能和节省存储空间。

#### 验收标准

1. THE Memo_System SHALL 定期自动清理已删除的备忘录数据
2. THE Memo_System SHALL 定期自动清理未使用的附件文件
3. THE Memo_System SHALL 定期自动清理过期的分享链接数据
4. THE Memo_System SHALL 定期自动清理过期的日志文件
5. THE Memo_System SHALL 定期自动清理浏览器缓存中的过期数据
6. WHEN 存储空间使用超过阈值时，THE Memo_System SHALL 自动清理最旧的数据
7. THE Memo_System SHALL 在系统空闲时执行自动清理任务
8. THE Memo_System SHALL 在清理前备份重要数据
9. THE Memo_System SHALL 记录所有自动清理操作到日志
10. THE Memo_System SHALL 允许用户配置自动清理策略（频率、保留时间）
11. THE Memo_System SHALL 提供手动触发清理的功能
12. WHEN 清理完成时，THE Web_Application SHALL 显示清理结果统计
13. THE Memo_System SHALL 使用数据库优化技术（如 VACUUM）压缩数据库
14. THE Memo_System SHALL 自动清理重复的数据记录
15. THE Memo_System SHALL 保留最近 30 天的已删除数据用于恢复

### 需求 11: 版本管理

**用户故事:** 作为开发者，我想要规范的版本管理，以便追踪系统更新和变更。

#### 验收标准

1. THE Version_Manager SHALL 使用语义化版本号格式（主版本.次版本.修订版本）
2. WHEN 应用启动时，THE Version_Manager SHALL 在界面显示当前版本号
3. THE Version_Manager SHALL 在日志中记录当前运行的版本号
4. THE Version_Manager SHALL 从单一配置文件读取版本信息
5. WHEN 版本号更新时，THE Version_Manager SHALL 自动同步到所有显示位置

### 需求 12: 代码组织

**用户故事:** 作为开发者，我想要清晰的代码组织结构，以便维护和扩展系统。

#### 验收标准

1. THE Memo_System SHALL 将代码按功能模块组织到独立目录
2. THE Memo_System SHALL 限制单个代码文件不超过 500 行
3. WHEN 文件超过行数限制时，THE Memo_System SHALL 将功能拆分到多个文件
4. THE Memo_System SHALL 使用统一的模块导入和导出规范
5. THE Memo_System SHALL 将配置信息集中管理在配置文件中
6. THE Memo_System SHALL 按以下目录结构组织代码：功能目录、代码模块目录、工具目录、配置目录
7. THE Memo_System SHALL 确保每个功能目录包含单一功能的所有相关代码
8. THE Memo_System SHALL 将所有 API 接口集中定义在统一的 API 目录
9. THE Memo_System SHALL 将所有管理器类（如认证管理器、日志管理器）集中在管理器目录
10. THE Memo_System SHALL 遵循单一职责原则，每个代码文件只负责一个功能
11. THE Memo_System SHALL 使用自动化工具进行代码格式化
12. THE Memo_System SHALL 使用自动化工具进行代码质量检查
13. THE Memo_System SHALL 使用自动化工具进行依赖管理
14. THE Memo_System SHALL 提供自动化构建脚本
15. THE Memo_System SHALL 提供自动化测试脚本

### 需求 13: 界面架构

**用户故事:** 作为开发者，我想要每个界面都是独立的模块，以便维护和扩展系统。

#### 验收标准

1. THE Web_Application SHALL 将每个界面实现为独立的模块
2. THE Web_Application SHALL 确保界面模块之间低耦合
3. WHEN 用户切换界面时，THE Web_Application SHALL 只加载所需的界面模块
4. THE Web_Application SHALL 为每个界面提供独立的路由
5. THE Web_Application SHALL 确保界面模块可以独立开发和测试
6. THE Web_Application SHALL 通过统一的接口进行界面间的数据通信

### 需求 14: 容器化部署（后续阶段）

**用户故事:** 作为运维人员，我想要将应用容器化部署，以便简化部署和管理。

**注意：此需求在网页应用完成后实施**

#### 验收标准

1. THE Memo_System SHALL 提供 Dockerfile 用于构建容器镜像
2. THE Container SHALL 包含所有运行时依赖
3. WHEN 容器启动时，THE Container SHALL 自动启动 Web 应用
4. THE Container SHALL 暴露配置的端口供外部访问
5. THE Container SHALL 支持通过环境变量配置应用参数
6. THE Container SHALL 将日志输出到标准输出和持久化存储

### 需求 15: 法律声明

**用户故事:** 作为项目作者，我想要包含完整的法律声明，以便保护知识产权和明确使用条款。

#### 验收标准

1. THE Memo_System SHALL 在代码库根目录包含 LICENSE 文件
2. THE Memo_System SHALL 在界面底部显示版权信息
3. THE Memo_System SHALL 在 README 文件中包含免责声明
4. THE Memo_System SHALL 在 README 文件中包含使用条款
5. WHEN 用户首次访问应用时，THE Web_Application SHALL 显示使用协议
6. THE Memo_System SHALL 在每个源代码文件头部包含版权声明

### 需求 16: 作者信息

**用户故事:** 作为项目作者，我想要在项目中展示作者信息，以便用户可以联系我。

#### 验收标准

1. THE Memo_System SHALL 在 README 文件中显示作者姓名 "CYP"
2. THE Memo_System SHALL 在 README 文件中显示联系邮箱 "nasDSSCYP@outlook.com"
3. THE Web_Application SHALL 在关于页面显示作者信息
4. THE Memo_System SHALL 在 package.json 或等效配置文件中包含作者信息

### 需求 17: 开源依赖

**用户故事:** 作为开发者，我想要只使用免费开源的库和接口，以便降低成本和法律风险。

#### 验收标准

1. THE Memo_System SHALL 只使用具有开源许可证的第三方库
2. THE Memo_System SHALL 在文档中列出所有使用的开源依赖
3. THE Memo_System SHALL 验证所有依赖的许可证兼容性
4. THE Memo_System SHALL 不依赖任何付费 API 或服务

### 需求 18: 数据统计界面

**用户故事:** 作为用户，我想要查看数据统计信息，以便了解我的备忘录使用情况。

#### 验收标准

1. THE Web_Application SHALL 提供数据统计界面
2. THE Web_Application SHALL 在统计界面显示备忘录总数
3. THE Web_Application SHALL 在统计界面显示标签总数
4. THE Web_Application SHALL 在统计界面显示附件总数和总大小
5. THE Web_Application SHALL 在统计界面显示最近 7 天的备忘录创建趋势图
6. THE Web_Application SHALL 在统计界面显示最常使用的标签排行
7. THE Web_Application SHALL 在统计界面显示存储空间使用情况
8. WHEN 用户点击统计数据时，THE Web_Application SHALL 跳转到相关的详细页面

### 需求 19: 账号管理界面

**用户故事:** 作为通过注册界面注册的用户，我想要管理子账号，以便控制访问权限。

#### 验收标准

1. WHERE 用户通过注册界面注册，THE Web_Application SHALL 提供账号管理界面
2. WHERE 用户在账号管理界面中被创建，THE Web_Application SHALL 隐藏账号管理界面入口
3. WHERE 用户通过注册界面注册，THE Web_Application SHALL 允许创建子账号
4. WHERE 用户通过注册界面注册，THE Web_Application SHALL 允许删除子账号
5. WHERE 用户通过注册界面注册，THE Web_Application SHALL 显示所有子账号列表
6. WHEN 创建子账号时，THE Auth_System SHALL 要求输入用户名和密码
7. WHEN 创建子账号时，THE Auth_System SHALL 标记该账号为子账号（无个人令牌）
8. WHEN 删除子账号时，THE Web_Application SHALL 显示确认对话框
9. THE Web_Application SHALL 在账号管理界面显示每个账号的创建时间和最后登录时间
10. WHERE 用户通过注册界面注册，THE Web_Application SHALL 允许设置子账号的权限级别
11. WHEN 子账号用户尝试访问账号管理界面时，THE Web_Application SHALL 显示权限不足提示
12. WHERE 子账号用户登录，THE Web_Application SHALL 默认只允许访问备忘录功能
13. WHERE 子账号用户登录，THE Web_Application SHALL 隐藏数据统计、系统设置、附件管理界面入口
14. WHERE 主账号用户在账号管理界面中，THE Web_Application SHALL 允许修改子账号的权限设置
15. WHEN 主账号授予子账号额外权限时，THE Web_Application SHALL 显示对应的界面入口
16. THE Web_Application SHALL 支持为子账号设置以下权限：备忘录管理、数据统计查看、附件管理、系统设置

### 需求 20: 系统设置界面

**用户故事:** 作为用户，我想要配置系统设置，以便个性化我的使用体验。

#### 验收标准

1. THE Web_Application SHALL 提供系统设置界面
2. THE Web_Application SHALL 在设置界面提供主题切换选项（深色/浅色）
3. THE Web_Application SHALL 在设置界面提供语言选择选项
4. THE Web_Application SHALL 在设置界面提供字体大小调整选项
5. THE Web_Application SHALL 在设置界面显示当前版本号
6. THE Web_Application SHALL 在设置界面提供清除缓存功能
7. THE Web_Application SHALL 在设置界面提供数据导出功能
8. THE Web_Application SHALL 在设置界面提供数据导入功能
9. WHEN 用户修改设置时，THE Web_Application SHALL 立即应用更改
10. THE Web_Application SHALL 将用户设置保存到本地存储

### 需求 21: 附件管理界面

**用户故事:** 作为用户，我想要管理所有附件，以便查看和清理存储空间。

#### 验收标准

1. THE Web_Application SHALL 提供附件管理界面
2. THE Web_Application SHALL 在附件管理界面显示所有上传的附件列表
3. THE Web_Application SHALL 在附件列表中显示文件名、大小、类型和上传时间
4. WHEN 用户点击附件时，THE Web_Application SHALL 预览或下载附件
5. THE Web_Application SHALL 支持批量选择和删除附件
6. WHEN 删除附件时，THE Web_Application SHALL 显示确认对话框
7. THE Web_Application SHALL 在附件管理界面显示总存储空间使用情况
8. THE Web_Application SHALL 支持按文件类型筛选附件
9. THE Web_Application SHALL 支持按上传时间排序附件
10. WHEN 附件被删除时，THE Memo_System SHALL 更新相关备忘录的附件引用

### 需求 22: 分享界面

**用户故事:** 作为用户，我想要分享我的备忘录，以便与他人协作或展示内容。

#### 验收标准

1. THE Web_Application SHALL 提供备忘录分享功能
2. WHEN 用户选择分享备忘录时，THE Web_Application SHALL 显示分享选项对话框
3. THE Web_Application SHALL 支持生成备忘录的分享链接
4. WHEN 生成分享链接时，THE Memo_System SHALL 创建唯一的分享标识符
5. THE Web_Application SHALL 允许用户设置分享链接的有效期（1天、7天、30天、永久）
6. THE Web_Application SHALL 允许用户设置分享链接的访问密码（可选）
7. WHEN 用户复制分享链接时，THE Web_Application SHALL 将链接复制到剪贴板
8. WHEN 访客访问分享链接时，THE Web_Application SHALL 显示备忘录的只读视图
9. WHEN 分享链接设置了密码时，THE Web_Application SHALL 要求访客输入密码
10. WHEN 分享链接过期时，THE Web_Application SHALL 显示链接已失效提示
11. THE Web_Application SHALL 在分享管理界面显示所有已创建的分享链接
12. THE Web_Application SHALL 允许用户撤销分享链接
13. WHEN 分享链接被访问时，THE Logger SHALL 记录访问时间和访问者信息
14. THE Web_Application SHALL 在分享管理界面显示每个链接的访问次数


