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

## Fix round 1 (review s478-1894)
- [x] H1: from-state known only on a straight-line prefix (analyze.scrml stateChildFromKnown / seqFrom):
      an earlier write of the field, any call, a moving if-condition / match subject, a loop, defer or nested
      fn → dynamic (runtime decides). Same gate for the self-write lint.
- [x] L4: server rows match `function|fn`.
- [x] L1: quoted / braced / no-variant `rule=` refused by name; state admits every target (no cascade).
- [x] gaps filed: payload literal write (L2), server-fn signature shapes (L5), refusal line-scope swallow (L6),
      rule= spellings + unparsed `rule=*` (L1).
- [x] a valueless `rule` (what the parser leaves of `<Done(rule) …>`) keeps its old reading — no refusal
      cascade on engine/payload-reserved-collision-pos.
- [x] conformance vs base 367ddb3b6: 475→478 PASS, 63→60 FAIL, 0 PASS→FAIL (same 3 FAIL→PASS as c7e31c9cb)
- [x] corpus (3150, as-written + twins) vs base: newly-rejecting 1 (engine/rule-violation-pos, target),
      0 newly-accepting; vs c7e31c9cb: 0 changed
- [x] CI checks-job gates green (types, snippet, claim, corpus-floor, md-shim, severity --check)
- [ ] push

## Todo
- [ ] CI checks, hook, PR
