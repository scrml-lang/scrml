# progress — s471-null-in-arm-refused

## Governing text (quoted)

SPEC §42.1 (line ~33408): "**Canonical rule (S89 — strongest form):** The token `null` is NOT a valid scrml expression, attribute value, type token, or identifier. The token `undefined` is NOT a valid scrml expression, attribute value, type token, or identifier. The canonical scrml absence sentinel is `not` ..."

SPEC §42.3.2: "Comparing against `null` or `undefined` SHALL be compile error E-SYNTAX-042."

SPEC §34 E-SYNTAX-042 row: "`null` or `undefined` appears in a scrml value position. scrml's absence sentinel is `not`; `null`/`undefined` are not valid scrml literals. (Catalog addition S78 audit; emitted at `compiler/src/gauntlet-phase3-eq-checks.js`.) | Error"

## Log

- 2026-10-27 start. Base a8bac7248 == origin/main. bun install + pretest OK.
- 2026-10-27 REPRODUCED on main a8bac7248: copied h16/024 (library) and h16/025 (fullstack) into scratch; both compile with no error.
  lib.js:32 `!_scrml_structural_eq(await _scrml_findAsync([p], isOk), null)`;
  full.client.js:111 `!_scrml_structural_eq(await _scrml_findAsync([p], _scrml_fetch_isOk_7), null)`.
  Next: trace where E-SYNTAX-042 walker misses the `!{}` arm body.
- 2026-10-27 LOCUS (hypothesis HELD, and wider): E-SYNTAX-042 lives in `compiler/src/gauntlet-phase3-eq-checks.js`
  (GCP3, stage 3.006). `walkAst` inspects a hand-listed set of statement fields (condExpr/initExpr/exprNode/argsExpr/argExprs/attrs)
  and recurses a hand-listed set of containers. An expression-position `!{}` is `<operand>.__scrml_guard__("!{ … }")` with the arms
  as a STRING literal (expression-parser `extractHandledOperands`), never read. Same walker also skipped: statement-guard
  `guarded-expr` arms (`handlerExpr`, braced text) + `guardedNode`, `const-decl.ifExpr`, `when-effect.bodyExpr`, arrow/function
  block bodies (escape-hatch `bodyRaw`), template literals (`litType:"template"`), param-default text, for-of `iterExpr`, enum match-expr arms.
- 2026-10-27 DONE commit 2: moved `exprGuardArmBodies` / `guardArmBodiesOf` / `unreadableArm` verbatim to `compiler/src/guard-arm-bodies.ts`
  (re-exported from codegen/emit-library-shared.ts) so GCP3 reads arms with the ONE reader without importing the codegen graph.
- 2026-10-27 DONE commit 3: `sweepAbsenceTokens` (E-SYNTAX-042 only) over the whole tree + text-held bodies via existing readers;
  fail closed by `mentionedNames` on unreadable bodies. Unit test `compiler/tests/unit/s471-null-in-arm-refused.test.js` 49/49 (base: 46 fail).
  Next: R26 corpus, probe pack, types:check, full gate.
- 2026-10-27 GATE on commit 3 (3b53e846d): hook full suite 50139 pass / 0 fail / 129 skip. types:check OK (181 diagnostics, unchanged).
  R26 (examples/*.scrml + samples/**/*.scrml, 913 files, CLI per file, base a8bac7248 vs branch): 0 files changed, NEWLY REJECTED: none.
- 2026-10-27 DONE commit 4 (1d98641da): probe family r22 (s25/f28/l20/t20) in security-failable-pack, pinned.
- 2026-10-27 FOUND + FIXED (same root, same file): `!= not` / `== not` (E-EQ-002) in an expression-position arm also escaped and
  lowered to `!_scrml_structural_eq([p].find(isOk), null)` — executed: library `login("wrong")` -> "LOGGED IN". The sweep now keeps
  E-EQ-002 too (ABSENCE_COMPARISON_CODES). Braced-arm `!= not` was already refused end-to-end by the arm reader's own parse.
  r22 +1 shape per side (52 total; base 25 FAIL -> 0). EXPECTED_SHAPE_COUNT 5249 -> 5301.

- 2026-10-27 GATE on commit 5 (23583e753): hook full suite 50195 pass / 0 fail / 129 skip; types:check OK (181, unchanged);
  s34-census runs (no new §34 code — E-SYNTAX-042 / E-EQ-002 are existing codes); R26 re-run: 913 files, 0 changed, none newly rejected.
  Probe packs: security-failable-pack KNOWN_FAIL 0 before / 0 after (all pre-existing shapes green); new r22 25 FAIL on base -> 0;
  security-await-pack KNOWN_FAIL 0, green.
- 2026-10-27 Engine-gap evidence: `| .Go :> { @msg = ([@pw].find(isOk) != null) ? "LOGGED IN" : "rejected"; .Active }` compiles
  to `_scrml_cs_reactive_set("msg", !_scrml_structural_eq([…pw].find(_scrml_isOk_3), null) ? "LOGGED IN" : "rejected")` — the
  same wrong-password shape (emission-level; not run in happy-dom).
- DONE. Blockers: none.

## Audit — where `null` / `undefined` escaped E-SYNTAX-042 on base a8bac7248 (probe script, compile-level)

ESCAPED on base, REFUSED after: expression-position `!{}` arm (cmp / bare / call-arg / braced / variant / nested / argument
position / lambda or template inside the arm), statement-guard arm (unbraced / braced / cmp) and its guarded operand,
`return f() !{…}`, `if` used as a value (arm + condition), arrow block body, `function` expression body, template literal,
enum `match` expression arm, parameter default, for-of iterable, `when` body. (Markup `${}` with a guard: was masked by
E-ERROR-002 / E-CODEGEN-INVALID-LOGIC; now E-SYNTAX-042.)
Already refused on base: plain comparisons, ternary, lambda expression body, while cond, object prop, markup `${}` / `if=`.
STILL ESCAPES after (not fixed here — see gaps): engine bodies (message arm / effect= / <onTransition>), `?{}` SQL `${}` interpolation.

## Gaps for the PA to file (do not edit known-gaps.md here)

- `g-impl1-null-in-expression-position-arm-not-refused-s470` — CLOSED by this lane (expression-position arms; plus statement-guard
  arms, ifExpr, when bodies, arrow/function block bodies, template literals, param defaults, for-of iterables, match-expr arms).
- NEW `g-impl1-null-in-engine-body-not-refused-s471` (HIGH) — locus: engine raw-text bodies are parsed only by
  `engine-body-reader.ts` from `type-system.ts checkEngineRawBodies` (post-GCP3; owners from `_record.engineMeta`), whose `walk`
  keeps only COPY_WALK_KEPT_CODES. Symptom: `| .Go :> { const z = null; .Active }` compiles clean (compile-level probe; not yet
  executed as a wrong-password page). Proposed fix: export a statement-list entry from gauntlet-phase3-eq-checks.js
  (the sweep over `stmts`) and call it from `checkEngineRawBodies.walk`, re-spanned onto `span`. Not done here: type-system.ts
  is the concurrent Windows lane's file.
- NEW `g-null-in-sql-interpolation-not-refused-s471` (MED) — `?{SELECT … WHERE id = ${null}}` compiles; `sqlNode` is opaque to
  every pre-codegen walker (failable-value-calls marks it "opaque" too). Needs the SQL `${}` reader the codegen binds params with.
- NEW `g-gcp3-equality-codes-skip-text-held-bodies-s471` (LOW) — E-EQ-001 / E-EQ-003 / E-EQ-004 / W-EQ-001 still run only in
  walkAst's hand-listed positions, so `===` / cross-type `==` inside a `!{}` arm, `ifExpr`, a `when` body, an arrow block body are
  not diagnosed. Not an absence comparison (no wrong-password shape found); the sweep could keep them too once measured.
- PRE-EXISTING (observed, not this lane): E-SYNTAX-042 fires inside `^{}` meta bodies (walkAst recurses `n.body` of a `meta` node),
  contrary to the §42.1 exclusion list. The new sweep skips meta/foreign; walkAst's behaviour unchanged.
- PRE-EXISTING (observed): server side `isOk is not defined` (PASS-500) when a server login calls a local `!` function whose arm
  names a server function — the defect r21 records; pinned PASS-500 for r22 s25 VALID controls.
- Fail-closed note: an UNREADABLE body (no reader parses it) is refused when `mentionedNames` sees `null`/`undefined`; that token
  reader also reports names inside `//` comments, so an unreadable body whose comment says "null" is refused. Only unreadable bodies.

## SPEC note for the PA (no SPEC edit here)

The §34 E-SYNTAX-042 row cites "§17.6, §45" and "emitted at gauntlet-phase3-eq-checks.js"; the governing sentences are §42.1 and
§42.3.2. Proposed row text: "`null` or `undefined` appears in a scrml source position (§42.1), including a comparison against
either (§42.3.2) — in any expression, a `!{ }` handler arm, a function / arrow body, a template interpolation, or a parameter
default. scrml's absence sentinel is `not`."
