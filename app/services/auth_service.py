
from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.models.user import User
from app.schemas.user import UserRegister

password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """Convert a plain-text password into a secure password hash."""
    return password_hasher.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    """Check a password against its stored hash."""
    return password_hasher.verify(password, hashed_password)


def get_user_by_email(db: Session, email: str) -> User | None:
    normalized_email = email.strip().lower()

    statement = select(User).where(User.email == normalized_email)
    return db.scalar(statement)


def create_user(db: Session, user_data: UserRegister) -> User:
    """Create a candidate account. Public registration cannot assign admin roles."""
    normalized_email = str(user_data.email).strip().lower()

    if get_user_by_email(db, normalized_email):
        raise ValueError("An account with this email already exists.")

    user = User(
        full_name=user_data.full_name.strip(),
        email=normalized_email,
        hashed_password=hash_password(user_data.password),
        role="CANDIDATE",
        is_active=True,
    )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    except Exception:
        db.rollback()
        raise


def authenticate_user(
    db: Session, email: str, password: str
) -> User | None:
    user = get_user_by_email(db, email)

    if user is None or not user.is_active:
        return None

    if not verify_password(password, user.hashed_password):
        return None

    return user


def create_access_token(user: User) -> str:
    """Create a signed JWT with the user's ID and role."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user.id),
        "role": user.role,
        "iat": now,
        "exp": expires_at,
    }

    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
