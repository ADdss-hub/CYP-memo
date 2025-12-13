"""数据验证模型层"""
from app.schemas.auth import (
    User,
    UserCreate,
    UserUpdate,
    PasswordUpdate,
    Token,
    TokenData
)
from app.schemas.note import (
    Tag,
    TagCreate,
    TagUpdate,
    Note,
    NoteCreate,
    NoteUpdate,
    NoteList,
    NoteShare
)

__all__ = [
    # 认证相关
    "User",
    "UserCreate",
    "UserUpdate",
    "PasswordUpdate",
    "Token",
    "TokenData",
    # 笔记相关
    "Tag",
    "TagCreate",
    "TagUpdate",
    "Note",
    "NoteCreate",
    "NoteUpdate",
    "NoteList",
    "NoteShare"
]
