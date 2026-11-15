# EARTH — acceptance ledger

**Rules.** A row is `PASS` only when (1) every listed test passes on **both** projects (desktop and mobile) in a recorded run, and (2) the evidence files exist in the repository at the commit shown. Everything else is `FAIL`, `BLOCKED` (state the reason and the unblock action) or `NOT STARTED`. Rows marked *human* additionally need a named reviewer's sign-off in the last column. "Skipped" is not "passed". The agent updates this file in the same commit as the work; a milestone report may only cite rows from here.

| Row | Requirement (owner's acceptance table) | Milestone | Tests | Status | Evidence | Commit | Sign-off |
|---|---|---|---|---|---|---|---|
| R0 | Gate 0 environment verified | M0 | `node scripts/preflight.mjs` | NOT STARTED | `docs/evidence/M0/preflight.json` | | |
| R0b | Test harness trustworthy | M0 | H-01 … H-05 | NOT STARTED | `docs/evidence/M0/` | | |
| R0c | GIBS catalog snapshot (layers, formats, matrix sets, date coverage) | M0 | `node scripts/gibs-catalog.mjs` | NOT STARTED | `docs/evidence/M0/gibs-catalog.json` | | |
| R1 | Three.js: actual running cinematic Earth scene | M1 | AC-01, AC-03 | NOT STARTED | | | |
| R2 | GLSL: actual custom atmospheric and planetary shaders | M1 | AC-02 | NOT STARTED | | | |
| R2b | Non-WebGL fallback keeps content and data readable | M1 | AC-04 | NOT STARTED | | | |
| R3 | CesiumJS: actual interactive geographic globe | M2 | AC-05, AC-06 | NOT STARTED | | | |
| R4 | NASA imagery: at least one real satellite layer displayed | M2, M4 | AC-05, AC-09 | NOT STARTED | | | |
| R5 | GSAP: actual implemented animation timelines | M5 | AC-11 | NOT STARTED | | | |
| R6 | ScrollTrigger: at least three working scroll-controlled scenes | M5 | AC-11 | NOT STARTED | | | |
| R7 | Visual identity: entire interface redesigned | M1–M6 | *human review of screenshot pack* | NOT STARTED | `docs/evidence/M*/` | | *human* |
| R8 | Time experience changes meaningful dated visual data | M4 | AC-09 | NOT STARTED | | | |
| R9 | Environmental layers: real data with source attribution | M3 | AC-07 (×6), AC-08 | NOT STARTED | | | |
| R10 | Future scenarios: scientifically grounded and labelled | M4 | AC-10 (×3) | NOT STARTED | | | |
| R11 | Sharing: working deep links and social metadata | M5 | AC-12, AC-13 | NOT STARTED | | | |
| R12 | Responsive, fast, accessible on desktop and mobile | M6 | AC-14, AC-15, AC-16 | NOT STARTED | | | |
| R13 | Real-GPU frame rate and look verified on the preview URL | M6 | *human, `?perf=1` overlay* | NOT STARTED | `docs/reports/M6-realgpu.md` | | *human* |

## Change log
| Date (UTC) | Row | From → To | Why | Commit |
|---|---|---|---|---|
