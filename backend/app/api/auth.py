from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_password_hash, verify_password, create_access_token
from app.models import User, Organization, Role
from app.schemas import UserCreate, UserResponse, Token
from app.api.deps import get_current_active_user

router = APIRouter()

async def ensure_default_roles(db: AsyncSession):
    # Seed default roles if not present
    roles = ["admin", "auditor", "user"]
    for role_name in roles:
        result = await db.execute(select(Role).where(Role.name == role_name))
        db_role = result.scalars().first()
        if not db_role:
            db_role = Role(name=role_name, description=f"Default {role_name} role")
            db.add(db_role)
    await db.commit()

@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user already exists first
    result = await db.execute(select(User).where(User.email == user_in.email))
    user = result.scalars().first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system",
        )

    # Seed roles first
    await ensure_default_roles(db)
    
    # Get default admin/auditor role for registration (or admin if first user)
    result = await db.execute(select(Role).where(Role.name == "admin"))
    role = result.scalars().first()

    # Atomically get or create organization by slug
    slug = user_in.organization_name.strip().lower().replace(" ", "-")
    try:
        async with db.begin_nested():
            result = await db.execute(select(Organization).where(Organization.slug == slug))
            org = result.scalars().first()
            if not org:
                org = Organization(
                    name=user_in.organization_name,
                    slug=slug
                )
                db.add(org)
                await db.flush() # Populate org.id without committing
    except Exception:
        # If nested transaction failed (e.g. concurrent creation), retrieve it
        result = await db.execute(select(Organization).where(Organization.slug == slug))
        org = result.scalars().first()
        if not org:
            raise HTTPException(
                status_code=500,
                detail="Failed to create or retrieve organization atomic transaction"
            )
            
    # Create user linked to organization in one single commit transaction
    db_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        is_active=True,
        role_id=role.id if role else None,
        organization_id=org.id,
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user

@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    # Check user credentials
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalars().first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
        )
    elif not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": create_access_token(
            user.id, expires_delta=access_token_expires
        ),
        "token_type": "bearer",
    }

@router.get("/me", response_model=UserResponse)
async def read_user_me(
    current_user: User = Depends(get_current_active_user)
):
    return current_user
