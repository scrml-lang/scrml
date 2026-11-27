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
- Corpus differential (bootstrap compileSource, in place): examples 71, benchmarks 7, samples 881, conformance/cases
  2035 (2031 pre-existing + 4 new) — the new diagnostic reaches only the 3 new negative cases; 0 non-test files
  newly rejected or gaining a report; 0 compile crashes.
- SPEC: §7.6 rule (b) "A non-acting initializer that can trap (S483)", §7.6 R3 sentence, S483 provenance block,
  §34 E-FILE-SCOPE-INIT-IN-CONSTRUCT row, §40-area summary sentence. Gap entry filed (docs/known-gaps.md).
- Gates: pre-commit hook PASS (58710 pass / 0 fail / 255 skip); slice-m4 4 shards 9137 pass / 0 fail;
  bootstrap-conformance --json base vs head: CRASH 0, the only verdict / emitted-code diffs are the 3 new cases
  (FAIL → PASS); host-global-scan --check both mode shards exit 0 (no unpinned thrower; new cases do not throw);
  types-gate --check OK; s34-census --check-new PASS; retired-forms-lint ✓; Chromium test 5 pass.

## Fix round r1 (#2129 review, verdict FIX) — branch s483-tci-r1 → pushed to origin s483-trapping-construct-init

- Tip verified e366b44af (unmoved). Merged origin/main (b5f071c46) → 14c96f5a4. Reviewer probe set (104 probes +
  extras) on r0 vs merged: byte-identical outputs. PR #2128 not on main (open) — E-WRITE-INVARIANT-RT construction
  sites noted in the PR body instead.
- HIGH-1 reproduced (m40* exit 0, Chromium blank E-WRITE-INVARIANT-RT). Fix: constructTrapPass runs after
  typeProgram over the typed tables (withTyping). Commit 4f9931d01.
- HIGH-2 reproduced (m46c exit 0, blank, E-HOST-VALUE-MISMATCH-RT). Fix: hostExportTrapFree — an explicit
  TRAP_FREE_HOST_EXPORTS list, each with its reason; randomInt and every unlisted export fail closed.
- MED-1: constructInits also judges the elements the HTML parser reads as text (textHostAt over placeHostAt —
  the same no-place judgment valueLetDiags uses); m05b / m05c / n07 refused.
- LOW-1 (ruling S483-q8-division): `/` never a trap site; `%` by a divisor not proven non-zero stays refused, the
  message names the owed trap gap g-bootstrap-int-overflow-and-mod-zero-untrapped-s469.
- LOW-2: nonZeroConst (o05 / o06), TRAP_FREE_STDLIB_FNS minOf / maxOf (o16), a literal call passing its refined
  parameters' static zone (o09; a self-reaching callee stays fail-closed). o01 / o02 left fail-closed (gap).
