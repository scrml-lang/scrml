# s478-boot-review-followups — progress

Branch s478-boot-review-followups (from origin/main 733394af4). LOW follow-ups from the S239 reviews of #1885 / #1886.

## #1885 (markup as a value)
- [x] L1 parse.scrml `markupValueDiags`: the INTERIM markup-value refusal is dropped only on the lines a named markup refusal spans (was: file-wide).
- [x] L2 lex.scrml `isVoidName` is the full HTML void list (= html.scrml `isVoid`; lex is compiled standalone, so a test holds them equal); parse.scrml `isVoidTag` reads it. `parseMarkupValue` reports text past the element as E-PARSE-TRAILING.
  - consequence: `<wbr>…`, `<area>`, `<source>`, `<track>`, `<col>`, `<embed>`, `<base>` in a markup body take no closer (were E-PARSE-CLOSER); `<wbr></wbr>` is now a stray-closer error, like `<br></br>` already was. Corpus: 0 files affected.
- [x] L5b checked: `/* c  in: { a } a` — the front end's core is non-null by design; slice-m1/tool-slices.js `prepareToolSlices` refuses it at the driver (E-FOREIGN-007 "Unterminated comment", §23.2.4a). No fix needed.

## #1886 (body-top run locals / lin)
- [x] LOW-6 `linMarkupNode` `.Run` → linRefuse (E-BOOTSTRAP-UNSUPPORTED, counted). Latent: no source reaches it today (nested-run statements and declarations are refused upstream), so no red test.
- [x] LOW-2 `linGather`: the iterable (and a counted init) is a consumption; body / cond / step / key E-LIN-002.
- [x] LOW-1 E-LIN-005: `linOuterRunLins` seeds function / handler walks with the body-top lins bound before them (used, negative ids — linShadow only); `linForBinder` checks a `for (const x of …)` binder (statement loops and gathers); a counted init's `let`s are walked in the loop's own scope.
- [x] LOW-4 resolveNameOf: a program cell initializer / derived cell reading a body-top local bound before it → named E-BOOTSTRAP-UNSUPPORTED (runLocalCellReadWhy), counted (no E-LIN-001).
- [x] LOW-5 a file-scope constant's initializer (`const` item, nested `${ const … }`) → runLocalConstReadWhy.
- [x] LOW-3 `if=` / `else-if=` condition is one consumption (§17); gap g-boot-run-local-lin-interim-positions-s478 reframed (lean-decided / analogy / open).

## Measurements
- conformance: base == head (PASS 462, CODES-ONLY 5, FAIL 88, NOT-TWINNED 635, UNSUPPORTED 678); 0 verdict or emitted-code changes.
- corpus (samples, examples, conformance/cases, acceptance, slice-m2/m4 src; 3176 files): 0 newly rejecting, 0 newly accepting, 0 code changes.
