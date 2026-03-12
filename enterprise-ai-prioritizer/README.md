# Enterprise AI Prioritizer

Application module for the **AI Architect Decision Workbench**.

For full portfolio documentation, methodology, and architecture details, see:
- [`../README.md`](../README.md)

## Pages
1. `index.html` - main prioritization workflow
2. `config.html` - model configuration console

## Functional highlights
1. Stage 0 fit filtering (`Does this need AI?`)
2. Tri-state governance gates (`Pass / Conditional / Fail`)
3. Weighted scoring with editable weights
4. Evidence-aware contribution multipliers
5. Tiering output (`A`, `B`, `C`, `NO-GO`)
6. Transparent report generation

## Local run
```bash
cd "/Users/fabio/Documents/ai-architect-decision-workbench/enterprise-ai-prioritizer"
python3 -m http.server 8787 --bind 127.0.0.1
```

Open:
- `http://127.0.0.1:8787`
- `http://127.0.0.1:8787/config.html`

## Tests
From project root:
```bash
cd "/Users/fabio/Documents/ai-architect-decision-workbench"
npm test
```
