# s479-import-shadow — progress

Scratch: `~/.cache/scrml/review/s479-import-shadow/` (mk.sh / run.sh / mod.sh / trans.sh / more.sh probes, impl1.sh, self.sh, probe-lint.mjs).

## Findings
- [x] Bootstrap on USER programs: every shape is already E-SCOPE-010 — import vs `fn` / `const` / cell / `type` /
  `as` alias / namespace import / component / `server fn` / stdlib import / import in a later `${}` block; also
  in a NON-entry module (transitive). Two local top-level `fn`s of one name: E-SCOPE-010. Two imports to one
  name: E-SCOPE-010. A function-body local shadowing an import compiles (legal: §7.6 function scoping).
- [x] impl#1 (which BUILDS the bootstrap bundle) accepts them all silently: import wins (local fn is dead code),
  two local fns → the last wins. impl#1 is frozen (S471) — open gap g-impl1-duplicate-function-silently-overrides-s469.
- [x] S473 already guards the bootstrap's own sources with `scripts/lint-duplicate-fn.js` (it flags the replayed
  `opensTag` incident) — but only in the pre-commit hook + CI. The BUILD (`slice-m1/harness.js`
  `buildBundleChunks` — slice suites, bootstrap-conformance, scrml-boot) does not run it, so a lane measuring
  locally gets a silently miscompiled bundle (#1963 r2: 648 → 515).
- [x] Fix: `buildBundleChunks` refuses a bundle whose sources collide (the lint, run on the bundle's input
  files + their relative imports) — throws naming E-SCOPE-010 / file:line.
- [x] lint widened to the §7.6 namespace (const / let / type, `import * as`); real tree 0 violations.
- [x] tests: lint-duplicate-fn.test.js 15 pass; 4 new red on base (redbase.sh).
- [x] gaps: g-boot-build-file-scope-collision-silent-s479 (resolved), g-boot-recursive-enum-exponential-s479 (open — found by item 4).
- [ ] conformance before/after, corpus, CI gates, hook, PR.
