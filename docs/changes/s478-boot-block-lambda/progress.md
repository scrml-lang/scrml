# s478-boot-block-lambda — block-bodied lambdas and function expressions (bootstrap)

Branch `s478-boot-block-lambda` from `origin/main` 727e74f77. PERMANENT fix for the two INTERIM refusals
filed by #1897: `g-boot-function-expression-s478` (the D28 `function expression` row) and the braced arrow
body (`parseLambda`'s E-BOOTSTRAP-UNSUPPORTED "an arrow function with a braced body").

## Governing SPEC sentences

- §7.2: "All JavaScript that is valid in a Bun execution context is valid inside `${ }`, **except the
  constructs §7.2.1 excludes**" — §7.2.1's table (class, try/catch/finally, throw, async/await, switch,
  dynamic import) does not list an arrow with a braced body or a function expression.
- §7.5: "**Lambdas given to a tape method are inferred.** The parameters of a lambda written directly as the
  callback argument of a tape method (`xs.map(x => x * 2)`, `.filter`, `.some`, `.every`, … `.sort`, …) take
  their types from the tape's element type and MAY be written bare." / "Every parameter of a `function` /
  `fn` declaration or expression — named or anonymous … SHALL carry `: T`. A parameter without one SHALL be
  compile error **`E-PARAM-TYPE-REQUIRED`**".
- §5.2.1: "`onclick=${expr}` … SHALL use the `${...}` expression directly as the event handler".
- §19.16.3 rule 4: "`defer` SHALL appear only inside the body of a function DECLARATION … It is
  E-DEFER-OUTSIDE-FUNCTION in every other position: … the body of an arrow function or function expression
  (`() => { … }`, `function () { … }`). … Admitting `defer` in lambda bodies waits on structured lambda
  bodies; it is not ruled out by this section." (also: "a `defer` inside a function or arrow DECLARED in a
  `when` body or a handler attribute is rejected too").
- §35.6: "Capturing a `lin` variable in a closure (arrow function expression or `function` expression) SHALL
  count as one consumption of that `lin` variable." / "Capturing the same `lin` variable in more than one
  closure SHALL be a compile error (E-LIN-002)." / "Capturing a `lin` variable in a closure AND referencing
  it outside the closure on the same execution path SHALL be a compile error (E-LIN-002)."
- §35.4.5: "Two appearances of one `lin` variable in one closure body SHALL be E-LIN-002, whatever the
  branching inside the body."

## Built

- AST `AExprK.BlockLambda(params: AParam[], body: ABlock, viaFunction)`; Core `Expr.BlockLambda(params:
  Sym[], body: Block)`; every exhaustive match updated (trivial arms mirror Lambda's).
- parse: `parseLambda` braced body; `parseFnExpr` (`function (p: T) { … }` where a value stands); handler
  `${() => { … }}` / `${function () { … }}` → the inline block (`AAttrValue.Braced`); a handler that takes
  the event is refused as the expression form is. refusals.scrml row retired.
- analyze: `resolveBlockLambda` (params; body resolved with `Env.nest.lam` so `return`s are the lambda's;
  return types recorded in `AS.rets`), `lamBodyCheck` (the built subset; the rest refused by name),
  every-path-returns, typing (`typeBlockLambda`, `lambdaValues` for predicate/comparator/map checks), lin
  (`linBlockCapture`), planner (waits refused as the expression lambda's), read/call/effect/sql/foreign/
  clock/wait walks enter the body (`exprBlocksIn`), control-flow walks stop at it (`lamBlocks` not in
  `exprBlocks`), copy-elision treats it as opaque.
- lower: `blockLambdaExpr`; print: `lambdaCtx` (plain `return`s, own owned-locals); check: C-L1.

## Residue (INTERIM, filed `g-boot-block-lambda-body-subset-s478`)

Body: loops, break/continue, lift, fail, given, effects, nested fn decls, lin locals, expression
statements, writes to non-own bindings, handling forms, `?{}`, foreign blocks, bare `return;`.
Positions: anywhere but a tape callback / no-event handler (function values slice).

## Owner question

- `function (x) { … }` as a tape callback: §7.5 requires `: T` on every parameter of a function
  "declaration or expression"; the tape-method carve-out names "a lambda". Taken: a function expression is
  NOT the carve-out (E-PARAM-TYPE-REQUIRED on a bare parameter); an arrow is. Rec: keep (the SPEC text
  names function expressions explicitly).

## Measurements (base = origin/main f6f025723, after #1901 merged in)

- Tests red on base: `slice-m4/block-lambda-s478.test.js` 22 of 28 fail on base (the 6 that pass are
  refusal rows base already refused under E-BOOTSTRAP-UNSUPPORTED).
- Bootstrap conformance: PASS 521 → 521, FAIL 10 → 10, UNSUPPORTED 702 → 702; PASS→FAIL 0; no bucket
  changes. 35 cases base refused for the braced arrow / function expression now reach their next named
  blocker (18: a handler taking the event object — function values; 6: a block lambda outside a tape
  callback — function values; the rest one each). (Before #1901 merged, one case,
  `server-db/event-after-await-e01-destructure-neg`, went UNSUPPORTED → FAIL on the destructuring parse
  errors the braced-arrow refusal had masked; with #1901 it is UNSUPPORTED on both.)
- Corpus (samples/, examples/, conformance/cases, self-host-v2/acceptance, compiler/samples — 3153
  files) old vs new bootstrap: newly-rejecting 0, newly-accepting 0; 49 already-failing files change their
  code set (the next blocker after the braced body, or `;` reports inside bodies now parsed).
- stdlib/data/transform.scrml: first error unchanged (67:20, a tape destructuring pattern, #1901's
  refusal); its braced `.sort((a, b) => { … })` (line 114) no longer refuses on its own — it now stops at
  `.sort(…)` on an untyped receiver (the function's unannotated parameters).
- CI gates: gen-bootstrap-severity --check current; types-gate, snippet-gate, claim-gate, gen-md-shim OK.

## Status

- [x] implementation; slice tests green (block-lambda-s478, parse, attr-forms, semicolon-residue, parse-batch)
- [x] conformance delta, corpus delta, CI gates
- [ ] hook, PR

## Fix round 1 (PR #1905 adversarial review)

- Merged origin/main f23824dbb (#1900 print/println). Semantic conflict: `lower.scrml blockLambdaExpr`'s
  ValueFact match lacked #1900's `VPrint` arm (impl#1 E-TYPE-006) — added. #1900's `psExpr` pre-scan left
  walking `exprBlocks` (not `exprBlocksIn`); a print in a callback / handler-lambda body is refused (tests).
- HIGH-1: a §50.4.2 kept condition-head assignment ("the only typed position an assignment expression may
  occupy is the parenthesized operand or root of a `for` / `if` / `else if` condition head") wrote a captured
  `let` from inside a callback, compiled clean, broke narrowing (`null + "!"`). analyze `lamExprCheck` now
  refuses a kept assignment whose target is not one of the body's own `let`s (INTERIM, the statement rule;
  a cell target keeps the condition head's own refusal — one report); the body's OWN `let` in a condition
  head is built (§50.4.2 admits it) and runs. check C-L1 rejects an Assign / Assigned whose local is no Let
  of the lambda body ("a block lambda writes a local it did not declare").
- MED-2: a `.map(…)` callback's values join as `if` / ternary branches do (joinVT; §17.6.4 `T` + `not` →
  `T | not`; int + number → number); a choice of types that share none is E-TYPE-031 (§34 "a value is
  assigned to a position whose declared type it does not satisfy" — the mapped tape's element type). Covers
  the expression ternary form too (same `lambdaValues` path). The joined tape is then checked against the
  declaration (`number[]` / `(int | not)[]` into `int[]` → E-TYPE-031).
- Tests: block-lambda-s478.test.js +23 (14 red on pre-fix; the 4 print rows and guards green on both).
- Conformance vs main f23824dbb: PASS 525 → 525, FAIL 10 → 10, UNSUPPORTED 698 → 698; PASS→FAIL 0.
- Corpus vs main: 3153 files, newly-rejecting 0, newly-accepting 0 (code-set changes identical to round 0's 49).
