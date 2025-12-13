from pydantic_settings import BaseSettings
from typing import Optional, Dict, List
import os
import platform
import logging
from pathlib import Path

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """应用配置类"""
    # 应用基本信息
    APP_NAME: str = "CYP备忘录"
    APP_VERSION: str = "v0.1.2"
    APP_ENV: str = "production"
    DEBUG: bool = False
    
    # 数据库配置
    DATABASE_URL: str = "sqlite:///./cyp_memo.db"
    
    # Redis配置
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # 认证配置
    SECRET_KEY: str = "your-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # WebDAV配置
    WEBDAV_ENABLED: bool = True
    WEBDAV_PORT: int = 5000
    WEBDAV_URL: str = "/webdav"
    
    # 文件存储配置
    # 基础目录 - 自动检测合适的存储位置
    BASE_DIR: Optional[str] = None
    # 上传目录
    UPLOAD_DIR: str = "uploads"
    # 数据存储目录
    DATA_DIR: str = "data"
    # 最大文件大小
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB
    
    # 二维码配置
    QR_CODE_SIZE: int = 256
    QR_CODE_VERSION: int = 1
    
    # 通知配置
    NOTIFICATION_ENABLED: bool = True
    
    # 搜索配置
    SEARCH_ENABLED: bool = True
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        env_file_encoding = 'utf-8'
    
    def __init__(self, **kwargs):
        """初始化配置，自动检测和适配存储位置"""
        super().__init__(**kwargs)
        self._detect_base_dir()
        self._normalize_paths()
        self._ensure_directories_exists()
    
    def _detect_base_dir(self):
        """自动检测合适的基础目录
        
        根据不同操作系统和环境，自动选择合适的存储位置
        """
        # 系统类型
        system = platform.system()
        logger.info(f"检测到系统类型: {system}")
        
        # 环境变量中的基础目录优先
        if os.environ.get("BASE_DIR"):
            self.BASE_DIR = os.environ.get("BASE_DIR")
            logger.info(f"从环境变量获取BASE_DIR: {self.BASE_DIR}")
            return
        
        # 当前工作目录
        cwd = os.getcwd()
        logger.info(f"当前工作目录: {cwd}")
        
        # 检查是否在Docker容器中
        if os.path.exists("/.dockerenv"):
            # Docker环境，使用/app作为基础目录
            self.BASE_DIR = "/app"
            logger.info("检测到Docker环境，使用/app作为BASE_DIR")
            return
        
        # 检查是否在NAS环境中
        nas_paths = [
            "/volume1", "/volume2",  # Synology NAS
            "/share",  # QNAP NAS
            "/mnt",  # 通用Linux/macOS挂载点
            "D:", "E:", "F:"  # Windows磁盘
        ]
        
        for path in nas_paths:
            if os.path.exists(path):
                # 检查是否有docker目录
                docker_path = os.path.join(path, "docker", "cyp-memo")
                if os.path.exists(docker_path):
                    self.BASE_DIR = docker_path
                    logger.info(f"检测到NAS环境，使用{docker_path}作为BASE_DIR")
                    return
        
        # 检查应用目录结构
        app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        logger.info(f"应用目录: {app_dir}")
        
        # 检查是否存在.env文件或requirements.txt
        if os.path.exists(os.path.join(app_dir, ".env")) or os.path.exists(os.path.join(app_dir, "requirements.txt")):
            self.BASE_DIR = app_dir
            logger.info(f"检测到应用根目录，使用{app_dir}作为BASE_DIR")
            return
        
        # 最终回退到当前工作目录
        self.BASE_DIR = cwd
        logger.info(f"回退到当前工作目录，使用{cwd}作为BASE_DIR")
    
    def _normalize_paths(self):
        """规范化路径，确保跨平台兼容性
        
        将相对路径转换为绝对路径，处理不同操作系统的路径分隔符
        """
        # 确保BASE_DIR存在
        if not self.BASE_DIR:
            self._detect_base_dir()
        
        # 规范化上传目录
        if not os.path.isabs(self.UPLOAD_DIR):
            self.UPLOAD_DIR = os.path.normpath(os.path.join(self.BASE_DIR, self.UPLOAD_DIR))
        
        # 规范化数据目录
        if not os.path.isabs(self.DATA_DIR):
            self.DATA_DIR = os.path.normpath(os.path.join(self.BASE_DIR, self.DATA_DIR))
        
        # 确保路径使用正确的分隔符
        self.UPLOAD_DIR = Path(self.UPLOAD_DIR).as_posix()
        self.DATA_DIR = Path(self.DATA_DIR).as_posix()
        
        logger.info(f"规范化后的UPLOAD_DIR: {self.UPLOAD_DIR}")
        logger.info(f"规范化后的DATA_DIR: {self.DATA_DIR}")
    
    def _ensure_directories_exists(self):
        """确保所有必要的目录存在，不存在则创建"""
        # 需要确保存在的目录列表
        directories = [
            self.UPLOAD_DIR,
            self.DATA_DIR,
            os.path.join(self.UPLOAD_DIR, "attachments"),
            os.path.join(self.UPLOAD_DIR, "qr_codes"),
            os.path.join(self.DATA_DIR, "backups"),
            os.path.join(self.DATA_DIR, "logs"),
            os.path.join(self.DATA_DIR, "webdav")
        ]
        
        for directory in directories:
            try:
                os.makedirs(directory, exist_ok=True)
                logger.info(f"目录存在或已创建: {directory}")
            except Exception as e:
                logger.error(f"创建目录失败 {directory}: {e}")
                # 尝试使用当前用户可写的目录
                fallback_dir = os.path.join(os.getcwd(), os.path.basename(directory))
                os.makedirs(fallback_dir, exist_ok=True)
                logger.warning(f"回退到目录: {fallback_dir}")
                # 更新配置中的目录路径
                if directory == self.UPLOAD_DIR:
                    self.UPLOAD_DIR = fallback_dir
                elif directory == self.DATA_DIR:
                    self.DATA_DIR = fallback_dir
    
    def get_absolute_path(self, relative_path: str) -> str:
        """获取相对路径的绝对路径
        
        Args:
            relative_path: 相对路径
        
        Returns:
            绝对路径
        """
        if os.path.isabs(relative_path):
            return relative_path
        return os.path.normpath(os.path.join(self.BASE_DIR, relative_path))
    
    def is_valid_path(self, path: str) -> bool:
        """检查路径是否有效且在允许范围内
        
        Args:
            path: 要检查的路径
        
        Returns:
            是否有效
        """
        try:
            # 转换为绝对路径
            abs_path = os.path.abspath(path)
            # 检查是否在基础目录内
            return abs_path.startswith(self.BASE_DIR)
        except Exception as e:
            logger.error(f"路径检查失败 {path}: {e}")
            return False
    
    def get_storage_info(self) -> Dict:
        """获取存储信息
        
        Returns:
            存储信息字典
        """
        import shutil
        
        try:
            # 获取磁盘使用情况
            usage = shutil.disk_usage(self.BASE_DIR)
            return {
                "base_dir": self.BASE_DIR,
                "system": platform.system(),
                "total_space": usage.total,
                "used_space": usage.used,
                "free_space": usage.free,
                "upload_dir": self.UPLOAD_DIR,
                "data_dir": self.DATA_DIR
            }
        except Exception as e:
            logger.error(f"获取存储信息失败: {e}")
            return {
                "base_dir": self.BASE_DIR,
                "system": platform.system(),
                "error": str(e)
            }


# 创建全局配置实例
settings = Settings()

