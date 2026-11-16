# s478-boot-refinement-runtime — progress

Branch `s478-boot-refinement-runtime` (from origin/main 0e8d70d87). Scratch: ~/.cache/scrml/review/s478-refine-rt/.

## Survey (base conformance: PASS 525 / FAIL 10 / UNSUPPORTED 698)
51 UNSUPPORTED cases whose first refusal is a refinement-runtime refusal:
- 30 `req` / `min` / `oneOf` on a struct field (form-for/*, schema-for/*, error/handler-failable-reference-exempt-neg) — all ALSO blocked by `scrml:data`, `<formFor>`, `<schema>`; building the field check moves none of them. NOT built (stays refused).
- 1 match-block/member-access-subset-dead-arm (`oneOf` field, enum subset) — not built.
- 13 "stands where a value reaches it unproven" — mostly function parameters.
- 3 `let` cell reassignment, 1 `let` local, 1 `const` local non-literal, 1 derived cell, 1 tape element.

## Built
- A. function-declaration parameter (top-level refinement): entry check (lower paramRefineChecks), nested fns too; literal argument static zone (E-CONTRACT-001 at the call, analyze checkArgs).
- B. `const` local whose value is not a literal (or an undecided `url` literal): checked as it binds.
- Core PrimOp.RefineCheck -> runtime.js refineCheck (E-CONTRACT-001-RT ScrmlTrap); server-runtime re-exports.
- Stays refused: `let` local, cell writes, return type, struct/variant field, inner refinements, fn-expression params, host bindings, host wrappers (analyze wrapperTypeWhy).

## Measured
- Conformance base 525/10/698 -> head 533 PASS / 11 FAIL / 689 UNSUPPORTED. PASS->FAIL 0.
  UNSUPPORTED->PASS 8 (refinement/boundary-reject-rt, inhabit-rt, literal-call-arg-neg/-pos, nested-fn-param-reject-rt,
  string-shape-inhabit-rt, url-executable-scheme-reject-rt, const-reject-rt); UNSUPPORTED->FAIL 1 (base-type-reject-rt, E-TYPE-031).
  The 9 case sources got their missing `;` (SPEC §7.2.2 rule 1; precedent 6420df6cc) — only `;` added.
- Corpus (samples, examples, conformance, acceptance; 3150 files, single-file front end): newly-rejecting 0; newly-accepting 1
  (refinement/literal-call-arg-neg); error set changed 1 (literal-call-arg-pos: E-BOOTSTRAP-UNSUPPORTED -> E-CONTRACT-001).
- Gates: severity --check current; types-gate unchanged; claim-gate 0 fail (external-js.md pin reason text updated);
  snippet-gate: NERDME.md:234 pin ×4 -> ×3 (parameter now built); corpus-compile-floor PASS; gen-md-shim current.
- Tests: slice-m4/refinement-runtime-s478.test.js 18/18 (10 red on base); slice-m2/refinement-s478.test.js updated (21/21).

## Status
- [x] implementation + tests + measurements
- [ ] commit (hook), merge origin/main, PR

## Fix round 1 (review of #1911)
- Merged origin/main (#1908 <schema>) — clean, severity.scrml current.
- HIGH-1: a FILE-SCOPE refined `const` with a non-literal (or undecided `url`) value compiled clean, unchecked —
  it is lowered by the constant path (lower.scrml coreConsts), not lowerStmt .Local. parse.scrml localRefine now
  clears the refusal only in a body (`tp.inFn != 0`); at file scope it stays E-BOOTSTRAP-UNSUPPORTED, naming
  "the file-scope constant `K`". (Building it needs a compile-time folder or a module-init check in whichever
  artifact carries the constant — not cheap; refused by name, INTERIM.)
- MED-1: SPEC §52.13 names "the §53.9.4 `E-CONTRACT-001-RT` 400" and calls it a body-carrying compiler response.
  A routed server fn's param checks now ALSO run in its route entry (print.scrml routeEntryChecks ->
  `rt.refineEntry`, marked in a module-private WeakSet); serveRoute answers 400
  `{error, constraint, parameter}` (no value, no source location). Any other trap in a body stays 500.
- LOW-1: runtime.js refineKnown — a spec with any unread node is refused whole (no `!` composition admits).
- LOW-2: `int` base is Number.isSafeInteger.
- LOW-3 / LOW-4 / base-type-reject-rt owner question filed as gap markers.
- Tests: slice-m4/refinement-runtime-s478.test.js 30/30 (11 red on the round-0 head 2d114ba6c).
