# s478-boot-fn-type — progress

Lane: function values in the bootstrap (`compiler/self-host-v2/`), the rest of
`g-bootstrap-function-values-slice-s451` after #1918. Branch `s478-boot-fn-type`.
Scratch: `~/.cache/scrml/review/s478-boot-fn-type/` (base conformance `base.json`).

## Base (origin/main 716265978)

Conformance: PASS 574, FAIL 17, NOT-TWINNED 635, UNSUPPORTED 642, CRASH 0.

## Plan

1. Syntax: a function type `(T, …) => R` / `() => void` (parse.scrml parseFnType); an arrow
   with written parameter types `(x: int) => …` (parseTypedLambda). AST `ATypeK.TFn`,
   `AExprK.Lambda.typed`.
2. Core: `Type.Fn(params, ret)`, `Expr.FnRef(fn)`, `Expr.CallV(f, args)`; check.scrml C-FV2 /
   C-FV3; printer; walk (FnRef counts as a reference for artifact reach); codec refuses a
   function type (no wire form, §14.3).
3. analyze: function values in the positions §14.3 R2′ allows (bound by a local, passed,
   returned, called) — a named file-scope function and a lambda; a call through a local of a
   function type (arity E-CALL-ARITY, argument types E-TYPE-031, the return type). Fail closed
   (refused by name): a function that waits / is server-placed / is failable / is nested / is
   host-backed / has a `lin` parameter, recursion through a value, a function value in a
   server-side body, a call through a value in a `fn` body, a value lambda that waits.

## Status

- [x] 1, 2 (scaffolding compiles under impl#1)
- [x] 3 — built: FnRef / value lambdas / CallV (resolveCallV, typeCallV, fnFits exact-signature
  assignability), positions (withFnVal), PendRule.FnValue (waits / server / recursion / server-side
  body), E-ROUTE-004 + function-typed server result refusal (hostServerDiags), E-STRUCT-FUNCTION-FIELD
  (fieldDeclTypeOf), forced annotation of a function-initialized local, a fn value into a non-fn
  local refused, a returned fn value needs a declared fn return type.
- Tests: `slice-m4/fn-type-s478.test.js` 38 tests, 37 red on base 716265978.
- block-lambda-s478.test.js: `const f = (x) => {…}` now E-PARAM-TYPE-REQUIRED (§7.5 S469), was
  E-BOOTSTRAP-UNSUPPORTED.
- Conformance (pre-final): PASS 574 → 576 (lifecycle/effect-writes-state-function-value-pos,
  reactive/no-write-unproven-pos), UNSUPPORTED 642 → 640, PASS→FAIL 0.
- [ ] merge origin/main (moved: #1917 member access), re-measure, corpus, CI gates, PR.
