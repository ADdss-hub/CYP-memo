from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

# 笔记和标签的多对多关系表
note_tags = Table(
    "note_tags",
    Base.metadata,
    Column("note_id", Integer, ForeignKey("notes.id"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id"), primary_key=True)
)


class Note(Base):
    """笔记模型"""
    __tablename__ = "notes"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, comment="笔记标题")
    content = Column(Text, nullable=True, comment="笔记内容")
    is_public = Column(Boolean, default=False, comment="是否公开")
    is_favorite = Column(Boolean, default=False, comment="是否收藏")
    view_count = Column(Integer, default=0, comment="浏览次数")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), comment="更新时间")
    
    # 外键
    owner_id = Column(Integer, ForeignKey("users.id"), comment="所属用户ID")
    parent_id = Column(Integer, ForeignKey("notes.id"), nullable=True, comment="父笔记ID")
    
    # 关系
    owner = relationship("User", back_populates="notes")
    parent = relationship("Note", remote_side=[id], backref="children")
    tags = relationship("Tag", secondary=note_tags, back_populates="notes")
    attachments = relationship("Attachment", back_populates="note", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Note(id={self.id}, title='{self.title}', owner_id={self.owner_id})>"
