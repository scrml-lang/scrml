# s480-static-class — progress

- [x] worktree from origin/main c15225d88
- [x] seam: compile time (print.scrml attrsJs → staticClasses) passes rt.classOn a `fixed` flag; runtime keeps reading the condition (deps + trap hold) but slot.v is always true → mount, re-run, restoreHeld all keep the class
- [x] tests: slice-m4/class-directive-s480.test.js (6 new; 5 red on base, guard green on both)
- [x] impl#1 also strips (emit-bindings.ts classList.toggle) → gap g-impl1-class-directive-strips-static-class-s480
- [x] SPEC §5.5.2 clarifying sentence + provenance
- [ ] commit, gates, conformance base vs head, PR
