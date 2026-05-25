import datetime
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, Integer, String, Boolean, Text, DateTime, ForeignKey, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Analise(Base):
    __tablename__ = "analises"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    filename = Column(String, nullable=True)
    tipo = Column(String, nullable=False)
    possui_injection = Column(Boolean, nullable=False)
    nivel_geral = Column(String, nullable=False)
    resumo = Column(Text, nullable=False)
    achados = Column(Text, nullable=False)
    raciocinio_auditoria = Column(Text, nullable=True)
    recomendacao = Column(Text, nullable=False)
    share_token = Column(String(64), nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)
    criado_em = Column(DateTime, default=datetime.datetime.utcnow)


class PecaGerada(Base):
    __tablename__ = "pecas_geradas"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    tipo_peca = Column(String, nullable=False)
    fatos_fornecidos = Column(Text, nullable=False)
    conteudo_gerado = Column(Text, nullable=False)
    passou_na_detecao = Column(Boolean, nullable=False)
    nivel_risco_detectado = Column(String, nullable=False)
    criado_em = Column(DateTime, default=datetime.datetime.utcnow)


def create_tables():
    Base.metadata.create_all(bind=engine)


def migrate_tables():
    try:
        with engine.connect() as conn:
            conn.execute(text(
                "ALTER TABLE analises ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL"
            ))
            conn.execute(text(
                "ALTER TABLE analises ADD COLUMN IF NOT EXISTS share_token VARCHAR(64)"
            ))
            conn.execute(text(
                "ALTER TABLE pecas_geradas ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL"
            ))
            conn.execute(text(
                "ALTER TABLE analises ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE"
            ))
            conn.commit()
    except Exception as e:
        print(f"[MIGRATION] {e}")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
