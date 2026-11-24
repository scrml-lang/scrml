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
