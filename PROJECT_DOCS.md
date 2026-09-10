# VelaDesk development record

## Product quality correction — refinement in progress
User rejected premature completion, unprofessional UI and disconnected/incomplete workflows. Previous passing tests are functional evidence, not product-quality acceptance. Active plan: `.hermes/plans/workspace-refinement.md`.

Acceptance now requires an integrated selected trade → exact-run chart → faithful historical replay flow, preserved chart viewport, readable responsive controls and visual/interaction QA. Current work is INCOMPLETE until these gates run. Historical SL/TP levels absent from Trade records must not be fabricated. Engine/strategy semantics remain unchanged.

## Refinement final QA — blocked, not accepted
Fresh production build/typecheck pass. Explicit TypeScript suite: 108 pass; historical handoff tests: 2 pass. Production shell interaction QA passes 1440/768/390/320 widths with no page errors. Broadened npm script discovery exposes 10 failing platform tests (189/199 pass), previously hidden by the ineffective recursive glob.

Actual browser blockers: default full-sample lacks run snapshot and disables chart/replay; date-ranged trade's explicit refocus fails after real drag (same numeric focus deduplicated). Parent workers own fixes; no completion claim. Full evidence and reproduction commands: `.hermes/artifacts/workspace-refinement/FINAL_QA.md`. Reusable fail-closed integration harness: `scripts/refinement-final-qa.mjs`, fresh preview 8083. Downstream integrated handoff/zoom gates remain unverified until these blockers clear.

## Playbook Lab — implemented
Native default Desk tab with editable hypothesis, three starter templates, existing strategy selection, explicit train/holdout experiment, immutable configuration and provenance snapshots, local notebook up to 20 runs, historical inspection/comparison and actual JSON downloads. Existing strategy formulas and execution engine untouched by this release.

### Verified
- npm run typecheck: exit 0.
- npm test: integration 1 pass; quant/auth/terminal suite 89 pass, 0 fail. Existing scripts glob reports zero on this Windows shell, so new integration test is also explicitly invoked.
- npm run build: exit 0; warning for chunk >500KB remains.
- Browser interactions passed against dev and production: execute two strategies, preserve first snapshot, compare, export actual JSON, reload persisted draft/results, mobile 390px no overflow, no uncaught page errors.
- Dev and built smoke: desktop/mobile HTTP200, consoleErrors/pageErrors empty, no horizontal overflow, brand/auth warnings empty, built divergesFromBaseline=false.
- Rollback restored integration bytes with identical SHA256 on separate target; regression returns baseline failure as expected. Active project remains modified.

### Failed attempts retained
- Baseline integration test failed before implementation (expected TDD).
- Interim npm test caught worker fingerprint test during RED; final run green.
- Initial dev SSR cached missing newly-created panel; dev restart resolved it.
- Initial browser exact textarea label selector failed; partial semantic label resolved it.
- preview:restart assumes Linux /proc and fails on Windows; npm run preview -- --host 127.0.0.1 --port 8081 passed instead.
- Rollback initially received MSYS path unreadable by native Python; conditional cygpath conversion fixed and retest passed.

### Interpretation / boundaries
This is a research workflow implementation, not evidence of a profitable strategy. QA used explicitly labeled synthetic candles. Train and holdout use independent capital initialization and existing engine fills. Legacy MTM final-point, trade-fee/funding accounting and PF sentinel semantics are disclosed in the panel instead of silently changed. Repeated holdout inspection is exploratory, not independent validation. No external model call or live orders are performed.

### Artifacts
`.hermes/artifacts/playbook-lab/` contains MODIFIED_FILE.zip, DIFF_FILE.patch, VERIFICATION.txt, executable ROLLBACK.sh, pristine.zip and demo guide. `screenshots/playbook-qa.json` and `playbook-built-smoke.json` contain browser verdicts. `scripts/playbook-browser-qa.mjs` reproduces the interaction flow.
