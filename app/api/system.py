"""系统相关API接口"""
from fastapi import APIRouter, Depends, HTTPException
from app.core.config import settings
from app.utils.version import get_version_history, get_current_version
from typing import Dict, Any

router = APIRouter()


@router.get("/info")
def get_system_info():
    """获取系统信息"""
    return {
        "app_name": settings.APP_NAME,
        "app_version": settings.APP_VERSION,
        "app_env": settings.APP_ENV,
        "debug": settings.DEBUG,
        "system": {
            "base_dir": settings.BASE_DIR,
            "upload_dir": settings.UPLOAD_DIR,
            "data_dir": settings.DATA_DIR
        }
    }


@router.get("/storage")
def get_storage_info():
    """获取存储信息"""
    storage_info = settings.get_storage_info()
    return storage_info


@router.get("/directories")
def get_directory_info():
    """获取目录信息"""
    import os
    import shutil
    
    def get_dir_info(path: str) -> Dict[str, Any]:
        """获取目录详细信息"""
        try:
            # 检查路径是否存在
            if not os.path.exists(path):
                return {
                    "exists": False,
                    "path": path
                }
            
            # 获取文件列表
            files = []
            if os.path.isdir(path):
                for item in os.listdir(path):
                    item_path = os.path.join(path, item)
                    if os.path.isfile(item_path):
                        files.append({
                            "name": item,
                            "type": "file",
                            "size": os.path.getsize(item_path),
                            "path": item_path
                        })
            
            # 获取目录大小
            def get_dir_size(start_path: str) -> int:
                """获取目录大小"""
                total_size = 0
                for dirpath, dirnames, filenames in os.walk(start_path):
                    for f in filenames:
                        fp = os.path.join(dirpath, f)
                        total_size += os.path.getsize(fp)
                return total_size
            
            return {
                "exists": True,
                "path": path,
                "is_directory": os.path.isdir(path),
                "size": get_dir_size(path) if os.path.isdir(path) else os.path.getsize(path),
                "file_count": len(files),
                "files": files
            }
        except Exception as e:
            return {
                "exists": False,
                "path": path,
                "error": str(e)
            }
    
    return {
        "base_dir": get_dir_info(settings.BASE_DIR),
        "upload_dir": get_dir_info(settings.UPLOAD_DIR),
        "data_dir": get_dir_info(settings.DATA_DIR),
        "webdav_dir": get_dir_info(os.path.join(settings.DATA_DIR, "webdav")),
        "attachments_dir": get_dir_info(os.path.join(settings.UPLOAD_DIR, "attachments")),
        "qr_codes_dir": get_dir_info(os.path.join(settings.UPLOAD_DIR, "qr_codes")),
        "backups_dir": get_dir_info(os.path.join(settings.DATA_DIR, "backups")),
        "logs_dir": get_dir_info(os.path.join(settings.DATA_DIR, "logs"))
    }


@router.get("/version")
def get_version_info():
    """获取版本信息"""
    return {
        "current_version": get_current_version(),
        "version_history": get_version_history()
    }


@router.get("/check")
def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "timestamp": "2025-12-13T12:00:00"
    }
