# s478-boot-false-positives — progress

Lane: bootstrap conformance FAILs where the bootstrap emits an error the case does not assert.
Base: origin/main 367ddb3b6 (after #1887 s478-boot-scope-builtins + #1892 regen).

## Re-measured on base (before)
PASS 475 / FAIL 63 / UNSUPPORTED 695. Of the 18 assigned cases, already NOT FAIL on base:
- PASS: fn/scope-redeclare-fn-over-param-ok, fn/scope-redeclare-neg, linear/must-use-unread-neg,
  reactive/s437-r5-template-cell-read-value-attr, sql/multiple-statements-neg
- UNSUPPORTED (named refusal, not a false positive any more): error/handler-{exhaustive-neg,
  non-exhaustive,wildcard-escape} (`log(…)` built-in), server-fn/e-route-{002-neg,002-pos,005-neg}
  (`document`), sql/multiple-statements-in-condition-neg (`?{}` inside a condition, slice Ue2)

## Fixed
- module/e-import-002-circular-import-reject — bootstrap (analyze.scrml resolveName + constValue):
  a cross-file constant left uninitialized by an import cycle is not reported E-SCOPE-001 /
  untyped-constant refusal; E-IMPORT-002 owns it. Tests: slice-m4/reexport-cycles-s478.test.js
  (red on base; guard: same-file read-before-init in a cyclic file still E-SCOPE-001).
- forms/validator-applies-typed-clean — case: cells now written (twin was LOCKED → E-VALIDATOR-DEAD, correct per §55.5.2).
- match-leave/given-arm-malformed-heads-in-assignment-match-neg — case: `obj` typed; gap g-boot-untyped-local-object-literal-s478 filed.
- server-db/inline-handler-server-call-condition-runtime — case: `isOk(1) !{ _ :> false }` (S451: client call of server fn is failable → E-ERROR-002 correct).
- control-flow/ctrl-003-extend-past-else-pos — dialect.s66 expect override asserting the E-CTRL-001 co-fire (§17.1.1 normative rule); owner question on Worked Example 5.

## Owner questions
- module/e-export-003-attr-distinct-clean — already filed (g-boot-export-form1-library-entry-s478, OWNER QUESTION); not touched.
- E-CTRL-001 co-fire after E-CTRL-003.

## Status
- [x] fixes  - [x] full conformance after  - [x] corpus  - [x] CI gates  - [ ] hook/commit  - [ ] PR

## Measurements
- Conformance base 475 PASS / 63 FAIL → head 480 / 58. FAIL→PASS: the 5 fixed cases. PASS→FAIL 0; no other case's emitted set changed.
- Corpus (3,150 files: conformance/cases samples examples acceptance, relative-import closures), Error code|severity|file sets, base vs head bootstrap: 0 newly rejecting, 0 newly accepting, 2 changed (both drop the cascade E-SCOPE-001 in cycle fixtures: module/e-import-002-circular-import-reject, module/e-import-002-reexport-import-cycle-mixed-reject/x.scrml).
- Gates: types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim, gen-bootstrap-severity --check — all exit 0 (code set unchanged).
