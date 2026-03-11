# Enterprise AI Prioritizer (MVP)

Local tool to support decision-making and prioritization of enterprise AI projects.

## What it delivers
- Mandatory gates (regulatory, security, data, economics).
- Weighted scoring (0-100) across value, readiness, and risk criteria.
- Classification into `Tier A`, `Tier B`, `Tier C`, and `NO-GO`.
- Copy-ready report for architecture/governance review boards.

## How to run
In the terminal:

```bash
cd "/Users/fabio/Documents/ai-architect-decision-workbench/enterprise-ai-prioritizer"
python3 -m http.server 8787
```

Open in the browser:
- `http://localhost:8787`

## Best-practice baseline (Mar/2026)
- EU AI Act timeline (European Commission)
- NIST AI RMF + Generative AI Profile
- OWASP LLM Top 10 v1.1
- ISO/IEC 42001
- FinOps for AI

## Notes
- This version is a local MVP (frontend only).
- Suggested next iteration: database persistence + portfolio dashboard + ADR PDF export.
