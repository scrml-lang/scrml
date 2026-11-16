# s478-boot-fn-type — progress

Lane: function values in the bootstrap (`compiler/self-host-v2/`), the rest of
`g-bootstrap-function-values-slice-s451` after #1918. Branch `s478-boot-fn-type`.
Scratch: `~/.cache/scrml/review/s478-boot-fn-type/`.

## Built

- Syntax: a function type `(T, …) => R` / `(a: T) => R` / `() => void` (parse.scrml parseFnType,
  §7.5 "the §15.11.4 signature type"); an arrow with written parameter types `(x: int) => …`
  (parseTypedLambda). AST `ATypeK.TFn`, `AExprK.Lambda.typed`.
- Core: `Type.Fn(params, ret)`, `Expr.FnRef(fn)`, `Expr.CallV(f, args)`; check.scrml C-FV2 (a
  FnRef names a client Fn that never waits / fails / is host-backed) and C-FV3 (a CallV calls a
  Local); print (`twice` / `g(…)`); walk + reach (a FnRef counts as a reference, so the artifact
  holds the function); codec refuses a function type (no wire form, §14.3).
- analyze:
  - resolveTypeFn — a function type resolves on a parameter, a local annotation, a return type
    and inside another function type; resolveType refuses it elsewhere by name; a struct field
    of function type is E-STRUCT-FUNCTION-FIELD (§14.3), an enum payload field refused by name.
  - Positions (withFnVal, §14.3 R2′ "bound, passed, returned and called"): a local's
    initializer, a whole-local assignment, an argument of a scrml call, a `return` operand;
    anywhere else refused by name (fnPosWhy).
  - fnNameRef — a file-scope function named without a call is a FnRef typed by its signature
    (fnValueType); refused by name: nested, host-backed, `lin` parameter, unreadable signature
    (inferred return). A `!` function stays E-ERROR-002.
  - resolveValueLambda — an arrow / function expression as a value; parameters written or fixed
    by the position's function type (§7.5 S469 (3)), else E-PARAM-TYPE-REQUIRED; no inherited
    handle narrowing; body rules lamBodyCheck / lamExprCheck.
  - resolveCallV — a call through a local of a function type; refused by name in a `fn` body
    (§48.6.2) and when the local's name is a function's in scope (name-keyed narrowing pass);
    a `void` value used as a value is E-TYPE-001.
  - PendRule.FnValue (rulesPass, after the summary): a waiting / server-placed target, recursion
    through a value, and any function value or call through one in a server-side body —
    refused by name.
  - hostServerDiags — a server function's function-typed parameter is E-ROUTE-004 (§12.5); a
    function-typed result is refused by name.
  - A local initialized with a function value takes its type as declared (no joined
    signatures); a function value into a non-function local is refused; a returned function
    value needs a declared function return type.
  - Typer: fnFits (exact signatures), fnValueVType, typeCallV (E-CALL-ARITY / E-TYPE-031),
    typeLambda / typeBlockLambda for a value (no inherited cell narrowing, §42.3.5; the body
    checked against the signature's return), fnValueQuiet (no second report).
  - lower: Name NFn → FnRef; Call through NLocal → CallV.
  - cleanup(v) with `v` of a function type is the unbuilt "named function reference" (not
    E-LIFECYCLE-004).

## Measurements

- Tests: `slice-m4/fn-type-s478.test.js` 38 tests (12 run in happy-dom), 37 red on base 716265978.
  Updated: block-lambda-s478, core-additions, semicolon-residue-s478 (a bare standalone lambda
  parameter is E-PARAM-TYPE-REQUIRED, §7.5 S469 — was E-BOOTSTRAP-UNSUPPORTED); effect,
  value-positions (helper no longer requires the old refusal); error-model HIGH-2 (a function
  value is built, never `null`).
- Conformance vs origin/main 46196f62c: PASS 589 → 592 (lifecycle/effect-writes-state-function-value-pos,
  reactive/narrowing-not-inherited-by-lambda-reject, reactive/no-write-unproven-pos), UNSUPPORTED
  627 → 624, FAIL 17 → 17, CRASH 0, PASS→FAIL 0.
- Corpus (3211 .scrml in samples, examples, conformance/cases, acceptance, stdlib, benchmarks):
  newly rejecting 0, newly accepting 0; 9 already-rejecting files change their code set.
- CI checks-job gates: types-gate, snippet-gate, claim-gate (kickstarter middleware pin updated:
  the function-typed parameter is read now), corpus-compile-floor, gen-md-shim — green.
  severity.scrml current (no new code).
- Gaps: g-bootstrap-function-values-slice-s451 PARTLY BUILT note; residue + 6 owner questions
  `g-boot-fn-values-residue-s478`.
