# Changelog

## 0.3.4 - 2026-03-13
- Added editable Stage 0 route policies to the Admin UI, including threshold delta, max tier, and minimum gate states.
- Added editable region policies to the Admin UI for `EU`, `US`, `EU + US`, and `Global`.
- Aligned assessment output with blocked-vs-diagnostic score semantics and route/region-aware policy messaging.
- Updated `how-it-works.html`, root README, module README, and Admin copy to match the live decision engine.
- Expanded decision-engine tests to cover policy override merging and the latest route/region scoring behavior.

## 0.3.3 - 2026-03-12
- Applied a cleaner, modernized UI pass with a Linear-inspired visual direction.
- Simplified top navigation labels across pages (`Assessment`, `Admin`, `Method`).
- Removed redundant assessment hero actions to reduce visual noise.
- Kept the home dashboard focused as a portfolio command center.
- Refreshed documentation to match the current navigation, pages, and run instructions.

## 0.3.2 - 2026-03-12
- Added SQLite persistence (`data/initiatives.db`) with a Python API server (`server.py`).
- Migrated initiative data flow from browser local storage to backend REST endpoints.
- Redesigned `index.html` as a cleaner home dashboard and moved scoring flow to `assessment.html`.
- Added initiative payload normalization and required-field/email validation.
- Added workflow transition guardrails via an explicit status state machine.
- Hardened queue/board rendering to avoid raw HTML interpolation for user input.
- Improved board UX with explicit status feedback for invalid decision transitions.
- Expanded unit tests for initiative-store validation and workflow behavior.
- Refreshed root/module README with engineering controls and limitations.

## 0.3.1 - 2026-03-12
- Renamed remaining Portuguese-named files to English equivalents.
- Updated documentation and script references to the new English file names.
- Confirmed repository-wide English-only content for portfolio consistency.

## 0.3.0 - 2026-03-12
- Added Stage 0 fit assessment (`Does this need AI?`) before gate/scoring steps.
- Replaced binary gates with tri-state governance gates (`Pass`, `Conditional`, `Fail`).
- Added conditional gate penalties and policy-based tier caps.
- Expanded scoring model with strategic alignment and operating model readiness.
- Added evidence-level scoring multipliers and confidence index output.
- Added dedicated configuration interface (`config.html`) for model tuning.
- Implemented local persisted settings (`settings.js`) for weights and thresholds.
- Upgraded reports with explicit methodology, penalties, and decision transparency.
- Updated unit tests for new selection logic and configuration-aware behavior.
- Reworked root/project README for portfolio-grade documentation.

## 0.2.0 - 2026-03-11
- Full project language standardization to English.
- Enterprise-grade UI redesign for `enterprise-ai-prioritizer` with stronger visual hierarchy.
- Enhanced executive decision panel with live score, lane, gate status, and progress bar.
- English documentation updates across planning and usage files.
- English terminal UX for the local file viewer script.

## 0.1.0 - 2026-03-11
- Initial project version.
- Strategic decision-tool blueprint for AI Architect work.
- Daily operational planning document.
- Local file viewing script.
- Web MVP `enterprise-ai-prioritizer` with:
  - mandatory gates;
  - weighted scoring;
  - priority classification (Tier A/B/C and NO-GO);
  - copy-ready report output.
