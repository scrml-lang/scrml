# s480-static-class — progress

- [x] worktree from origin/main c15225d88
- [x] seam: compile time (print.scrml attrsJs → staticClasses) passes rt.classOn a `fixed` flag; runtime keeps reading the condition (deps + trap hold) but slot.v is always true → mount, re-run, restoreHeld all keep the class
- [x] tests: slice-m4/class-directive-s480.test.js (6 new; 5 red on base, guard green on both)
- [x] impl#1 also strips (emit-bindings.ts classList.toggle) → gap g-impl1-class-directive-strips-static-class-s480
- [x] SPEC §5.5.2 clarifying sentence + provenance
- [x] commit 012345e78 (hook PASS 57492/0)
- [x] conformance base c15225d88 vs head: identical (PASS 760, CRASH 0, no per-case bucket change)
- [x] byte-compare (probe, boot:compile): only a same-name directive gains `, true /* also in the static class: never removed */`; runtime classOn gains `fixed`; different-name directives byte-identical
- [x] CI gates: s34-census, types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim all rc=0
- [ ] push + PR
