"""WebDAV核心功能实现"""
import os
from wsgidav.wsgidav_app import WsgiDAVApp
from wsgidav.fs_dav_provider import FilesystemProvider
from app.core.config import settings


def create_webdav_app() -> WsgiDAVApp:
    """创建WebDAV应用"""
    # 确保WebDAV根目录存在
    webdav_root = os.path.join(settings.DATA_DIR, "webdav")
    os.makedirs(webdav_root, exist_ok=True)
    
    # 配置WebDAV应用
    config = {
        "host": "0.0.0.0",
        "port": settings.WEBDAV_PORT,
        "provider_mapping": {
            "/": FilesystemProvider(webdav_root)
        },
        "http_authenticator": {
            "domain_controller": None,
            "accept_basic": True,
            "accept_digest": False,
        },
        "simple_dc": {
            "user_mapping": {}
        },
        "verbose": 1 if settings.DEBUG else 0,
        "enable_loggers": [],
        "property_manager": True,
        "lock_storage": True,
    }
    
    app = WsgiDAVApp(config)
    return app


def get_webdav_url() -> str:
    """获取WebDAV服务URL"""
    return f"http://localhost:{settings.WEBDAV_PORT}{settings.WEBDAV_URL}"


def get_webdav_root() -> str:
    """获取WebDAV根目录路径"""
    return os.path.join(settings.DATA_DIR, "webdav")
