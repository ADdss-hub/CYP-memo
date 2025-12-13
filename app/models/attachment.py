from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Attachment(Base):
    """附件模型"""
    __tablename__ = "attachments"
    
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False, comment="文件名")
    file_path = Column(String(500), nullable=False, comment="文件路径")
    file_type = Column(String(50), nullable=False, comment="文件类型")
    file_size = Column(Integer, nullable=False, comment="文件大小")
    is_parsed = Column(Boolean, default=False, comment="是否已解析")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    
    # 外键
    owner_id = Column(Integer, ForeignKey("users.id"), comment="所属用户ID")
    note_id = Column(Integer, ForeignKey("notes.id"), nullable=True, comment="所属笔记ID")
    
    # 关系
    owner = relationship("User", back_populates="attachments")
    note = relationship("Note", back_populates="attachments")
    
    def __repr__(self):
        return f"<Attachment(id={self.id}, filename='{self.filename}', note_id={self.note_id})>"
