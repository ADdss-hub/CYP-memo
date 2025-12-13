#!/usr/bin/env python3
"""测试配置系统的自适应能力"""

import os
import sys
import logging

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def test_config_adaptation():
    """测试配置系统的自适应能力"""
    logger.info("=== 开始测试配置系统自适应能力 ===")
    
    # 测试1: 检查基础目录检测
    logger.info(f"1. 基础目录检测:")
    logger.info(f"   BASE_DIR: {settings.BASE_DIR}")
    logger.info(f"   是否为绝对路径: {os.path.isabs(settings.BASE_DIR)}")
    logger.info(f"   目录是否存在: {os.path.exists(settings.BASE_DIR)}")
    
    # 测试2: 检查目录规范化
    logger.info(f"2. 目录规范化:")
    logger.info(f"   UPLOAD_DIR: {settings.UPLOAD_DIR}")
    logger.info(f"   是否为绝对路径: {os.path.isabs(settings.UPLOAD_DIR)}")
    logger.info(f"   目录是否存在: {os.path.exists(settings.UPLOAD_DIR)}")
    logger.info(f"   DATA_DIR: {settings.DATA_DIR}")
    logger.info(f"   是否为绝对路径: {os.path.isabs(settings.DATA_DIR)}")
    logger.info(f"   目录是否存在: {os.path.exists(settings.DATA_DIR)}")
    
    # 测试3: 检查目录结构
    logger.info(f"3. 目录结构:")
    subdirs = [
        os.path.join(settings.UPLOAD_DIR, "attachments"),
        os.path.join(settings.UPLOAD_DIR, "qr_codes"),
        os.path.join(settings.DATA_DIR, "backups"),
        os.path.join(settings.DATA_DIR, "logs"),
        os.path.join(settings.DATA_DIR, "webdav")
    ]
    for subdir in subdirs:
        exists = os.path.exists(subdir)
        logger.info(f"   {os.path.basename(subdir)}: {'✓ 存在' if exists else '✗ 不存在'}")
    
    # 测试4: 检查路径有效性
    logger.info(f"4. 路径有效性:")
    test_paths = [
        settings.BASE_DIR,
        settings.UPLOAD_DIR,
        os.path.join(settings.BASE_DIR, "test.txt"),
        "/tmp/invalid_path"
    ]
    for path in test_paths:
        valid = settings.is_valid_path(path)
        logger.info(f"   {path}: {'✓ 有效' if valid else '✗ 无效'}")
    
    # 测试5: 检查绝对路径转换
    logger.info(f"5. 绝对路径转换:")
    relative_paths = [
        "test.txt",
        "subdir/test.txt",
        "./test.txt",
        "../test.txt"
    ]
    for rel_path in relative_paths:
        abs_path = settings.get_absolute_path(rel_path)
        logger.info(f"   {rel_path} -> {abs_path}")
    
    # 测试6: 检查存储信息获取
    logger.info(f"6. 存储信息获取:")
    storage_info = settings.get_storage_info()
    logger.info(f"   系统类型: {storage_info.get('system')}")
    logger.info(f"   总空间: {storage_info.get('total_space', 0) / 1024 / 1024 / 1024:.2f} GB")
    logger.info(f"   已用空间: {storage_info.get('used_space', 0) / 1024 / 1024 / 1024:.2f} GB")
    logger.info(f"   可用空间: {storage_info.get('free_space', 0) / 1024 / 1024 / 1024:.2f} GB")
    
    # 测试7: 检查应用信息
    logger.info(f"7. 应用信息:")
    logger.info(f"   应用名称: {settings.APP_NAME}")
    logger.info(f"   应用版本: {settings.APP_VERSION}")
    logger.info(f"   应用环境: {settings.APP_ENV}")
    logger.info(f"   调试模式: {settings.DEBUG}")
    
    logger.info("=== 配置系统自适应能力测试完成 ===")

if __name__ == "__main__":
    test_config_adaptation()
