"""笔记相关API接口"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import Note, Tag
from app.schemas import NoteCreate, NoteUpdate, Note as NoteSchema
from typing import List

router = APIRouter()


@router.get("/", response_model=List[NoteSchema])
def get_notes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """获取笔记列表"""
    notes = db.query(Note).offset(skip).limit(limit).all()
    return notes


@router.post("/", response_model=NoteSchema)
def create_note(note: NoteCreate, db: Session = Depends(get_db)):
    """创建笔记"""
    db_note = Note(**note.dict(exclude={"tags"}))
    
    # 添加标签
    if note.tags:
        tags = db.query(Tag).filter(Tag.id.in_(note.tags)).all()
        db_note.tags = tags
    
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return db_note


@router.get("/{note_id}", response_model=NoteSchema)
def get_note(note_id: int, db: Session = Depends(get_db)):
    """获取笔记详情"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    return note


@router.put("/{note_id}", response_model=NoteSchema)
def update_note(note_id: int, note: NoteUpdate, db: Session = Depends(get_db)):
    """更新笔记"""
    db_note = db.query(Note).filter(Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    
    # 更新笔记字段
    update_data = note.dict(exclude_unset=True)
    for key, value in update_data.items():
        if key != "tags":
            setattr(db_note, key, value)
    
    # 更新标签
    if "tags" in update_data:
        tags = db.query(Tag).filter(Tag.id.in_(update_data["tags"])).all()
        db_note.tags = tags
    
    db.commit()
    db.refresh(db_note)
    return db_note


@router.delete("/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    """删除笔记"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    
    db.delete(note)
    db.commit()
    return {"message": "笔记删除成功"}
