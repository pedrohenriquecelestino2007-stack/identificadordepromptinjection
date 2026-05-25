import json
import os
import secrets

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from auth import create_token, get_current_user, hash_password, verify_password
from database import Analise, PecaGerada, User, create_tables, get_db, migrate_tables
from detection import analisar_completo, analisar_pdf, testar_conexao_groq
from generation import gerar_e_verificar
from schemas import (
    AnaliseDetalhe,
    AnaliseResumo,
    PecaRequest,
    PecaResponse,
    ResultadoCompleto,
    TextoRequest,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserResponse,
)

app = FastAPI(
    title="LexGuard API",
    description="Plataforma jurídica com detecção de prompt injection em duas camadas",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    create_tables()
    migrate_tables()


@app.get("/health")
def health():
    key = os.environ.get("GROQ_API_KEY", "NAO_DEFINIDA")
    key_suffix = key[-6:] if len(key) > 6 else key
    groq = testar_conexao_groq()
    return {
        "status": "ok" if groq["status"] == "ok" else "degradado",
        "model": "llama-3.3-70b-versatile",
        "key_suffix": key_suffix,
        "groq_api": groq["status"],
        "groq_erro": groq["erro"],
    }


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/auth/register", response_model=TokenResponse)
def register(req: UserCreate, db: Session = Depends(get_db)):
    if not req.name.strip():
        raise HTTPException(400, "O nome não pode estar vazio.")
    if not req.email.strip():
        raise HTTPException(400, "O e-mail não pode estar vazio.")
    if len(req.password) < 6:
        raise HTTPException(400, "A senha deve ter pelo menos 6 caracteres.")
    if db.query(User).filter(User.email == req.email.lower().strip()).first():
        raise HTTPException(400, "E-mail já cadastrado.")
    user = User(
        name=req.name.strip(),
        email=req.email.lower().strip(),
        password_hash=hash_password(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_token(user.id), user_id=user.id, name=user.name)


@app.post("/auth/login", response_model=TokenResponse)
def login(req: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower().strip()).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, "E-mail ou senha incorretos.")
    return TokenResponse(access_token=create_token(user.id), user_id=user.id, name=user.name)


@app.get("/auth/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    return user


# ── Análise ───────────────────────────────────────────────────────────────────

@app.post("/analisar/texto", response_model=ResultadoCompleto)
def analisar_texto(
    req: TextoRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not req.texto.strip():
        raise HTTPException(400, "O texto não pode estar vazio.")

    l1, l2 = analisar_completo(req.texto)

    registro = Analise(
        user_id=user.id,
        filename=None,
        tipo="texto",
        possui_injection=l1.possui_injection,
        nivel_geral=l1.nivel_geral,
        resumo=l1.resumo,
        achados=json.dumps([a.model_dump() for a in l1.achados], ensure_ascii=False),
        raciocinio_auditoria=l2.raciocinio_auditoria,
        recomendacao=l1.recomendacao,
    )
    db.add(registro)
    db.commit()
    db.refresh(registro)

    return ResultadoCompleto(layer1=l1, layer2=l2, id_salvo=registro.id)


@app.post("/analisar/pdf", response_model=ResultadoCompleto)
async def analisar_pdf_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Apenas arquivos PDF são suportados.")

    conteudo = await file.read()
    if len(conteudo) > 20 * 1024 * 1024:
        raise HTTPException(413, "PDF muito grande. Limite máximo: 20 MB.")

    l1, l2 = analisar_pdf(conteudo, file.filename)

    registro = Analise(
        user_id=user.id,
        filename=file.filename,
        tipo="pdf",
        possui_injection=l1.possui_injection,
        nivel_geral=l1.nivel_geral,
        resumo=l1.resumo,
        achados=json.dumps([a.model_dump() for a in l1.achados], ensure_ascii=False),
        raciocinio_auditoria=l2.raciocinio_auditoria,
        recomendacao=l1.recomendacao,
    )
    db.add(registro)
    db.commit()
    db.refresh(registro)

    return ResultadoCompleto(layer1=l1, layer2=l2, id_salvo=registro.id)


@app.post("/gerar/peca", response_model=PecaResponse)
def gerar_peca_endpoint(
    req: PecaRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tipos_validos = {"peticao", "contestacao", "recurso", "minuta"}
    if req.tipo_peca not in tipos_validos:
        raise HTTPException(400, f"tipo_peca deve ser um de: {', '.join(tipos_validos)}")
    if not req.fatos.strip():
        raise HTTPException(400, "O campo 'fatos' não pode estar vazio.")

    conteudo, l1, l2, passou = gerar_e_verificar(
        req.tipo_peca, req.fatos, req.pedidos or "", req.partes or ""
    )

    registro = PecaGerada(
        user_id=user.id,
        tipo_peca=req.tipo_peca,
        fatos_fornecidos=req.fatos,
        conteudo_gerado=conteudo,
        passou_na_detecao=passou,
        nivel_risco_detectado=l1.nivel_geral,
    )
    db.add(registro)
    db.commit()
    db.refresh(registro)

    return PecaResponse(
        tipo_peca=req.tipo_peca,
        conteudo=conteudo,
        analise_injection=l1,
        passou_na_detecao=passou,
        id_salvo=registro.id,
    )


# ── Histórico ─────────────────────────────────────────────────────────────────

@app.get("/historico", response_model=list[AnaliseResumo])
def listar_historico(
    nivel_geral: str = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Analise).filter(Analise.user_id == user.id).order_by(Analise.criado_em.desc())
    if nivel_geral:
        query = query.filter(Analise.nivel_geral == nivel_geral.upper())
    return query.limit(limit).all()


@app.get("/historico/{analise_id}", response_model=AnaliseDetalhe)
def obter_analise(
    analise_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    registro = db.query(Analise).filter(Analise.id == analise_id, Analise.user_id == user.id).first()
    if not registro:
        raise HTTPException(404, "Análise não encontrada.")
    return registro


@app.delete("/historico/{analise_id}")
def deletar_analise(
    analise_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    registro = db.query(Analise).filter(Analise.id == analise_id, Analise.user_id == user.id).first()
    if not registro:
        raise HTTPException(404, "Análise não encontrada.")
    db.delete(registro)
    db.commit()
    return {"ok": True}


@app.post("/historico/{analise_id}/compartilhar")
def compartilhar_analise(
    analise_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    registro = db.query(Analise).filter(Analise.id == analise_id, Analise.user_id == user.id).first()
    if not registro:
        raise HTTPException(404, "Análise não encontrada.")
    if not registro.share_token:
        registro.share_token = secrets.token_urlsafe(32)
        db.commit()
        db.refresh(registro)
    return {"share_token": registro.share_token}


@app.get("/compartilhada/{share_token}", response_model=AnaliseDetalhe)
def ver_compartilhada(share_token: str, db: Session = Depends(get_db)):
    registro = db.query(Analise).filter(Analise.share_token == share_token).first()
    if not registro:
        raise HTTPException(404, "Link inválido ou expirado.")
    return registro


# Serve o frontend apenas em ambiente local
_frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(_frontend_dir):
    app.mount("/", StaticFiles(directory=_frontend_dir, html=True), name="frontend")
