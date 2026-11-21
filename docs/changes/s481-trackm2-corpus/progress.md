# s481-trackm2-corpus — progress

Track M step 2 (user-voice-scrml.md S480 "bootstrap census build order" item 1; PA decisions on #2025 owner Q1/Q2).
Scratch + drivers: `~/.cache/scrml/review/s481-trackm2-corpus/` (`drv/snap-run.ts` + `snap-one.ts`, `artcmp.ts`,
`recon-one.ts`, `casecmp.ts`, `run-fix.sh`).

- [x] Item 1 — corpus migration (commit c847b2380): `scrml fix --rules=stmt-semi,arm-comma,program-wrap,program-move,unwrap-logic`
  over the 701 positive programs of #2025's measurement. 654 files changed, 30 refused (impl#1 does not compile them as written).
  - impl#1: 670 clean / 30 error / 1 crash before and after; 0 status or code changes.
  - Artifacts: identical (build identity + per-file anchor hash folded, JS as acorn tree) in every program where only
    stmt-semi / arm-comma applied; 414 changes, all in programs where program-wrap / program-move / unwrap-logic applied,
    all whitespace-only HTML once anchor ids that encode a source line are renumbered.
  - Bootstrap-clean: 15 → 169 of 701 (0 lost); core 14 → 14 of 52.
  - Reconcile vs #2025's 162: in memory on today's main, IMPL1_SAFE_RULES (11 rules) = 170 = the 5 rules; CLI 169 (classifyEntry
    leaves 3 export files unwrapped; 2 importers gain).
- [x] Item 2 — conformance case sources: 3 by `scrml fix` (commit 2), 6 + the ctrl-011-for-in-pos twin by hand (commit 3).
  7 FAIL→PASS; 3 stay FAIL by decision / out of terminator scope (see PR body).
- [x] Item 3 — pretest, bootstrap-conformance (PASS 760 → 767, FAIL 10 → 3, CRASH 0, 0 PASS→FAIL), and the CI checks
  job (s34-census, types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim) all pass on 4d2e660d7.
- [x] Gap filed: g-when-from-body-semi-spurious-dropped-warning-s481 (the only new impl#1 console warning across the
  701 migrated programs; `examples/13-worker.scrml`).
