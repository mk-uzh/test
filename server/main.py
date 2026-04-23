"""
TrailSafe API — auth, DB (default SQLite file), JWT session cookie.
Run from project: uvicorn server.main:app --host 0.0.0.0 --port 8000
"""
# Bundle entry: /api/* for auth; static files (index, auth, js, data) are mounted at project ROOT.
from __future__ import annotations

import os
import re
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import String, DateTime, ForeignKey, create_engine, func, Integer
from sqlalchemy.orm import Session, DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

load_dotenv(Path(__file__).parent / ".env")

ROOT = Path(__file__).resolve().parent.parent
_default_sqlite = (ROOT / "trailsafe.db").resolve()
DEFAULT_DATABASE_URL = f"sqlite:///{_default_sqlite.as_posix()}"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-change-me")
JWT_ALG = "HS256"
COOKIE_NAME = "trailsafe_token"
DEMO_REVEAL_RESET = os.getenv("DEMO_REVEAL_RESET_TOKEN", "0") == "1"
TOKEN_DAYS = 7

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    user: Mapped[User] = relationship("User")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


PWD_DESC = "at least 8 characters, one uppercase, one number, one special character"
PWD_RE = re.compile(r"^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$")


def validate_password_strength(p: str) -> str | None:
    if not p:
        return "Password is required."
    if len(p) < 8:
        return "Password must be at least 8 characters."
    if not re.search(r"[A-Z]", p):
        return "Password must include one uppercase letter."
    if not re.search(r"\d", p):
        return "Password must include one number."
    if not re.search(r"[^A-Za-z0-9]", p):
        return "Password must include one special character."
    if not PWD_RE.match(p):
        return f"Password does not meet requirements: {PWD_DESC}."
    return None


def create_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user_id), "exp": now + timedelta(days=TOKEN_DAYS), "iat": now},
        JWT_SECRET,
        algorithm=JWT_ALG,
    )


def get_user_id_from_request(request: Request) -> int | None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return int(data.get("sub", 0))
    except (JWTError, ValueError, TypeError):
        return None


def require_user(request: Request, db: Session = Depends(get_db)) -> User:
    uid = get_user_id_from_request(request)
    if not uid:
        raise HTTPException(401, "Not authenticated")
    u = db.get(User, uid)
    if not u:
        raise HTTPException(401, "Not authenticated")
    return u


class RegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)
    terms_accepted: bool = False

    @field_validator("password")
    @classmethod
    def pwd_ok(cls, v: str) -> str:
        err = validate_password_strength(v)
        if err:
            raise ValueError(err)
        return v


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class ForgotBody(BaseModel):
    email: EmailStr


class ResetBody(BaseModel):
    token: str = Field(min_length=10)
    new_password: str = Field(min_length=1)

    @field_validator("new_password")
    @classmethod
    def pwd_ok(cls, v: str) -> str:
        err = validate_password_strength(v)
        if err:
            raise ValueError(err)
        return v


app = FastAPI(title="TrailSafe API")

# Same-origin: browser loads app from this server. Allow credentials.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)


def set_auth_cookie(response: Response, user_id: int) -> None:
    token = create_token(user_id)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=TOKEN_DAYS * 24 * 3600,
        path="/",
    )


@app.post("/api/auth/register")
def register(body: RegisterBody, db: Session = Depends(get_db)):
    if not body.terms_accepted:
        raise HTTPException(400, "You must accept the information notice before registering.")
    err = validate_password_strength(body.password)
    if err:
        raise HTTPException(400, err)
    email = str(body.email).lower().strip()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(400, "An account with this email already exists.")
    u = User(email=email, password_hash=pwd_ctx.hash(body.password))
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"ok": True, "message": "Registration successful. You can sign in now."}


@app.post("/api/auth/login")
def login(body: LoginBody, response: Response, db: Session = Depends(get_db)):
    email = str(body.email).lower().strip()
    u = db.query(User).filter(func.lower(User.email) == email).first()
    if not u or not pwd_ctx.verify(body.password, u.password_hash):
        raise HTTPException(401, "The email or password is incorrect.")
    set_auth_cookie(response, u.id)
    return {"ok": True}


@app.post("/api/auth/logout")
def logout():
    r = JSONResponse({"ok": True})
    r.delete_cookie(COOKIE_NAME, path="/")
    return r


@app.get("/api/auth/me")
def me(request: Request, db: Session = Depends(get_db)):
    uid = get_user_id_from_request(request)
    if not uid:
        raise HTTPException(401, "Not authenticated")
    u = db.get(User, uid)
    if not u:
        raise HTTPException(401, "Not authenticated")
    return {"email": u.email, "id": u.id}


@app.post("/api/auth/forgot-password")
def forgot_password(body: ForgotBody, db: Session = Depends(get_db)):
    email = str(body.email).lower().strip()
    u = db.query(User).filter(func.lower(User.email) == email).first()
    out: dict = {
        "message": "If an account exists for this address, you will receive reset instructions.",
    }
    if not u:
        return out
    raw = secrets.token_urlsafe(32)
    h = hash_token(raw)
    exp = datetime.now(timezone.utc) + timedelta(hours=1)
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == u.id).delete()
    db.add(
        PasswordResetToken(user_id=u.id, token_hash=h, expires_at=exp)
    )
    db.commit()
    if DEMO_REVEAL_RESET:
        out["debug_reset_token"] = raw
    return out


@app.post("/api/auth/reset-password")
def reset_password(body: ResetBody, db: Session = Depends(get_db)):
    err = validate_password_strength(body.new_password)
    if err:
        raise HTTPException(400, err)
    h = hash_token(body.token)
    t = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token_hash == h,
            PasswordResetToken.expires_at > datetime.now(timezone.utc),
        )
        .first()
    )
    if not t:
        raise HTTPException(400, "Invalid or expired reset link. Please request a new one.")
    u = db.get(User, t.user_id)
    if not u:
        raise HTTPException(400, "Invalid request.")
    u.password_hash = pwd_ctx.hash(body.new_password)
    db.delete(t)
    db.commit()
    return {"ok": True, "message": "Password has been updated. You can sign in now."}


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Static files after API routes (trailsafe/ root: index.html, auth.html, css, js, data)
app.mount("/", StaticFiles(directory=str(ROOT), html=True), name="web")
