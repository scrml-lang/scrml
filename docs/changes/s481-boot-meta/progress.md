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

## r1 (review of #2045 — ~/.cache/scrml/review/s481-2045/review.md)
- [x] MED-1 budget: work charged to the step count (copyUnit 1024 chars / copied elements, walkUnit 16 walked elements), size bounds (16 Mi per value counted with all it holds, 1 Mi elements per list, 256 nesting), checked before building; repeat 100000 cap removed; SPEC §22.4 "The evaluation bound (S481)".
- [x] MED-2 closures fail closed (floor + pins); gap g-boot-meta-closure-by-value-s481 → MED, text rewritten. Aliasing: §66.10 item 1 value semantics — interpreter right.
- [x] LOW-1 attribute-position block (one E-META-EVAL-002, placeholder span recorded as an error span), LOW-2 first body fault only, LOW-3 type name → E-META-001 static, LOW-4 namespaced-attribute reason, LOW-5 non-number sort comparator refused.
- [x] tests: meta-s481.test.js "s481 r1" (20 tests).
- [x] r1 finish (S482): the WIP (`==` §45.3 E-EQ-001/-003 as it runs; §14.10 E-VARIANT-AMBIGUOUS) committed, the variant check
      narrowed to an unannotated local initializer (the WIP refused §14.10's own legal forms: `c == .B`, `f(.A)`, `return .A`);
      `.sort()` insertion sort -> stable merge sort (a 3000-element reverse list ran out of steps); LOW-4 named on the
      parse-error path (`<a xlink:href=…>x</a>`, a text child).
- [x] final gates (S482, head 390fad3a5): pretest; bootstrap conformance 798/10/628/517/0, per-case identical to pre-r1 and
      to the merge-base FAIL set; meta-related 39 PASS; impl#1 meta 68/68; CI checks job green; byte-compare head vs
      pre-r1 0 diffs. PR body r1 section.
- [ ] NOT done: merge origin/main — the branch CONFLICTS (analyze/ast/parse.scrml; main migrated self-host to `;` and
      `while` -> `for`; meta.scrml / emit-gate.scrml need the same migration). Owner/PA call.
