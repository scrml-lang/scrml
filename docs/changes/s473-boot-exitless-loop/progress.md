# s473-boot-exitless-loop — progress (append-only)

Gap: g-bootstrap-exitless-bound-loop-render-hang-s472.

Ruling (S472 "five PA recs", item 5, `scrml-support/user-voice-scrml.md`, verbatim):
"An exit-less bound or Tier-0 loop is a compile error (`const xs = for { lift 1; };`, `${ for { lift 1; } }` with no reachable `break`/`return`); a statement-position `for { }` stays legal. (g-bootstrap-exitless-bound-loop-render-hang-s472; §49.6 gains the sentence)"

## 2026-10-29T03:19Z — tests first
- Branch from origin/main 543791e75.
- §49 names no code for this (E-LOOP-001..007 checked); new code E-LOOP-008.
- `compiler/self-host-v2/slice-m4/exitless-loop-s473.test.js`: 25 tests, 14 red on base (every E-LOOP-008 expectation), 11 green (the legal forms: statement `for { }`, `break` in `if`, `return`, `fail`, `?`, `match` / `!{}` arm `break`, `break outer`, `if (false) { break; }`).
- Probed: a `fn`/`function` declared inside a loop body is a parse error in the bootstrap, and a lambda has an expression body only, so "a `break` inside a `fn` in the body" has no source form yet.

## 2026-10-29T03:55Z — implementation + SPEC
- The pre-commit hook runs the slices on a self-host-v2 change, so the red tests could not be committed alone. They land with the fix in one commit. Red on base: 14 of 25, recorded at 03:19Z.
- analyze.scrml: `boundLoopExitless` (+ `headNeverEnds`, `blockWayOut`, `stmtWayOut`, `exprWayOut`, `howPropagates`), called from `resolveForStmt` and `resolveTier0`. E-LOOP-008.
- My first cut named a helper `blockLeaves`, a name already used at :23888. impl#1 binds every call to the LAST declaration of a name, so the legal-form tests went red. I renamed the helper, then filed g-impl1-bootstrap-duplicate-fn-last-wins-s473, because analyze.scrml already has 6 such pairs.
- SPEC: §49.6 rule 10 (the ruled sentence, verbatim, marked S472), a bullet in §49.4.4, the E-LOOP-008 entry in §49.9, a row in §49.10, and a row in §34. Regenerated severity.scrml and SPEC-INDEX by script.
- Governing sentence: "An exit-less bound or Tier-0 loop is a compile error (`const xs = for { lift 1; };`, `${ for { lift 1; } }` with no reachable `break`/`return`); a statement-position `for { }` stays legal."
- Gaps: closed g-bootstrap-exitless-bound-loop-render-hang-s472. Filed g-spec-bound-loop-inner-forever-hang-s473 and g-impl1-bootstrap-duplicate-fn-last-wins-s473.
- slice-m4: 3091 tests, 0 fail. Gates: types, snippet, claim, corpus-floor, md-shim, conflict-marker, spec-index, delta-lint, s34-census --check-new, compiler/tests/*.test.js and bootstrap-conformance --check all PASS.

## 2026-10-29T05:10Z — review round 1 (S239 FIX-FIRST)
- F1 (MED): `stmtEndsPath` now ends the path at a `match` statement that takes every value and every arm of which is a block that ends the path (`matchEndsPath` / `armsExhaustive`, analyze.scrml). Exhaustiveness is read from the arms: a wildcard arm; or no literal arm (variant and `not` arms, which E-TYPE-020 enforces); or literal arms that include both `true` and `false`. A `!{}` guard never ends the path. The helper is shared, so E-LOOP-007 also sees it: a `lift` after such a match is now E-LOOP-007, a clear fix because the lift can never run.
- F2 (LOW): `headAlwaysTrue` now returns `headNeverEnds`, one definition, so an inner `for (true) { }` / `for (;true;) { }` ends the path. check.scrml `loopNeverEnds` (Core) reads a literal-`true` condition too (`condIsTrueLit`), so the analyze and Core divergence readings agree. Side effect: a function that ends in `for (true) { }` no longer gets E-TYPE-043 (it never falls off its end), the same as `for { }`.
- Measured: the corpus (2,858 files, the reviewer's list) was run at 717e6c2 and again with the fix, comparing every diagnostic code per file. 0 files changed, 0 crashes.
- SPEC: rule 10 no longer says "fails closed". It is now a syntactic guard for the named forever heads, and F4 (`for (true && true)`) is named as not caught. The `if (false)` bullet is now "an implementation is not required to evaluate conditions, so a `break` under any condition counts as reachable". The `fail` / `?` addition is marked as a PA reading in rule 10 and in the §34 row. The ended-path statements are listed. The Tier-0 emit line ref is now :12284.
- Tests: 33 (8 new). The file finishes standalone in about 46 s wall, of which about 40 s is the impl#1 bundle build.

## 2026-10-29T05:45Z — review round 2 (r1 re-review, FIX-FIRST trivial)
- R1-1: `armsExhaustive` now treats "no literal arms" as exhaustive only when at least one VARIANT arm is present. A lone `not :>` arm over `T | not` falls through. Repros c1 (`break` after it) and c8 (`lift` after it) are both now W-MATCH-002 only, as on base, and are pinned as tests.
- Added a comment at `armsExhaustive`: it reads patterns only, so re-check it when arm guards land.
- SPEC: the E-LOOP-007 tightening is named in §49.6 rule 10's reachability bullet and in the E-LOOP-007 §34 row. The Tier-0 emit ref is now :12299.
- Tests: 34 pass. Corpus vs 717e6c2: 0 per-file changes.
