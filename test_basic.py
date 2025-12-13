"""基础功能测试脚本"""
import sys
import os

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def test_config():
    """测试配置加载"""
    print("=== 测试配置加载 ===")
    try:
        from app.core.config import settings
        print(f"应用名称: {settings.APP_NAME}")
        print(f"应用版本: {settings.APP_VERSION}")
        print(f"环境: {settings.APP_ENV}")
        print("配置加载成功")
        return True
    except Exception as e:
        print(f"配置加载失败: {str(e)}")
        return False


def test_version():
    """测试版本管理"""
    print("\n=== 测试版本管理 ===")
    try:
        from app.utils.version import get_current_version, get_project_info
        version = get_current_version()
        project_info = get_project_info()
        print(f"当前版本: {version}")
        print(f"项目作者: {project_info['author']}")
        print(f"联系方式: {project_info['contact']}")
        print("版本管理测试成功")
        return True
    except Exception as e:
        print(f"版本管理测试失败: {str(e)}")
        return False


def test_models():
    """测试数据模型"""
    print("\n=== 测试数据模型 ===")
    try:
        # 只检查模型文件是否存在，不导入模块
        import os
        model_dir = os.path.join(os.path.dirname(__file__), "app", "models")
        if os.path.exists(model_dir):
            model_files = os.listdir(model_dir)
            model_files = [f for f in model_files if f.endswith(".py")]
            print(f"模型文件: {', '.join(model_files)}")
            print("数据模型文件结构正常")
            return True
        else:
            print("模型目录不存在")
            return False
    except Exception as e:
        print(f"数据模型测试失败: {str(e)}")
        return False


def test_schemas():
    """测试数据验证模型"""
    print("\n=== 测试数据验证模型 ===")
    try:
        from app.schemas import UserCreate, NoteCreate, Token
        # 测试模型实例化
        user_schema = UserCreate(
            username="test_user",
            email="test@example.com",
            full_name="测试用户",
            password="password123"
        )
        print(f"用户创建模型: {user_schema}")
        print("数据验证模型测试成功")
        return True
    except Exception as e:
        print(f"数据验证模型测试失败: {str(e)}")
        return False


if __name__ == "__main__":
    """运行所有测试"""
    print("开始基础功能测试...")
    
    tests = [
        test_config,
        test_version,
        test_models,
        test_schemas
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
    
    print(f"\n=== 测试结果 ===")
    print(f"通过: {passed}/{total}")
    
    if passed == total:
        print("所有测试通过!")
        sys.exit(0)
    else:
        print("部分测试失败!")
        sys.exit(1)
