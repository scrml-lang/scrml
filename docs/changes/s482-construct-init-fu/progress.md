# s482-construct-init-fu — progress

Lane: finish item E of #2076 (construct initializers that read body-written state). #2076 review: ~/.cache/scrml/review/s482-2076/review.md.

## Items
1. MED-1 — DONE.
   - (a) lower.scrml `lowerPlaced` / `placeBefore` (and the chain paths in `lowerMarked` / `placedNodes`): a non-acting initializer in an `if=` / `else-if=` / `else` element, a component use or a `<match>` is placed just BEFORE the construct. It used to be placed after the construct, so the construct's content read it before its place, the printer ran it at module initialization, and every binding it read was pulled early too (m = 1, k = 1). Now m = 5 and k = 5 (happy-dom and Chromium).
   - (b) analyze.scrml: the refusal is narrowed. Only writes inside the construct before the initializer count (`constructStart` / `constructWrites`): its attributes, an earlier chain member's test, its content, and component code used there. Cell reads follow the formula, or the seed when it would run at the read (`initReadWritten`). A read through a const needs no following, because the const's value is fixed at its place before the construct. SPEC §7.6 and the §34 row are amended (pa-ruled).
2. LOW-1 — DONE. A write after the construct is no longer refused, and neither is one before it.
3. LOW-2 — DONE. The marker prov now leads with `pa-ruled:` and the status line names this lane.
4. INFO-1 — DONE. runtime.js `textContent`: a later non-trap throw is now passed to `reportLater`.

## State
- Commit 1 (all four items and their tests) is rebased onto origin/main fc6cf01d2, which contains #2076.
- Final gates on head:
  - pretest: exit 0.
  - bootstrap-conformance, base and head: PASS 845 / FAIL 4 / CRASH 0 on both, with 0 per-case bucket or emitted-code diffs.
  - Corpus plus byte-compare over 2972 files (examples/, samples/, benchmarks/, conformance/cases/): 0 newly rejected, 0 newly accepted, 0 code changes, 0 output diffs.
  - s34-census --check-new: PASS. types-gate: OK (182, unchanged). snippet-gate and claim-gate: 0 failed. corpus-compile-floor: PASS. gen-md-shim and severity: current.
  - e2e-render-map: 259/0.
  - ci-slices legs 1–6 of 6: 0 fail.
  - Chromium: construct-init-place 5/5 and rcdata 5/5.
- Red on base: in construct-init-read-s482.test.js, 9 of 13 tests fail on base. The 4 that pass are 2 refusals base also made, plus 2 unchanged legal shapes. The Chromium file fails 5 of 5 on base. The INFO-1 runtime probe on base drops the second throw.
