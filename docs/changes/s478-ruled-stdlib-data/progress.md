# s478-ruled-stdlib-data — progress (crash-recovery anchor)

Rulings: user-voice-scrml.md "⭐ RULED — open owner questions, PA recs adopted wholesale (S478)", items 55 (Q1), 56 (Q2). 57 (Q3) deferred — not touched.
Gap: g-boot-stdlib-data-owner-questions-s478.

## Q1 — per-name barrel supply (INTERIM) — DONE (driver)
- stdlib/data/index.scrml: statement `;` on each re-export (bootstrap requires; S473 precedent a55fd8e73).
- compiler/self-host-v2/slice-m2/lowered.js: importLinks; stdlibSources follows a named re-export only
  for needed names (unneeded blanked, same length); frontEndStdlib withdraws a failing NON-entry file
  alone; withheldRefusals relabels the analyzer's E-IMPORT-004 at a withheld name to E-BOOTSTRAP-UNSUPPORTED
  (by name); a namespace import of a module with a withheld name is refused at the statement.
- test: slice-m4/stdlib-per-name-s478.test.js (+ fixture src/stdlib-s478d). 8/8.

## Q2 — parseVariant intrinsic — DONE
- analyze.scrml: isParseVariantFn (callee = `parseVariant` of scrml:data/parse.scrml), resolveParseVariant
  (TYPE-NOT-ENUM / TAG-FIELD / unsupported field types), ValueFact.VParseVariant, typeCall hook,
  param-type + void exemptions for the intrinsic's declaration.
- core.scrml Failable.FParse(json, en, err); lower parseFailable; print failableJs -> rt.parseVariant(table, errTable, json);
  check C-PV1; walk / print-server arms.
- runtime.js parseVariant (strict keys, §57 decode per field); server-runtime re-export.
- severity.scrml regenerated (E-PARSEVARIANT-TYPE-NOT-ENUM).
- test: slice-m4/parse-variant-s478.test.js (11).
- conformance filter: parse-variant 8/8 PASS; e-import-004-stdlib-name-not-exported-reject PASS;
  e-import-004-stdlib-name-exported-clean UNSUPPORTED (validate.scrml = Q3, deferred).
- known-gaps: owner-questions gap resolved; residue -> g-boot-stdlib-data-residue-s478.

## Measurements (base 7f1f5385b vs head)
- bootstrap conformance: PASS 614 -> 623 (+9), UNSUPPORTED 601 -> 592, FAIL 18 -> 18, CRASH 0; 0 PASS->FAIL.
  UNSUPPORTED->PASS: 8 parse-variant/* + module/e-import-004-stdlib-name-not-exported-reject.
- corpus (126 files importing a `scrml:` module, samples/examples/acceptance/benchmarks/conformance, raw source):
  newly rejecting 0, newly clean 0; 61 files: module-level `scrml:data` refusal -> per-name refusal.
- CI gates: types-gate OK, severity --check OK, gen-md-shim OK, corpus-compile-floor PASS;
  snippet-gate / claim-gate: two spec-ahead pins re-counted (NERDME.md type-derived ×8->×9,
  llm-kickstarter-v2 block #25 ×6->×7) — the import is now refused per name (formFor/schemaFor/tableFor).
