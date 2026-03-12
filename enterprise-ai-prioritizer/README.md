# Enterprise AI Prioritizer

Application module for the **AI Architect Decision Workbench**.

For portfolio-level context and methodology details, see [../README.md](../README.md).

## Scope
This module provides an enterprise-style decision workflow:
1. Intake idea submission.
2. Triage filtering and routing.
3. Stage 0 + gates + weighted assessment.
4. Board decision registration.
5. Audit-ready persistence in SQLite.

## Architecture
Core files:
1. `decision-engine.js`: deterministic prioritization logic (Stage 0, gates, scoring, lane mapping).
2. `initiative-store.js`: frontend API client + payload normalization/validation helpers.
3. `settings.js`: model configuration persistence.
4. `server.py`: HTTP API + SQLite database (`data/initiatives.db`) + static serving.
5. `dashboard.js`, `submit.js`, `triage.js`, `app.js`, `board.js`, `config.js`: UI controllers for each page.

UI pages:
1. `index.html`: home dashboard (portfolio command center).
2. `submit.html`: intake form.
3. `triage.html`: queue and filters.
4. `assessment.html`: initiative assessment.
5. `board.html`: board decisions.
6. `config.html`: policy and weights configuration.
7. `how-it-works.html`: product overview and visual workflow.

## Engineering Best Practices Implemented
1. **Input quality controls**
- required intake fields are validated before persistence
- email format is validated
- user text is normalized and length-limited by field

2. **Workflow integrity**
- explicit state machine (`STATUS_TRANSITIONS`)
- invalid status jumps are blocked (e.g., `submitted -> approved`)
- board decisions only apply when status transition is valid

3. **Auditability**
- immutable initiative identity (`id`, `createdAt`) during updates
- audit entries on creation, status changes, assessment saves, board decisions
- bounded audit retention to prevent unbounded growth

4. **Safer rendering**
- queue and board pages render user data via DOM APIs (`textContent`)
- avoids interpolating user input into raw `innerHTML`

5. **Deterministic testing**
- unit tests cover decision logic and API client/validation behaviors
- status transition guards and payload validation are tested

## Workflow Statuses
`draft -> submitted -> triage -> assessment -> board_review -> approved/approved_with_conditions -> in_delivery -> closed`

Alternative branches:
- `hold`
- `rejected`

## Local Run
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

## Tests
From repository root:
```bash
npm test
```

## Current Limitations
1. Local SQLite is designed for single-instance/dev usage, not multi-node production.
2. No corporate SSO/RBAC enforcement yet (placeholder actor values are used).
3. No binary file upload storage yet (attachments are references/notes text).
