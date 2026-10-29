# s473-lift-cell-ref-scope — progress (append-only)

## 2026-10-29T13:53Z — triage + tests first

Report: flogence S60 delta [594] — "`lift @x` / `lift (@x)` fail E-SCOPE-001 (parser gap, to file)".
flogence workaround (src/app.scrml:1993, :2009): `@nodeStats = loadNodeStats() !{ | _ e :> { const prev = @nodeStats; lift prev } }`;
the wanted shape is `!{ | _ e :> { lift @nodeStats } }`.

Governing SPEC (§18.5, S469): "A block arm in a VALUE position — a `match` or `!{}` whose result is used
(§18.9, §19.4.3) — yields its value with **`lift <expr>;`**" and "A brace holding exactly ONE expression
(`.A :> { e }`, or `{ e; }`) is that expression". The operand is any expression; `@x` is legal.

Measured (impl#1 = compileScrml, bootstrap = slice-m4 frontEnd):
- impl#1, value-position `!{}` arm `{ lift @x }`, `{ lift (@x) }`, `{ lift @x; }`, `{ lift @s.n }`, `{ lift @x + 1 }`:
  E-SCOPE-001 "Undeclared identifier `lift`". Also `{ lift 9 }`, `{ lift -1 }`, `{ lift name }` — every operand
  acorn can read after an identifier prefix. `{ lift [] }` and a statement-led block only escaped by failing to parse.
- Root cause: ast-builder.js `_parseHandlerExpr` reads the braced body text `lift @x` as a JS expression; acorn takes
  `lift` as an identifier and drops the tail (`_s441Trailing`); type-system.ts's `guarded-expr` arm scope check walks
  that `handlerExpr` and reports `lift`.
- bootstrap: every shape clean, in `!{}` and match arms, and the plain lift (only `{ lift @x }` with no `;` trips the
  ruled bootstrap semicolon rule, E-STMT-MISSING-SEMICOLON — not this lane).
- impl#1, SEPARATE: `@x = match f() { …, .B :> { lift … } }` (a match as a cell-write RHS) leaves `lift` unlowered —
  E-CODEGEN-INVALID-LOGIC, or with `lift (e)` a silent `lift(e)` runtime call. Independent of `@x` (fails with
  `lift 0`). `let r = match …` is fine. To file as a gap.

Tests:
- compiler/tests/unit/lift-operand-in-handler-arm-s473.test.js — (first cut) 35 tests; 33 red on base. Final count below.
- compiler/self-host-v2/slice-m4/lift-cell-arm-s473.test.js — 13 tests, green on base (pins the bootstrap).

## 2026-10-29T15:40Z — fixes

1. ast-builder.js `_parseHandlerExpr`: a braced arm body that IS one `lift <expr>` statement reads as its operand
   (§18.5 "a brace holding exactly ONE expression … is that expression"); the scope check now reads the operand
   (and the §18.6.1 whole-error-binder check applies to it).
2. Executing the flogence shape exposed a second impl#1 defect: `@cell = f() !{…}` (f synchronous) wrote the error
   envelope into the cell BEFORE the arms, so `{ lift @cell }` / flogence's `{ const prev = @cell; lift prev }` read
   the envelope back (page showed `[object Object]`). Async callees were already correct (s441 post-pass).
   First attempt in emit-logic (route through S455 cellWriteNode) broke 13 s441/S446/ss41 tests: emit-logic cannot
   tell server from sync callees in module-init / handler-attr contexts. Reverted. Final fix: emit-client
   `deferSyncGuardedCellWrites`, the sync twin of the s441 rewrite, run right after it.
3. flogence copy (TMPDIR): app.scrml, `lift @nodeStats`, `lift (@nodeStats)`, and all 20 `lift []` cell arms
   rewritten to `lift @cell` — all compile clean; nodeStats emits `await stub; if err {…} else {set}`.

Tests: unit file 40 tests, 37 red on base (3 green neighbours). Bootstrap file 13, green on base (bootstrap had no bug).
Gaps: filed+resolved g-impl1-handler-arm-lift-operand-read-as-ident-s473, g-impl1-cell-handler-eager-write-envelope-visible-to-arms-s473;
filed open g-impl1-match-into-cell-block-arm-lift-unlowered-s473.

## 2026-10-29 — fix round 1 (S239 review of #1645, verdict LAND-W-F/U)

Merged origin/main (#1630 landed; clean merge). Finding → fix:
- MED-1 (nested guarded write left eager): `deferSyncGuardedCellWrites` no longer copies an arm block past;
  it collects non-overlapping edits over the whole text, so a site inside another site's arm is rewritten.
  Executed test: `#y` keeps 4.
- MED-2 (literal-blind scan): the scan reads `blankLiteralTextInSource(code, { blankRegex: true })` — the
  parser's acorn tokenizer, the existing literal blanker (no new reader) — and confirms the arms' write-back
  on the original text (the mask blanks the cell-name string). Fail closed (no rewrite) if the mask is not
  same-length or the tokenizer threw. Tests: template-literal `t.length` unchanged (executed); the
  double-quoted twin compiles.
- LOW-3 (regex with a quote): covered by the same mask (regex bodies blanked). Executed test.
- LOW-4 (`{ lift @x⏎ + 1 }`): `_liftLineContinues` — a depth-0 line break continues the operand when the line
  before ends in a binary operator or the next starts with one (`++`/`--` excluded). Executed → 8, so the arm
  emitter reads it the same way. `lift 1⏎ lift 2` is still two statements (test).
- INFO-5: tests pin route inference: `{ lift "x" }`, `{ lift p }` admitted; `{ lift fallback }`, `{ lift @s }`,
  `{ lift mark() }` E-RI-002.
- NITs: the new JSDoc moved above the gateChunksByEmittedReference JSDoc (no orphan); "above it" wording fixed;
  the dead `handler.indexOf(liftOperand)` offset dropped.
- Gaps filed (pre-existing): g-impl1-braced-arm-scope-check-first-statement-only-s473 (HIGH),
  g-impl1-member-target-handler-block-arm-unlowered-s473 (MED, related= the match-into-cell gap).

Unit file: 48 tests.
