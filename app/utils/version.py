"""版本管理模块"""

# 项目基本信息
AUTHOR = "CYP"
CONTACT = "nasDSSCYP@outlook.com"

# 当前版本号
CURRENT_VERSION = "v0.1.2"

# 版本记录
VERSION_HISTORY = [
    {
        "version": "v0.1.2",
        "date": "2025-12-13",
        "changes": [
            "增强配置系统自适应能力",
            "自动检测存储位置和环境",
            "支持跨平台路径处理",
            "目录自动创建和规范化",
            "添加系统信息API",
            "添加存储信息监控",
            "添加目录结构API",
            "支持Docker和NAS环境自适应",
            "优化WebDAV目录管理",
            "添加健康检查端点"
        ]
    },
    {
        "version": "v0.1.1",
        "date": "2025-12-13",
        "changes": [
            "优化容器化部署配置",
            "支持NAS环境部署",
            "增强多Docker平台兼容",
            "添加自定义网络配置",
            "支持数据卷NAS挂载",
            "优化数据库和Redis配置",
            "添加健康检查机制",
            "更新中文界面设计"
        ]
    },
    {
        "version": "v0.1.0",
        "date": "2024-01-01",
        "changes": [
            "初始化项目结构",
            "完成用户认证功能",
            "实现笔记基本操作",
            "支持文件上传",
            "实现WebDAV服务"
        ]
    },
    {
        "version": "v0.2.0",
        "date": "2024-01-15",
        "changes": [
            "新增二维码生成和扫描功能",
            "支持第三方笔记导入导出",
            "实现文件解析功能",
            "新增目录和标签管理"
        ]
    },
    {
        "version": "v0.3.0",
        "date": "2024-02-01",
        "changes": [
            "完成管理功能",
            "实现通知系统",
            "优化搜索功能",
            "完善中文界面",
            "增强科技感设计"
        ]
    },
    {
        "version": "v1.0.0",
        "date": "2024-03-01",
        "changes": [
            "正式发布",
            "支持容器化部署",
            "网页端稳定运行",
            "准备桌面和手机APP开发"
        ]
    }
]


def get_current_version() -> str:
    """获取当前版本号"""
    return CURRENT_VERSION


def get_version_history() -> list:
    """获取版本历史记录"""
    return VERSION_HISTORY


def get_latest_version() -> dict:
    """获取最新版本信息"""
    return VERSION_HISTORY[0] if VERSION_HISTORY else {}


def get_project_info() -> dict:
    """获取项目基本信息"""
    return {
        "name": "CYP备忘录",
        "author": AUTHOR,
        "contact": CONTACT,
        "version": CURRENT_VERSION,
        "latest_version": get_latest_version()
    }
