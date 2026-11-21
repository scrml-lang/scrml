# s481-boot-meta — progress

Lane: `^{}` meta in the bootstrap, phases 0 + 1 (brief: scrml-support/handOffs/s481-meta-brief.md).
Rulings: user-voice-scrml.md S480 census build order item 2; ruling:user-voice-scrml.md-S481-meta-four.

## Done (committed)
- [x] parse: `^{ … }` read into the tree (parse.scrml parseMetaExpr / parseMetaNode / metaBodyErrors;
      ast.scrml metaOf — the reserved `^` call encoding); body parse errors re-coded E-META-002.
- [x] refusals.scrml `^{ } in logic` row removed; named-refusals test row → E-META-EVAL-002.
- [x] meta.scrml: tree walk (every node/stmt/expr position), static checks (E-META-001/003/005/006/007/009/010),
      interpreter (step + depth bounded, E-META-EVAL-001), emit/emit.raw/reflect, splice via
      parse.scrml parseFragment, gate (emit-gate.scrml, impl#1's lists generated + drift test), spans → block.
- [x] analyze.scrml analyzeSources runs metaFiles first (and again after a namespace re-read).
- [x] slice-m2/meta-s481.test.js — 47 tests (static codes, eval, splice, drift, differential vs impl#1).

## In progress / remaining
- [x] conformance meta case sources migrated (`;` via the bootstrap terminators, `<program>` wrap, backtick SQL): impl#1 68/68 pass; bootstrap 39 PASS, 0 FAIL, 27 UNSUPPORTED (runtime, phase 2; one `log()`)
- [x] SPEC edits: §22.4.2/§22.8 (item 1), §22.5.4 + §47.2.2 (item 3), §22.3 encoded-name registry (S473 D4)
- [x] records (gaps filed; g-meta-code-runs-unsandboxed verified resolved; coverage rows; doc spec-ahead markers): gaps (runtime meta phase 2, imported capture, logic-position), g-meta-code-runs-unsandboxed status check
- [ ] final gates + PR

## Notes
- Scratch: ~/.cache/scrml/review/s481-boot-meta/ (tools/, cases/ migrated copy, t1/ probes).
- BlockLambda params are AParam at runtime (parse.scrml parseLambda) despite the `string[]` field type.
