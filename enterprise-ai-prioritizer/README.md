# Enterprise AI Prioritizer (MVP)

Ferramenta local para apoiar decisao e priorizacao de projetos de IA em ambiente enterprise.

## O que entrega
- Gates obrigatorios (regulatorio, seguranca, dados, economics).
- Scoring ponderado (0-100) com criterios de valor, prontidao e risco.
- Classificacao em `Tier A`, `Tier B`, `Tier C` e `NO-GO`.
- Relatorio copiavel para uso em comite de arquitetura/governanca.

## Como rodar
No terminal:

```bash
cd "/Users/fabio/Documents/openclaw-mvp/enterprise-ai-prioritizer"
python3 -m http.server 8787
```

Abra no navegador:
- `http://localhost:8787`

## Baseline de boas praticas (mar/2026)
- EU AI Act timeline (Comissao Europeia)
- NIST AI RMF + Generative AI Profile
- OWASP LLM Top 10 v1.1
- ISO/IEC 42001
- FinOps for AI

## Observacoes
- Esta versao e um MVP local (frontend puro).
- Proxima iteracao sugerida: persistencia em banco + dashboard de portfolio + export ADR em PDF.
