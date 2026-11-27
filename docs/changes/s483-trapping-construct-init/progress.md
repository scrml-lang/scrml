# s483-trapping-construct-init — progress

Lane: build, bootstrap-only (`compiler/self-host-v2/`; impl#1 frozen). Ruling:
ruling:user-voice-scrml.md-S482-trapping-construct-init — owner: "yes, interim refusal now and the feature later".
Gap: g-boot-trapping-construct-init-s482 (INTERIM; PERMANENT = branch-scoped declarations, its own design item).

## Log

- Branch `s483-trapping-construct-init` from origin/main 8ee6a42ec.
- Locus verified: `compiler/self-host-v2/analyze.scrml` constructInitDiags / constructAt (the acting-initializer
  check, banner "One that does not act (a literal, arithmetic over bindings)"), ~12717–12770 at base. HELD.
- Built `constructInits` (shared enumeration) + `constructTrapDiags` (trap sites closed over the effect summary's
  references with `closeDim`), wired in `fileScopePass` after `valueLetDiags`. Commit 4e57a8aff (+ slice-m4 tests, 27).
- Base demonstration (origin/main analyze.scrml on disk, bootstrap CLI, Chromium): `items[0]` read in `if=` / `<match>`
  arm / slot content → page blank, `pageerror E-INDEX-OUT-OF-RANGE-RT`; `floor(NaN)` → blank, E-INT-CONVERSION-RT;
  `firstOf(items)` → blank. Division by a `number` binding / modulo by an int binding: no trap on the bootstrap today.
  An index read whose binding nothing reads did not blank (the printer leaves it out) — refused now regardless.
- Chromium test `compiler/tests/browser/trapping-construct-init-chromium-s483.browser.test.js` (5). Commit b8d994d13.
- Conformance: body-top/{trapping-init-in-if-content-neg, trapping-init-in-match-arm-neg, trapping-init-in-slot-neg,
  nontrapping-init-in-if-content}; impl#1 XFAIL signatures recorded under carried gap g-impl1-init-in-construct-s482.
- Corpus differential: examples+benchmarks 78 files, 0 with the new diagnostic; samples / conformance — below.
