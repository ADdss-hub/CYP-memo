"""文件相关API接口"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import Attachment
from app.core.file_parser import parse_file, get_supported_file_types
from typing import List
import os
from app.core.config import settings

router = APIRouter()


@router.post("/upload")
def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """上传文件"""
    # 检查文件大小
    file.file.seek(0, 2)  # 移动到文件末尾
    file_size = file.file.tell()  # 获取文件大小
    file.file.seek(0)  # 重置文件指针
    
    if file_size > settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"文件大小超过限制: {settings.MAX_FILE_SIZE / 1024 / 1024}MB")
    
    # 确保上传目录存在
    upload_dir = os.path.join(settings.UPLOAD_DIR, "attachments")
    os.makedirs(upload_dir, exist_ok=True)
    
    # 保存文件
    file_path = os.path.join(upload_dir, file.filename)
    with open(file_path, "wb") as f:
        f.write(file.file.read())
    
    # 解析文件类型
    import magic
    mime = magic.Magic(mime=True)
    file_type = mime.from_file(file_path)
    
    # 创建附件记录
    attachment = Attachment(
        filename=file.filename,
        file_path=file_path,
        file_type=file_type,
        file_size=file_size,
        owner_id=1,  # 临时设置为1，实际应从认证中获取
        is_parsed=False
    )
    
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    
    return {
        "id": attachment.id,
        "filename": attachment.filename,
        "file_type": attachment.file_type,
        "file_size": attachment.file_size,
        "file_path": attachment.file_path
    }


@router.get("/supported-types")
def get_supported_file_types_endpoint():
    """获取支持的文件类型"""
    return {
        "supported_types": get_supported_file_types()
    }


@router.get("/{file_id}/parse")
def parse_file_endpoint(file_id: int, db: Session = Depends(get_db)):
    """解析文件"""
    attachment = db.query(Attachment).filter(Attachment.id == file_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    try:
        parsed_content = parse_file(attachment.file_path)
        # 更新解析状态
        attachment.is_parsed = True
        db.commit()
        return parsed_content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"解析文件失败: {str(e)}")
