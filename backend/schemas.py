import datetime
from typing import List, Optional
from pydantic import BaseModel, field_validator


class Achado(BaseModel):
    trecho: str
    pagina_estimada: str
    tipo: str
    nivel_risco: str
    descricao: str
    confianca: int = 80  # 0-100


class ResultadoLayer1(BaseModel):
    possui_injection: bool
    nivel_geral: str
    resumo: str
    achados: List[Achado]
    recomendacao: str
    sugestoes_correcao: List[str] = []

    @field_validator("achados", mode="before")
    @classmethod
    def ensure_list(cls, v):
        if v is None:
            return []
        return v

    @field_validator("sugestoes_correcao", mode="before")
    @classmethod
    def ensure_sugestoes(cls, v):
        if v is None:
            return []
        return v


class ResultadoLayer2(BaseModel):
    auditoria_aprovada: bool
    raciocinio_auditoria: str
    ajustes: str


class ResultadoCompleto(BaseModel):
    layer1: ResultadoLayer1
    layer2: ResultadoLayer2
    id_salvo: int


class TextoRequest(BaseModel):
    texto: str


class PecaRequest(BaseModel):
    tipo_peca: str
    fatos: str
    pedidos: Optional[str] = ""
    partes: Optional[str] = ""


class AnaliseResumo(BaseModel):
    id: int
    filename: Optional[str]
    tipo: str
    possui_injection: bool
    nivel_geral: str
    share_token: Optional[str] = None
    criado_em: datetime.datetime

    model_config = {"from_attributes": True}


class AnaliseDetalhe(AnaliseResumo):
    resumo: str
    achados: str
    raciocinio_auditoria: Optional[str]
    recomendacao: str


class PecaResponse(BaseModel):
    tipo_peca: str
    conteudo: str
    analise_injection: ResultadoLayer1
    passou_na_detecao: bool
    id_salvo: int


class UserCreate(BaseModel):
    name: str
    email: str
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    name: str


class UserResponse(BaseModel):
    id: int
    name: str
    email: str

    model_config = {"from_attributes": True}


class SenhaRequest(BaseModel):
    senha_atual: str
    nova_senha: str


class PerguntaRequest(BaseModel):
    pergunta: str
    texto: Optional[str] = ""
    contexto_analise: Optional[str] = ""
