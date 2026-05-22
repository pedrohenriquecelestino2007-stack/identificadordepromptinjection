import datetime
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, Integer, String, Boolean, Text, DateTime
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class Analise(Base):
    __tablename__ = "analises"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=True)
    tipo = Column(String, nullable=False)
    possui_injection = Column(Boolean, nullable=False)
    nivel_geral = Column(String, nullable=False)
    resumo = Column(Text, nullable=False)
    achados = Column(Text, nullable=False)
    raciocinio_auditoria = Column(Text, nullable=True)
    recomendacao = Column(Text, nullable=False)
    criado_em = Column(DateTime, default=datetime.datetime.utcnow)


class PecaGerada(Base):
    __tablename__ = "pecas_geradas"

    id = Column(Integer, primary_key=True, index=True)
    tipo_peca = Column(String, nullable=False)
    fatos_fornecidos = Column(Text, nullable=False)
    conteudo_gerado = Column(Text, nullable=False)
    passou_na_detecao = Column(Boolean, nullable=False)
    nivel_risco_detectado = Column(String, nullable=False)
    criado_em = Column(DateTime, default=datetime.datetime.utcnow)


def create_tables():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
