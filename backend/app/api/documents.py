import os
import shutil
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models import User, Document, DocumentVersion
from app.schemas import DocumentResponse

router = APIRouter()

# Local storage path simulation
STORAGE_DIR = os.path.join(os.getcwd(), "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Verify file extension
    ext = os.path.splitext(file.filename)[1].lower()
    allowed_exts = [".pdf", ".docx", ".xlsx", ".csv", ".txt"]
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Supported types are: {', '.join(allowed_exts)}"
        )
    
    # Save file locally
    org_dir = os.path.join(STORAGE_DIR, str(current_user.organization_id))
    os.makedirs(org_dir, exist_ok=True)
    
    file_path = os.path.join(org_dir, file.filename)
    
    # Handle filename collision by adding versioning in filename
    base_name, extension = os.path.splitext(file.filename)
    counter = 1
    while os.path.exists(file_path):
        new_filename = f"{base_name}_{counter}{extension}"
        file_path = os.path.join(org_dir, new_filename)
        counter += 1
    
    # Write file to storage
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Read file size
    file_size = os.path.getsize(file_path)
    
    # Save document to DB
    db_doc = Document(
        filename=os.path.basename(file_path),
        file_type=ext.replace(".", "").upper(),
        storage_path=file_path,
        status="uploaded",
        organization_id=current_user.organization_id
    )
    db.add(db_doc)
    await db.commit()
    await db.refresh(db_doc)
    
    # Save version record
    db_ver = DocumentVersion(
        document_id=db_doc.id,
        version_number=1,
        storage_path=file_path
    )
    db.add(db_ver)
    await db.commit()
    
    return db_doc

@router.get("/", response_model=List[DocumentResponse])
async def list_documents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(
        select(Document).where(Document.organization_id == current_user.organization_id)
    )
    return result.scalars().all()

@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.organization_id == current_user.organization_id
        )
    )
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc

@router.delete("/{document_id}")
async def delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.organization_id == current_user.organization_id
        )
    )
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Clean up file in storage
    if os.path.exists(doc.storage_path):
        try:
            os.remove(doc.storage_path)
        except Exception:
            pass
            
    await db.delete(doc)
    await db.commit()
    return {"message": "Document deleted successfully"}
