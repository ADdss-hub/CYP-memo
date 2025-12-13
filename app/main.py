"""CYP备忘录主应用入口"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
import uvicorn
import threading
import time
from app.core.config import settings
from app.core.database import init_db
from app.core.webdav import create_webdav_app
from app.utils.version import get_project_info

# 初始化数据库
def init_application():
    """初始化应用"""
    init_db()
    print("数据库初始化完成")

# 创建FastAPI应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="容器化的CYP备忘录，支持WebDAV、二维码、文件解析等功能",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件 - 将根路径映射到静态目录，支持前端构建的assets路径
app.mount("/", StaticFiles(directory="app/static", html=True), name="static")
# 保持原有的静态文件挂载，确保兼容性
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# 不再需要模板配置，使用前端构建的静态文件

# 导入路由
from app.api import auth, notes, files, webdav, admin, system

# 注册路由
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(notes.router, prefix="/api/notes", tags=["笔记"])
app.include_router(files.router, prefix="/api/files", tags=["文件"])
app.include_router(webdav.router, prefix="/api/webdav", tags=["WebDAV"])
app.include_router(admin.router, prefix="/api/admin", tags=["管理"])
app.include_router(system.router, prefix="/api/system", tags=["系统"])

# 根路由 - 提供前端构建的index.html
@app.get("/", response_class=HTMLResponse)
def read_root():
    """首页"""
    return FileResponse("app/static/index.html")

# 提供静态文件
@app.get("/static/{path:path}")
def read_static(path: str):
    """提供静态文件"""
    return FileResponse(f"app/static/{path}")

# 版本信息路由
@app.get("/api/version")
def get_version():
    """获取版本信息"""
    return get_project_info()

# 健康检查路由
@app.get("/api/health")
def health_check():
    """健康检查"""
    return {
        "status": "ok",
        "app_name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "timestamp": int(time.time())
    }

# 启动WebDAV服务
def start_webdav_service():
    """启动WebDAV服务"""
    if settings.WEBDAV_ENABLED:
        from wsgidav.server import WsgiDavServer
        webdav_app = create_webdav_app()
        server = WsgiDavServer(webdav_app, {
            "host": "0.0.0.0",
            "port": settings.WEBDAV_PORT,
        })
        print(f"WebDAV服务启动在 http://localhost:{settings.WEBDAV_PORT}")
        server.start()

# 主函数
if __name__ == "__main__":
    # 初始化应用
    init_application()
    
    # 启动WebDAV服务线程
    if settings.WEBDAV_ENABLED:
        webdav_thread = threading.Thread(target=start_webdav_service, daemon=True)
        webdav_thread.start()
    
    # 启动FastAPI应用
    print(f"{settings.APP_NAME} v{settings.APP_VERSION} 启动中...")
    print(f"访问地址: http://localhost:8000")
    if settings.DEBUG:
        print(f"API文档: http://localhost:8000/docs")
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        workers=1 if settings.DEBUG else 4
    )
