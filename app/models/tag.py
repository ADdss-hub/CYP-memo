from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Tag(Base):
    """标签模型"""
    __tablename__ = "tags"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, index=True, nullable=False, comment="标签名称")
    description = Column(String(200), nullable=True, comment="标签描述")
    color = Column(String(20), default="#3498db", comment="标签颜色")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), comment="更新时间")
    
    # 外键
    owner_id = Column(Integer, ForeignKey("users.id"), comment="所属用户ID")
    
    # 关系
    owner = relationship("User")
    notes = relationship("Note", secondary="note_tags", back_populates="tags")
    
    def __repr__(self):
        return f"<Tag(id={self.id}, name='{self.name}', owner_id={self.owner_id})>"
