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

## r2 (S482 — merge origin/main, brief ~/.cache/scrml/review/s482-briefs/merge-main-2045-r2.md)
- [x] merge origin/main (24bd93c79) — merge commit 98e417edf. analyze / ast / parse conflicted with #2043 (`;` / arm `,`)
      and #2046 (`while` -> INTERIM `for`). Resolved as #2041 r2 did: the same tools (stmt-semi,arm-comma, then
      --loop-interim loop-while,loop-do-while; ast through fixS66 verify off) over merge-base and PR head;
      fix(merge-base) == main for ast/parse, == main minus #2041's semantic hunks for analyze; 3-way merge
      fix(PR head) + main over fix(merge-base): 0 conflicts. refusals.scrml auto-merged.
- [x] meta.scrml / emit-gate.scrml migrated (ccdb19fc0) — tool output; 1 hand edit (meta.scrml nsAttrTag braceless
      `while … j = j + 1;` braced so the tool could rewrite it). 0 `while` left in either file.
- [x] top-check rewrites checked for the MED-1 TDZ hole: meta.scrml loopIter, armBlockValue, nsAttrTag; parse.scrml
      metaCloseAt — capture: none (the commit message says "forRange" for loopIter — a misnaming, same loop).
- [x] gates on the merged head: pretest; bootstrap conformance PASS 808 / FAIL 3 / CRASH 0 vs main 770 / 3 / 0 —
      38 UNSUPPORTED->PASS (all meta), 0 PASS->FAIL, same 3 FAILs as main; meta-related 39 PASS; impl#1 meta 68/68;
      meta-s481.test.js 72/72; byte-compare 67 diffs vs main, all meta-related (0 non-meta), and the 68 meta-related
      cases identical to the r1 head; CI checks job green; MED-1 probes (strdbl, tapedbl, recurwide) + MED-2 (closacc,
      closok) re-run, same answers as r1.
- severity.scrml --check exits 4 (byte drift, new E-META-* rows all Error = fail-closed default) — already so at the
  r1 head; bot-owned, regenerated on main after merge; not committed.
