# LexGuard

Plataforma jurídica com detecção de prompt injection em duas camadas, geração de peças jurídicas e histórico de análises.

## Instalação

```bash
cd backend
pip install -r requirements.txt
```

## Configuração

Copie `.env.example` para `.env` na pasta `backend/` e preencha os valores:

```env
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@db.[project-ref].supabase.co:5432/postgres
GEMINI_API_KEY=AIzaSy...
```

## Executar

```bash
cd backend
uvicorn main:app --reload --port 8000
```

- **Interface:** http://localhost:8000
- **API Docs (Swagger):** http://localhost:8000/docs

## Arquitetura de Detecção

```
Documento
    │
    ▼
┌─────────────────────────────────┐
│  Camada 1 — Detecção            │
│  Varre o texto antes de         │
│  qualquer processamento         │
│  → JSON com achados e níveis    │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  Camada 2 — Auditoria           │
│  Verifica se a Camada 1 foi     │
│  ela própria manipulada         │
│  → auditoria_aprovada: bool     │
└─────────────────────────────────┘
```

## Endpoints da API

| Método | Rota               | Descrição                        |
|--------|--------------------|----------------------------------|
| POST   | /analisar/texto    | Analisa texto por injection      |
| POST   | /analisar/pdf      | Analisa PDF por injection        |
| POST   | /gerar/peca        | Gera peça jurídica + auto-scan   |
| GET    | /historico         | Lista todas as análises          |
| GET    | /historico/{id}    | Detalhe de uma análise           |
| GET    | /health            | Status da API                    |

## Níveis de Risco

| Nível   | Significado                                            |
|---------|--------------------------------------------------------|
| CRITICO | Instrução direta que alteraria comportamento da IA     |
| ALTO    | Tentativa clara de manipulação                         |
| MEDIO   | Texto suspeito com risco real                          |
| BAIXO   | Padrão levemente suspeito                              |
| NENHUM  | Documento limpo                                        |

## Banco de Dados

PostgreSQL gerenciado pelo Supabase. As tabelas `analises` e `pecas_geradas` são criadas automaticamente na primeira execução via SQLAlchemy.

# identificadordepromptinjection
