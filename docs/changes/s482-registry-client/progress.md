# s482-registry-client — progress

Branch `s482-registry-client` from origin/main ae650064a. Ruling: ruling:user-voice-scrml.md-S482-registry-client-types ("yes, client-used types only").

## Build
- print.scrml `clientRegistryNames` (the type names the client half uses: over the client roots #2061's reach gives printProgramExposing — decls, live non-server-only fns, client consts — plus the signatures of the server fns the client calls; closed via codec.scrml `typesReached`, newly exported) and `regArgs` (a MetaReflect's entries printed only when primitive or in that set). PrintIx gains `reg`.
- Probes (~/.cache/scrml/review/s482-registry-client/probes, cases.ts / cases2.ts): base ships passwordHash/apiKey and reflects "Secret"; head ships neither and gives `none`; User/Both/Rec/Prm/Color/Inner present when client-used; dead fn / uncalled server fn param types absent.
- Tests: meta-phase3-s482 updated (USED cells — a computed lookup of an unused type is now `not`); new slice-m4/registry-client-s482.test.js.
- SPEC §22.4.2 amendment + §22.5.4 + bootstrap-status sentences; gap resolved.

## Gates
- Commit 416d5dcdc: pre-commit hook PASS (58200 pass / 0 fail).
- pretest: OK (bundle builds; conformance CRASH 0).
- bootstrap-conformance --json, base ae650064a vs head: identical counts (PASS 845, FAIL 4, NOT-TWINNED 628, UNSUPPORTED 491, CRASH 0) and 0 of 1968 verdict records differ.
- Bootstrap corpus differential + byte-compare (scrml-boot compileSource over examples/ samples/ conformance/ benchmarks/, 2972 files, 324 compile OK on each side): 0 verdict diffs, 0 byte diffs (no corpus file has a computed runtime reflect, so no registry changes).
- s34-census --check-new --base origin/main: PASS. types-gate --check: OK (unchanged). e2e-render-map: 259 pass / 0 fail.
- SCRML_BROWSER_TESTS=1: registry-client-s482 + meta-phase3-s482 + meta-runtime-s482 109 pass / 0 fail; slice-m2/meta-s481 126 pass; named-refusals-s473 + server-artifact + client-roots-s482 139 pass.

## r1 (#2093 review, fix-2093-r1)
- HIGH-1 (identity, not the fallback): lower.scrml `reflectIds` adds a third Prim(MetaReflect) argument — per registry entry, the Sym id(s) of the type its name denotes in the block's file (the file's own declaration, else every other file's exported type of that name). print.scrml `clientRegistryIds` returns used type Sym ids; `regArgs`/`entryKept` keep an entry only when every id is client-used, and strip the argument. Type-literal reflects seed by those ids too (no longer by name). The import case is fail-closed when several files export the name: new gap g-boot-meta-reflect-import-identity-s482 (LOW, INTERIM; capable alternative: resolve through the import's source file in meta envOf + lower).
- LOW-1: CoreProgram gains `typed: TypeNote[]` (local annotations + fn declared returns, from Tables.annots / FnInfo.ret); a client fn's return type and a client local's (Let / Suspend bind) annotation seed the client-used set.
- SPEC §22.4.2 bullet: identity rule, return type + local annotation, the several-exporters clause stated (INTERIM, gap-linked).
- Pins (registry-client-s482.test.js): L9 (dbPasswordZZ/adminTokenZZ absent, reflect "none"), positive twin (both client-used → present), main client-used + lib server-only (main's present, lib's fields absent), F5, F2a.
- Gates: pretest exit 0; conformance --json PASS 845 / FAIL 4 / NT 628 / UNS 491 / CRASH 0 (= PR head); SCRML_BROWSER_TESTS=1 registry-client + meta-phase3 + meta-runtime 114/0, slice-m2/meta-s481 126/0; corpus differential vs PR head 5850df275 (2972 files, 324 OK): 0 verdict diffs, 0 byte diffs; s34-census --check-new --base ae650064a PASS; types-gate --check OK unchanged (182); e2e-render-map 259/0.
