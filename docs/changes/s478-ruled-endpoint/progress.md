# s478-ruled-endpoint — progress

Lane: S478 ruled owner-Qs 33–40 (gap g-boot-endpoint-s478, Qs 1–8), §61 `<endpoint>`.
Rulings: scrml-support user-voice-scrml.md "⭐ RULED — open owner questions, PA recs adopted wholesale (S478)" items 33–40.

- [x] worktree + base measurements (conformance base: PASS 614 / FAIL 18 / CRASH 0; corpus probe of the 19 `<endpoint>` files)
- [x] SPEC §61 text (Q1 405+Allow, Q2 ROUTE-DUPLICATE + reserved prefixes, Q3 strict allow-list, Q4 placement, Q5 path grammar, Q6 ARM-NO-VALUE, Q7 415, Q8 tag field) + §34 rows
- [x] bootstrap (parse placement, analyze codes), severity regen
- [x] tests (slice-m4/endpoint-s478.test.js, failclosed, channel-served); no new conformance cases (impl#1 emits none of the new codes)
- [ ] gates, gap markers, PR

## Measurements
- bootstrap conformance base == head: PASS 614 / FAIL 18 / NOT-TWINNED 635 / UNSUPPORTED 601 / CRASH 0; 0 cases moved.
- corpus: the 19 files with `<endpoint>` (samples/examples/conformance/acceptance/benchmarks/stdlib) — identical bootstrap diagnostics base vs head (0 newly rejecting).
- CI checks run locally: severity --check, s34-census --check-new, types-gate, snippet-gate, claim-gate, gen-md-shim, corpus-compile-floor — all pass.
