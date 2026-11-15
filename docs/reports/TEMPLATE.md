# Milestone report — M? · <title>

- Date (UTC): 
- Commit: `<sha>` (branch `<name>`)
- Preview URL (real-GPU human review): 
- Environment: `docs/evidence/M0/preflight.json` hash `<sha256>` · software GL: yes/no
- Verdict: **GREEN** / **RED** / **BLOCKED** — GREEN only if `npm run accept:M?` exits 0 on desktop and mobile and every ledger row for this milestone is PASS.

## 0. Acceptance run
Paste the last lines of `npm run accept:M?` and link `docs/evidence/playwright-report/` and `docs/evidence/results.json`. Counts: passed / failed / skipped (list every skip and why; an unexplained skip makes the report RED).

## 1. Files created and modified
Output of `git diff --stat <previous-milestone-tag>..HEAD`, then one line per new module saying what it is for.

## 2. Dependencies actually installed
Generated from `package-lock.json` (name, exact version, direct or transitive, bytes in the production bundle). A dependency with no import in `src/` is a defect: remove it or justify it here.

## 3. Where CesiumJS is used
File and function names, the camera/stage/layer features it provides, and the test IDs that exercise them. "Not yet used" is an acceptable answer.

## 4. Where Three.js and GLSL are used
File names for each shader program and its purpose (atmosphere, surface day/night, clouds, data decode …), the uniforms that are driven by real data or sun position, and the test IDs.

## 5. Where GSAP and ScrollTrigger are used
Each timeline and each ScrollTrigger instance: trigger element, pinned or not, scrubbed or not, what property of the rig/layers it drives, and the test IDs.

## 6. Real datasets integrated
For each dataset: id, source URL, version/edition, retrieval time, temporal coverage, resolution, licence, attribution string, and the layer/chapter that shows it. Copy from `public/data/manifest.json`; do not retype.

## 7. Interactions that passed browser testing
Table: interaction → test ID → project (desktop/mobile) → evidence file. Only tests that ran green appear here.

## 8. Incomplete, degraded or deferred
Everything that is not finished, stated plainly: what, why, what unblocks it, which ledger row it affects. Include measured numbers that missed their budget.

## 9. Deviations from the brief
Anything done differently from `docs/KICKOFF.md`, with the reason and the owner decision that approved it (or "pending").

## 10. Evidence index
List of screenshots (desktop + mobile), JSON measurements, traces, and the GIBS request ledger, each with a one-line caption.
