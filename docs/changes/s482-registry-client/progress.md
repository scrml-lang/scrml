# s482-registry-client — progress

Branch `s482-registry-client` from origin/main ae650064a. Ruling: ruling:user-voice-scrml.md-S482-registry-client-types ("yes, client-used types only").

## Build
- print.scrml `clientRegistryNames` (the type names the client half uses: over the client roots #2061's reach gives printProgramExposing — decls, live non-server-only fns, client consts — plus the signatures of the server fns the client calls; closed via codec.scrml `typesReached`, newly exported) and `regArgs` (a MetaReflect's entries printed only when primitive or in that set). PrintIx gains `reg`.
- Probes (~/.cache/scrml/review/s482-registry-client/probes, cases.ts / cases2.ts): base ships passwordHash/apiKey and reflects "Secret"; head ships neither and gives `none`; User/Both/Rec/Prm/Color/Inner present when client-used; dead fn / uncalled server fn param types absent.
- Tests: meta-phase3-s482 updated (USED cells — a computed lookup of an unused type is now `not`); new slice-m4/registry-client-s482.test.js.
- SPEC §22.4.2 amendment + §22.5.4 + bootstrap-status sentences; gap resolved.

## Gates
- pending
