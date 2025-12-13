from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Notification(Base):
    """通知模型"""
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(100), nullable=False, comment="通知标题")
    content = Column(Text, nullable=False, comment="通知内容")
    notification_type = Column(String(50), nullable=False, comment="通知类型")
    is_read = Column(Boolean, default=False, comment="是否已读")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    
    # 外键
    user_id = Column(Integer, ForeignKey("users.id"), comment="所属用户ID")
    
    # 关系
    user = relationship("User", back_populates="notifications")
    
    def __repr__(self):
        return f"<Notification(id={self.id}, title='{self.title}', user_id={self.user_id})>"
