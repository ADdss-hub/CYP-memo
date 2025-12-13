"""认证相关的数据验证模型"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    """用户基础模型"""
    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    email: EmailStr = Field(..., description="邮箱")
    full_name: Optional[str] = Field(None, max_length=100, description="真实姓名")


class UserCreate(UserBase):
    """用户创建模型"""
    password: str = Field(..., min_length=6, description="密码")


class UserUpdate(BaseModel):
    """用户更新模型"""
    full_name: Optional[str] = Field(None, max_length=100, description="真实姓名")
    email: Optional[EmailStr] = Field(None, description="邮箱")


class PasswordUpdate(BaseModel):
    """密码更新模型"""
    old_password: str = Field(..., description="旧密码")
    new_password: str = Field(..., min_length=6, description="新密码")


class User(UserBase):
    """用户响应模型"""
    id: int
    is_active: bool
    is_admin: bool
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime]
    
    class Config:
        from_attributes = True


class Token(BaseModel):
    """令牌响应模型"""
    access_token: str
    token_type: str
    user_id: int
    username: str
    is_admin: bool


class TokenData(BaseModel):
    """令牌数据模型"""
    username: Optional[str] = None
