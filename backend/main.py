import json
import os

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from database import Analise, PecaGerada, create_tables, get_db
from detection import analisar_completo, analisar_pdf
from generation import gerar_e_verificar
from schemas import (
    AnaliseDetalhe,
    AnaliseResumo,
    PecaRequest,
    PecaResponse,
    ResultadoCompleto,
    TextoRequest,
)

app = FastAPI(
    title="LexGuard API",
    description="Plataforma jurídica com detecção de prompt injection em duas camadas",
    version="1.0.0",
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


@app.get("/health")
def health():
    return {"status": "ok", "model": "gemini-2.0-flash"}


@app.post("/analisar/texto", response_model=ResultadoCompleto)
def analisar_texto(req: TextoRequest, db: Session = Depends(get_db)):
    if not req.texto.strip():
        raise HTTPException(400, "O texto não pode estar vazio.")

    l1, l2 = analisar_completo(req.texto)

    registro = Analise(
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
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Apenas arquivos PDF são suportados.")

    conteudo = await file.read()
    if len(conteudo) > 20 * 1024 * 1024:
        raise HTTPException(413, "PDF muito grande. Limite máximo: 20 MB.")

    l1, l2 = analisar_pdf(conteudo, file.filename)

    registro = Analise(
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
def gerar_peca_endpoint(req: PecaRequest, db: Session = Depends(get_db)):
    tipos_validos = {"peticao", "contestacao", "recurso", "minuta"}
    if req.tipo_peca not in tipos_validos:
        raise HTTPException(400, f"tipo_peca deve ser um de: {', '.join(tipos_validos)}")
    if not req.fatos.strip():
        raise HTTPException(400, "O campo 'fatos' não pode estar vazio.")

    conteudo, l1, l2, passou = gerar_e_verificar(
        req.tipo_peca, req.fatos, req.pedidos or "", req.partes or ""
    )

    registro = PecaGerada(
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


@app.get("/historico", response_model=list[AnaliseResumo])
def listar_historico(
    nivel_geral: str = Query(None, description="Filtrar por nível: CRITICO, ALTO, MEDIO, BAIXO, NENHUM"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(Analise).order_by(Analise.criado_em.desc())
    if nivel_geral:
        query = query.filter(Analise.nivel_geral == nivel_geral.upper())
    return query.limit(limit).all()


@app.get("/historico/{analise_id}", response_model=AnaliseDetalhe)
def obter_analise(analise_id: int, db: Session = Depends(get_db)):
    registro = db.query(Analise).filter(Analise.id == analise_id).first()
    if not registro:
        raise HTTPException(404, "Análise não encontrada.")
    return registro


# DEVE ser o último — serve index.html como fallback SPA
_frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/", StaticFiles(directory=_frontend_dir, html=True), name="frontend")
