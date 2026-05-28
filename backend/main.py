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
from detection import analisar_completo, analisar_documento, analisar_pdf, responder_pergunta, testar_conexao
from generation import gerar_e_verificar
from schemas import (
    AnaliseDetalhe,
    AnaliseResumo,
    PecaDetalhe,
    PecaRequest,
    PecaResponse,
    PecaResumo,
    PerguntaRequest,
    ResultadoCompleto,
    SenhaRequest,
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


@app.post("/debug/pdf")
async def debug_pdf(file: UploadFile = File(...)):
    import time, traceback
    result = {"etapas": []}
    try:
        t0 = time.time()
        conteudo = await file.read()
        result["etapas"].append({"etapa": "leitura", "tamanho_mb": round(len(conteudo)/1024/1024, 2), "seg": round(time.time()-t0, 2)})

        t1 = time.time()
        import fitz
        doc = fitz.open(stream=conteudo, filetype="pdf")
        n_pages = len(doc)
        doc.close()
        result["etapas"].append({"etapa": "fitz_open", "paginas": n_pages, "seg": round(time.time()-t1, 2)})

        from detection import _limite_paginas, _extrair_texto_pdf
        t2 = time.time()
        limite = _limite_paginas(len(conteudo))
        texto = _extrair_texto_pdf(conteudo)
        result["etapas"].append({"etapa": "extracao_texto", "limite_pags": limite, "chars": len(texto), "seg": round(time.time()-t2, 2)})

        result["ok"] = True
    except Exception as e:
        result["ok"] = False
        result["erro"] = str(e)
        result["traceback"] = traceback.format_exc()
    return result


@app.get("/health")
def health():
    key = os.environ.get("GROQ_API_KEY", "NAO_DEFINIDA")
    key_suffix = key[-6:] if len(key) > 6 else key
    api = testar_conexao()
    return {
        "status": "ok" if api["status"] == "ok" else "degradado",
        "model": "llama-3.3-70b-versatile",
        "key_suffix": key_suffix,
        "groq_api": api["status"],
        "groq_erro": api["erro"],
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


@app.put("/auth/senha")
def trocar_senha(
    req: SenhaRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from auth import verify_password as vp, hash_password as hp
    if not vp(req.senha_atual, user.password_hash):
        raise HTTPException(400, "Senha atual incorreta.")
    if len(req.nova_senha) < 6:
        raise HTTPException(400, "A nova senha deve ter pelo menos 6 caracteres.")
    user.password_hash = hp(req.nova_senha)
    db.commit()
    return {"ok": True}


@app.get("/auth/stats")
def get_stats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    analises = db.query(Analise).filter(Analise.user_id == user.id).all()
    pecas = db.query(PecaGerada).filter(PecaGerada.user_id == user.id).count()
    por_nivel = {
        "CRITICO": sum(1 for a in analises if a.nivel_geral == "CRITICO"),
        "ALTO":    sum(1 for a in analises if a.nivel_geral == "ALTO"),
        "MEDIO":   sum(1 for a in analises if a.nivel_geral == "MEDIO"),
        "BAIXO":   sum(1 for a in analises if a.nivel_geral == "BAIXO"),
        "NENHUM":  sum(1 for a in analises if a.nivel_geral == "NENHUM"),
    }
    membro_desde = user.created_at.strftime("%d/%m/%Y") if user.created_at else "—"
    return {
        "total_analises": len(analises),
        "total_pecas": pecas,
        "por_nivel": por_nivel,
        "membro_desde": membro_desde,
    }


# ── Chat ──────────────────────────────────────────────────────────────────────

@app.post("/perguntar")
def perguntar(req: PerguntaRequest, user: User = Depends(get_current_user)):
    if not req.pergunta.strip():
        raise HTTPException(400, "A pergunta não pode estar vazia.")
    resposta = responder_pergunta(req.pergunta, req.texto or "", req.contexto_analise or "")
    return {"resposta": resposta}


@app.post("/perguntar/analise/{analise_id}")
def perguntar_sobre_analise(
    analise_id: int,
    req: PerguntaRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    registro = db.query(Analise).filter(Analise.id == analise_id, Analise.user_id == user.id).first()
    if not registro:
        raise HTTPException(404, "Análise não encontrada.")
    if not req.pergunta.strip():
        raise HTTPException(400, "A pergunta não pode estar vazia.")
    contexto = f"Resumo: {registro.resumo}\nRecomendação: {registro.recomendacao}\nAchados: {registro.achados}"
    resposta = responder_pergunta(req.pergunta, req.texto or "", contexto)
    return {"resposta": resposta}


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
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else ""
    if ext not in {"pdf", "docx", "txt"}:
        raise HTTPException(400, "Formato não suportado. Envie PDF, DOCX ou TXT.")

    conteudo = await file.read()
    if len(conteudo) > 50 * 1024 * 1024:
        raise HTTPException(413, "Arquivo muito grande. Limite máximo: 50 MB.")

    l1, l2 = analisar_documento(conteudo, file.filename)

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
    query = db.query(Analise).filter(Analise.user_id == user.id, Analise.is_deleted == False).order_by(Analise.criado_em.desc())
    if nivel_geral:
        query = query.filter(Analise.nivel_geral == nivel_geral.upper())
    return query.limit(limit).all()


@app.get("/historico/{analise_id}", response_model=AnaliseDetalhe)
def obter_analise(
    analise_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    registro = db.query(Analise).filter(Analise.id == analise_id, Analise.user_id == user.id, Analise.is_deleted == False).first()
    if not registro:
        raise HTTPException(404, "Análise não encontrada.")
    return registro


@app.delete("/historico/{analise_id}")
def deletar_analise(
    analise_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    registro = db.query(Analise).filter(Analise.id == analise_id, Analise.user_id == user.id, Analise.is_deleted == False).first()
    if not registro:
        raise HTTPException(404, "Análise não encontrada.")
    registro.is_deleted = True
    db.commit()
    return {"ok": True}


# ── Lixeira ───────────────────────────────────────────────────────────────────

@app.get("/lixeira", response_model=list[AnaliseResumo])
def listar_lixeira(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return db.query(Analise).filter(Analise.user_id == user.id, Analise.is_deleted == True).order_by(Analise.criado_em.desc()).all()


@app.post("/lixeira/{analise_id}/restaurar")
def restaurar_analise(
    analise_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    registro = db.query(Analise).filter(Analise.id == analise_id, Analise.user_id == user.id, Analise.is_deleted == True).first()
    if not registro:
        raise HTTPException(404, "Análise não encontrada na lixeira.")
    registro.is_deleted = False
    db.commit()
    return {"ok": True}


@app.delete("/lixeira/{analise_id}")
def excluir_permanente(
    analise_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    registro = db.query(Analise).filter(Analise.id == analise_id, Analise.user_id == user.id, Analise.is_deleted == True).first()
    if not registro:
        raise HTTPException(404, "Análise não encontrada na lixeira.")
    db.delete(registro)
    db.commit()
    return {"ok": True}


# ── Peças Geradas ─────────────────────────────────────────────────────────────

@app.get("/pecas", response_model=list[PecaResumo])
def listar_pecas(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return db.query(PecaGerada).filter(PecaGerada.user_id == user.id).order_by(PecaGerada.criado_em.desc()).limit(100).all()


@app.get("/pecas/{peca_id}", response_model=PecaDetalhe)
def obter_peca(
    peca_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    peca = db.query(PecaGerada).filter(PecaGerada.id == peca_id, PecaGerada.user_id == user.id).first()
    if not peca:
        raise HTTPException(404, "Peça não encontrada.")
    return peca


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
