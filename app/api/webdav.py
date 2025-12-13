"""WebDAV相关API接口"""
from fastapi import APIRouter, Depends
from app.core.webdav import get_webdav_url, get_webdav_root
from app.core.config import settings

router = APIRouter()


@router.get("/info")
def get_webdav_info():
    """获取WebDAV服务信息"""
    return {
        "enabled": settings.WEBDAV_ENABLED,
        "port": settings.WEBDAV_PORT,
        "url": get_webdav_url(),
        "root_path": get_webdav_root(),
        "status": "running" if settings.WEBDAV_ENABLED else "disabled"
    }


@router.get("/status")
def get_webdav_status():
    """获取WebDAV服务状态"""
    return {
        "status": "running" if settings.WEBDAV_ENABLED else "disabled"
    }
