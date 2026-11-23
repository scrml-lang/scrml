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
