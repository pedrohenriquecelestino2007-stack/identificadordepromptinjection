import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import User, get_db

SECRET_KEY = os.environ.get("SECRET_KEY", "lexguard-insecure-dev-secret-change-in-production")
ALGORITHM = "HS256"
TOKEN_DAYS = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(user_id: int) -> str:
    exp = datetime.utcnow() + timedelta(days=TOKEN_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": exp}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(401, "Autenticação necessária.")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        uid = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(401, "Token inválido ou expirado.")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(401, "Usuário não encontrado.")
    return user
