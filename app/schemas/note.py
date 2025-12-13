"""笔记相关的数据验证模型"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class TagBase(BaseModel):
    """标签基础模型"""
    name: str = Field(..., min_length=1, max_length=50, description="标签名称")
    description: Optional[str] = Field(None, max_length=200, description="标签描述")
    color: Optional[str] = Field("#3498db", description="标签颜色")


class TagCreate(TagBase):
    """标签创建模型"""
    pass


class TagUpdate(BaseModel):
    """标签更新模型"""
    name: Optional[str] = Field(None, min_length=1, max_length=50, description="标签名称")
    description: Optional[str] = Field(None, max_length=200, description="标签描述")
    color: Optional[str] = Field(None, description="标签颜色")


class Tag(TagBase):
    """标签响应模型"""
    id: int
    owner_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class NoteBase(BaseModel):
    """笔记基础模型"""
    title: str = Field(..., min_length=1, max_length=200, description="笔记标题")
    content: Optional[str] = Field(None, description="笔记内容")
    is_public: Optional[bool] = Field(False, description="是否公开")
    is_favorite: Optional[bool] = Field(False, description="是否收藏")
    parent_id: Optional[int] = Field(None, description="父笔记ID")


class NoteCreate(NoteBase):
    """笔记创建模型"""
    tags: Optional[List[int]] = Field([], description="标签ID列表")


class NoteUpdate(BaseModel):
    """笔记更新模型"""
    title: Optional[str] = Field(None, min_length=1, max_length=200, description="笔记标题")
    content: Optional[str] = Field(None, description="笔记内容")
    is_public: Optional[bool] = Field(None, description="是否公开")
    is_favorite: Optional[bool] = Field(None, description="是否收藏")
    parent_id: Optional[int] = Field(None, description="父笔记ID")
    tags: Optional[List[int]] = Field(None, description="标签ID列表")


class NoteInDB(NoteBase):
    """数据库中的笔记模型"""
    id: int
    owner_id: int
    view_count: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class Note(NoteInDB):
    """笔记响应模型"""
    tags: List[Tag] = Field([], description="标签列表")
    children_count: int = Field(0, description="子笔记数量")
    attachments_count: int = Field(0, description="附件数量")


class NoteList(BaseModel):
    """笔记列表响应模型"""
    total: int
    items: List[Note]


class NoteShare(BaseModel):
    """笔记分享模型"""
    note_id: int
    share_url: str
    qr_code_url: Optional[str] = None
