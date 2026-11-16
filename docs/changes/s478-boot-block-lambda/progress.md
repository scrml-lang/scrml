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

## Status

- [x] implementation; slice tests green (block-lambda-s478, parse, attr-forms, semicolon-residue)
- [ ] conformance delta, corpus delta, CI gates, hook, PR
