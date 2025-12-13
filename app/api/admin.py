"""管理相关API接口"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import User, Note, Notification
from typing import List

router = APIRouter()


@router.get("/users")
def get_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """获取用户列表"""
    users = db.query(User).offset(skip).limit(limit).all()
    return users


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """获取系统统计信息"""
    # 获取用户数量
    user_count = db.query(User).count()
    
    # 获取笔记数量
    note_count = db.query(Note).count()
    
    # 获取通知数量
    notification_count = db.query(Notification).count()
    
    return {
        "users": user_count,
        "notes": note_count,
        "notifications": notification_count
    }
