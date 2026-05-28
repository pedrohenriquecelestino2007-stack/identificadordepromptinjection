from fastapi import HTTPException

from detection import _call_api, analisar_completo
from schemas import ResultadoLayer1, ResultadoLayer2

SYSTEM_PROMPT_GERACAO = """Você é um advogado especialista em direito brasileiro com 20 anos de experiência.
Redija peças jurídicas profissionais em português formal e técnico.

Diretrizes obrigatórias:
- Use fundamentação legal brasileira vigente (Código Civil, CPC 2015, CLT conforme aplicável)
- Estruture com seções claras: cabeçalho de endereçamento, QUALIFICAÇÃO DAS PARTES, DOS FATOS, DO DIREITO, DOS PEDIDOS e DO VALOR DA CAUSA quando aplicável
- Use linguagem jurídica formal, precisa e coerente
- Cite artigos de lei pertinentes com o texto da lei quando relevante
- NÃO invente fatos além dos fornecidos pelo usuário
- NÃO inclua informações que não foram fornecidas
- Produza apenas o texto da peça, sem comentários adicionais ou explicações fora da peça"""

TIPOS_PECA = {
    "peticao": "Petição Inicial",
    "contestacao": "Contestação",
    "recurso": "Recurso",
    "minuta": "Minuta",
}


def gerar_peca(tipo_peca: str, fatos: str, pedidos: str, partes: str) -> str:
    tipo_nome = TIPOS_PECA.get(tipo_peca, tipo_peca.capitalize())
    partes_bloco = f"\nPartes: {partes}" if partes else ""
    pedidos_bloco = f"\nPedidos: {pedidos}" if pedidos else ""

    user_msg = (
        f"Redija uma {tipo_nome} com base nas seguintes informações:\n"
        f"{partes_bloco}"
        f"\nFatos:\n{fatos}"
        f"{pedidos_bloco}"
    )
    return _call_api(SYSTEM_PROMPT_GERACAO, user_msg, max_tokens=8192)


def gerar_e_verificar(
    tipo_peca: str, fatos: str, pedidos: str, partes: str
) -> tuple[str, ResultadoLayer1, ResultadoLayer2, bool]:
    conteudo = gerar_peca(tipo_peca, fatos, pedidos, partes)
    l1, l2 = analisar_completo(conteudo)
    passou = not l1.possui_injection
    return conteudo, l1, l2, passou
