# Enterprise AI Prioritizer

Application module for the **AI Architect Decision Workbench**.

For portfolio-level context and methodology details, see [../README.md](../README.md).

## Scope
This module provides an enterprise-style decision workflow:
1. Intake idea submission.
2. Triage filtering and routing.
3. Stage 0 + gates + weighted assessment.
4. Board decision registration.
5. Audit-ready persistence in local storage.

## Architecture
Core files:
1. `decision-engine.js`: deterministic prioritization logic (Stage 0, gates, scoring, lane mapping).
2. `initiative-store.js`: persistence, payload normalization/validation, state transitions, audit trail.
3. `settings.js`: model configuration persistence.
4. `submit.js`, `triage.js`, `app.js`, `board.js`, `config.js`: UI controllers for each page.

UI pages:
1. `submit.html`: intake form.
2. `triage.html`: queue and filters.
3. `index.html`: initiative assessment.
4. `board.html`: board decisions.
5. `config.html`: policy and weights configuration.

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
- unit tests cover decision logic and initiative-store lifecycle behavior
- status transition guards and payload validation are tested

## Workflow Statuses
`draft -> submitted -> triage -> assessment -> board_review -> approved/approved_with_conditions -> in_delivery -> closed`

Alternative branches:
- `hold`
- `rejected`

## Local Run
```bash
cd "/Users/fabio/Documents/ai-architect-decision-workbench/enterprise-ai-prioritizer"
python3 -m http.server 8787 --bind 127.0.0.1
```

Open:
1. `http://127.0.0.1:8787/submit.html`
2. `http://127.0.0.1:8787/triage.html`
3. `http://127.0.0.1:8787/index.html`
4. `http://127.0.0.1:8787/board.html`
5. `http://127.0.0.1:8787/config.html`

## Tests
From repository root:
```bash
cd "/Users/fabio/Documents/ai-architect-decision-workbench"
npm test
```

## Current Limitations
1. Persistence is browser local storage only (single-user/dev scope).
2. No backend API, corporate auth, or RBAC enforcement yet.
3. No binary file upload storage yet (attachments are references/notes text).
