# s478-boot-missing-checks — progress

Lane: bootstrap conformance FAILs where a required check is missing.

## Re-measure on base 367ddb3b6
- still FAIL: engine/rule-violation-pos, engine/self-write-pos, server-fn/e-route-004-pos
- already PASS on base: lifecycle/cleanup-error-non-function, reactive/server-fn-rawvar-read-error
- UNSUPPORTED on base (named `println` refusal, not silently accepted): foreign/foreign-crossing-shadow-in-block-neg,
  foreign/foreign-slice-unparseable-in-block-neg, server-fn/session-value-in-tool-neg

## Done
- [x] engine: literal-variant write inside a state-child body judged against that state's `rule=`
      (E-ENGINE-INVALID-TRANSITION, §51.0.F) + W-ENGINE-SELF-WRITE-DETECTED (Info, §51.0.F.1, strict
      inside only; the conservative outside half held back — gap g-boot-engine-self-write-outside-lint-s478).
      analyze.scrml `literalStateWrite`. severity.scrml regenerated.
- [x] E-ROUTE-004: refusals.scrml rows — a function-typed param of a `server function` is relabelled
      E-ROUTE-004 (§12.5; message quotes the signature, naming function + param); of any other function
      E-BOOTSTRAP-UNSUPPORTED (was mislabelled E-STRUCT-FUNCTION-FIELD).
- [x] tests: slice-m4/engine.test.js (§51.0.F block), named-refusals-s473.test.js (4 rows)
- [x] conformance 475→478 PASS, 63→60 FAIL, 0 PASS→FAIL
- [x] corpus (3150 files, as-written + §66 twins, old vs new bootstrap): newly-rejecting 1 =
      conformance/cases/engine/rule-violation-pos (the target, correct per §51.0.F); 0 newly-accepting

## Todo
- [ ] CI checks, hook, PR
