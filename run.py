"""CYP备忘录运行脚本"""
import os
import sys
from app.main import app, init_application
import uvicorn

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


if __name__ == "__main__":
    """主入口函数"""
    print("=== CYP备忘录启动中 ===")
    
    # 初始化应用
    init_application()
    
    # 启动服务
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True if os.getenv("APP_ENV", "development") == "development" else False,
        workers=1 if os.getenv("APP_ENV", "development") == "development" else 4
    )
