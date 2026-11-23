# s482-client-roots — progress

Branch `s482-client-roots` from origin/main 3e539ae73 (contains #2053).

## Item 1 — g-boot-dead-client-fn-ships-server-const-s481 (MED)
- Locus confirmed: print.scrml printProgram clientRoots + bodyInits / serverInits croots — every non-server-only fn was a client root, reached or not.
- Fix: print.scrml `clientLiveFns` / `clientFnRoots` — client roots are the declarations, channel onclient hooks, CSS bridge reads, and the initializers of unread acting bindings; closure through calls / FnRef / bindings. Unreached fns are dropped from the client artifact. Tool programs keep every fn.
- Probe x1-dead-client-fn: base ships `zz-sk-live-123` + `function dbg`; head ships neither.

## Item 2 — g-boot-server-only-init-no-server-artifact-s481 (LOW)
- pending
- Item 2 done: printServerBuild prints a module-init-only server artifact when serverInits is non-empty.
- Test fallout: tests that print functions nothing calls now name them via printProgramExposing / load-program `expose` (template-slot-fuzz, templates, loops, tape-inplace, host-*, error-*, else-failable) or reach them in source (shared-graph-walks F2).
- Commit 43fe11932: hook PASS.
- Corpus (2968 files, base vs head): newly rejected 0, codes 0, html 0, server 0; 20 client.js diffs, every one a removed unreached function (+ its header/blank), no dangling reference.
- Conformance base vs head: identical verdicts (PASS 778, FAIL 3, CRASH 0).
- known-gaps: both records marked resolved-by=s482-client-roots.
- SPEC §7.6 S481 r1 provenance: the 'Residue' sentence marked resolved (one sentence). CI gates PASS (s34-census, types-gate, snippet-gate, claim-gate, gen-md-shim, corpus-compile-floor, e2e-render-map). Chromium: probes + test programs load/click with no page error.

## r1 (#2061 adversarial review — H1 / M1 / M2 / M3 / L1)
- Merged origin/main 62d36cabd (generated regen only).
- H1: clientLiveFns(p, keep, si) skips server-only initializers; serverRoots counts them as server code (clientLiveFns, clientConsts, bodyInits, serverInits); serverInits is a fixed point (serverInitsRound). o1: `zz-second-secret` / `combine` gone from the client; server still runs `const unused = combine()`.
- M1: shakeProgram → prunedFn / prunedBody drop nested functions their function never names. o3: `deadNested` and API_KEY gone.
- M2: shakeProgram → liveDecls drops components nothing constructs (+ their <db> loads). o4: ghost + peek + API_KEY gone.
- M3: calledServerFnsWith — routes only ServerCalls in code that runs. o2: no route, no descriptor, no server artifact.
- print-server printServerBuild shakes the same program and routes with calledServerFnsWith(p, [], si).
- Tests: client-roots-s482 "D" d1–d6 (d4 dropped: a nested function as a value is refused by the bootstrap). Red on base 62d36cabd (11 fail incl. A/C) and on r0 head e7e78f7ed (d1,d2,d3,d5,d6 fail).
- L1: gap record keeps status=resolved with an r1 paragraph (all four closed).
- Commit 681443a7c: hook PASS (57696 pass / 0 fail).
- Gates on 681443a7c: pretest exit 0; bootstrap-conformance base 62d36cabd vs head identical (PASS 778 / FAIL 3 / CRASH 0); corpus 2968 files (305 compile): newly rejected 0, accepted 0, codes 0, html 0, server 0, 20 client.js diffs — the same 20 as r0, each a removed function (+ header/blank), jsBad 0 (r1 changes nothing in the corpus: no corpus program has a dead component, dead nested function or dead-only server caller); s34-census, types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim PASS; e2e-render-map 259/0.
- Chromium (review harness pw.ts): every p/** probe (u01–u18, x1, c3, o1–o4, imp/app) — same LOAD/CLICK values as base, no page error; `zz-` in no head client artifact (base: o1, o3, o4, x1, imp).
