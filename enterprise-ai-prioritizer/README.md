# Enterprise AI Prioritizer

Application module for the **AI Architect Decision Workbench**.

This is the main working product surface in the repository: teams submit initiatives, assess them consistently, register decisions, and track rationale over time in SQLite.

For broader repository context, see [../README.md](../README.md).

![Workbench overview](./docs/screenshots/workbench-overview.png)

## What It Does
The workbench supports a practical decision flow:
1. `Submit`: capture the initiative, owner, and business context.
2. `Assess`: evaluate value, feasibility, readiness, and confidence.
3. `Decide`: choose whether to move now, plan next, request more clarity, or stop.
4. `Track`: keep rationale, status, and history visible over time.

The core decision drivers are:
1. `Business value`
2. `Feasibility`
3. `Readiness`
4. `Evidence-aware confidence`

The main outcomes are:
1. `Move now`
2. `Plan next`
3. `Needs clarity`
4. `Stop`

## Product Surfaces
Core pages:
1. `index.html`: decision dashboard with recommended-now items, decision queue, clarity blockers, and recent decisions.
2. `submit.html`: lightweight intake form for new initiatives.
3. `triage.html`: operational queue for filtering and routing work.
4. `assessment.html`: assessment workspace with `Fast Pass`, `Delivery Checks`, advanced `Score Drivers`, and an executive recommendation.
5. `board.html`: decision review queue and rationale capture.
6. `config.html`: advanced settings for weights, thresholds, evidence multipliers, and policy defaults.
7. `how-it-works.html`: narrative explanation of the flow and scoring logic.

Backend and supporting logic:
1. `server.py`: HTTP API, static serving, and SQLite persistence in `data/initiatives.db`.
2. `decision-engine.js`: deterministic recommendation logic for fit, gates, score, confidence, and lane mapping.
3. `initiative-store.js`: frontend API client and payload normalization helpers.
4. `dashboard.js`, `triage.js`, `app.js`, `board.js`, `config.js`: page controllers.

## Quick Start
Run locally:
```bash
cd enterprise-ai-prioritizer
python3 server.py --host 127.0.0.1 --port 8787
```

Open:
1. `http://127.0.0.1:8787/index.html`
2. `http://127.0.0.1:8787/submit.html`
3. `http://127.0.0.1:8787/triage.html`
4. `http://127.0.0.1:8787/assessment.html`
5. `http://127.0.0.1:8787/board.html`
6. `http://127.0.0.1:8787/config.html`
7. `http://127.0.0.1:8787/how-it-works.html`

Test from repository root:
```bash
npm test
npm run test:e2e
```

Current E2E coverage:
1. initiative submission
2. triage status movement
3. assessment save
4. board decision
5. API and SQLite persistence checks

## Product Screenshots
<details>
<summary>Open UI screenshots</summary>

### Decision dashboard
![Decision dashboard](./docs/screenshots/decision-dashboard.png)

### Assessment workspace
![Assessment workspace](./docs/screenshots/assessment-workspace.png)

### Decision review
![Decision review](./docs/screenshots/decision-review.png)

### How it works
![How it works](./docs/screenshots/how-it-works.png)

</details>

## Workflow And Persistence
Workflow states are enforced in the backend:
`draft -> submitted -> triage -> assessment -> board_review -> approved/approved_with_conditions -> in_delivery -> closed`

Alternative branches:
1. `hold`
2. `rejected`

Operational safeguards already implemented:
1. payload validation and text normalization on intake
2. explicit status transition guards
3. audit events for creation, status changes, assessment saves, and board decisions
4. immutable identity fields for persisted initiatives
5. safer rendering of user content through DOM APIs instead of raw HTML interpolation

## Regenerating README Screenshots
From repository root:
```bash
node enterprise-ai-prioritizer/scripts/capture-readme-screenshots.mjs
```

The script boots the local Python server on port `8791`, captures the current UI, and writes PNGs to `enterprise-ai-prioritizer/docs/screenshots/`.

## Current Limitations
1. SQLite is intended for local and single-instance usage, not multi-node production.
2. SSO and RBAC are not implemented yet.
3. Attachments are still represented as references or notes, not managed binary uploads.
