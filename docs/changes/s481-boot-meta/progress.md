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

## r3 (S482 — re-review ~/.cache/scrml/review/s482-2045-rev/review.md, brief s482-briefs/fix-2045-r3.md)
- [x] STEP 0: merge origin/main eca9c5af5 (merge commit 290bb0d55, clean); 0 `while` in meta / emit-gate / parse.
- [x] HIGH-1 per-file emit budget (meta.scrml maxFileChars / maxFileTags / maxFileNodes, MC.used, MBud.room/troom,
      withOut, countNodes): 1 Mi chars, 64 Ki `<` (checked before parseFragment — it is superlinear: 150k nodes 28 s),
      32 Ki nodes; emit() text not normalized past the budget (no backslash: no pass). SPEC §22.4 "The emit budget".
- [x] HIGH-2 evalObject / field write: lists gathered, record made once (madeRec), charged per field
      (kvMerge by halves; spread into nothing shares the lists); list literals gathered by halves (arrRange).
- [x] HIGH-3 allocation bound (alloc / allocOf in made / willBuild; split, charsOf, reflect count created elements
      first): char 1, slot 8, element 128, 256 Mi per block. SPEC §22.4 "Allocation".
- [x] push loops stay linear (OWNED: MBud.own — a binding whose list `push` made and nothing read since appends in
      place; any other read, a write, leaving the frame or a call ends it). Without it the allocation bound refused
      the r1 "ok" probes (10k/20k pushes).
- [x] MED-1 evalListArgs: only argument 0 is exempt from pins.
- [x] LOW-1 E-TYPE-063 (fLocalInit, enumNameOf); LOW-2 E-EQ-002 (fEqNot); LOW-3 deep eqFault (hasFnV, eqTypes);
      LOW-4 E-SCOPE-REDECLARE (redeclares, fBlockP).
- [x] tests: meta-s481.test.js 88 (s482 r3 blocks: 12 red on the merged pre-r3 head, 2 regression pins).
- [x] gates: conformance 808/3/628/517/0 = pre-r3, main->head 38 UNSUPPORTED->PASS, 0 PASS->other, meta PASS 39;
      emitted output 0 diffs vs pre-r3, 68 vs main all meta; corpus 71 / 19 clean, per-program identical to pre-r3;
      impl#1 meta 68/68; CI checks job green; 145 probes all < 0.5 GB / 2 s.
- gap filed: g-boot-fragment-reader-superlinear-s482 (pre-existing).

## r4 (S482 — re-review ~/.cache/scrml/review/s482-2045-r3rev/review.md, brief s482-briefs/fix-2045-r4.md)
- [x] merge origin/main 2eba1eb75 (merge commit 79fa24d34, clean; 0 `while` in meta / emit-gate)
- [x] cost model first: ~/.cache/scrml/review/s482-boot-meta-r4/model.md (invariant + every host op; BUG rows fixed)
- [x] HIGH-1 OWNED sound: callback made after the other args (env = caller frames), runs on the caller's own set;
      kept fns pinned; evalCaptured isolated; in-place push checks the write rules first
- [x] HIGH-2 KMP findStr / splitStr (indexOf, includes, split, replace, replaceAll); replaceAll("") = JS
- [x] HIGH-3 one emit budget per compile (metaFiles carries MUsed)
- [x] HIGH-4 + MED-1 parse.scrml FRAGMENT MODE (reader counts: nodes, attrs, attrs/element, depth, diags; plain only)
- [x] LOW-1 E-TYPE-063 in assignment / typed param / typed return / comparison (FX.tys, FX.ret)
- [x] LOW-2 + class: binding scans/copies charged (findB, declare, rebind, pins, owned keys, records, args, keepFn work)
- [x] gate reasons capped (32 + summary), respan by halves, nsAttrTag linear, url.scrml srcset/runs linear
- [x] tests: meta-s481.test.js "s482 r4" (16 tests)
- [x] SPEC §22.4 text (per-compile budget, reader bounds, plain-only, charged searches); gap g-boot-fragment-reader-superlinear-s482 widened
- [x] merge origin/main ea04fc7b0 (7c37fde2e, generated regen only)
- [x] gates (head 7c37fde2e): pretest exit 0; bootstrap conformance PASS 810 / FAIL 3 / UNS 517 / CRASH 0 vs main
      772 / 3 / 555 / 0 — 38 UNSUPPORTED->PASS (all meta), 0 PASS->other; meta PASS 39; impl#1 `-t meta` 68/68;
      meta-s481 104/104 (r4 block: 11 red on base 16ff8cf); CI checks job green; byte-compare 68 diffs vs main,
      all meta, 0 non-meta, 0 throws; vs the r3 merged head 1 diff (meta-emit-url-foreign-neg: one E-META-EVAL-002
      instead of two — the reader stops at the first non-plain construct); 252 probes, every `^{}` probe <= 3.3 s /
      493 MB (only the 4 hand-written-source calibration probes exceed: pre-existing reader gap)
- [ ] push + PR body ### r4

## r5 (S482 — re-review ~/.cache/scrml/review/s482-2045-r4rev/review.md, brief s482-briefs/fix-2045-r5.md; FINAL round)
- [x] merge origin/main a7f50def5 (cfc8d74ef; lex/parse/known-gaps from #2058, no `while` added to meta / emit-gate)
- [x] HIGH-1 every changing method (push/pop/sort/reverse) re-reads the binding's list AFTER its arguments
      (tapeMutate); an argument that assigns the receiver is refused (MBud.recv, assignName); splice/shift/… stay
      refused (noMethod); sort comparator that pushes stays refused (writeFault)
- [x] HIGH-2 compile-wide step total 4 × 1,000,000 (MUsed.steps, MBud.cap; totalMsg); corpus/conformance/snippets
      max 223 steps (steps.txt)
- [x] MED-1 string indexOf/includes/startsWith/endsWith positions, split limit (ToUint32), list indexOf/includes
      fromIndex; audit: charAt/toFixed/repeat ToIntegerOrInfinity, number toString(radix), `not` = null in
      argStr/argNum, sort(not) TypeError, callbacks get the list, list includes finds NaN
- [x] LOW-1 `const f = (c: C) => …` typed like a local fn (localTy); `let` residual filed g-boot-meta-let-lambda-typed-param-s482
- [x] tests: meta-s481.test.js "s482 r5" (15 tests; 12 red on base 6cdb377e7)
- [x] SPEC §22.4 "The compile-wide step total (S482)" + changing-method sentence
- [x] gates (head f1206e0cc): pretest exit 0; bootstrap conformance PASS 810 / FAIL 3 / UNS 517 / CRASH 0 vs main
      a7f50def5 772 / 3 / 555 / 0 — 0 PASS->other, 0 non-meta transitions, meta PASS 39; impl#1 `-t meta` 68/68;
      meta-s481 119/119; s34-census, types-gate (182, unchanged), snippet-gate, claim-gate, gen-md-shim,
      corpus-compile-floor all PASS; byte-compare (1,958 cases) vs main 68 diffs all meta, 0 non-meta, 0 throws;
      vs r4 head 6cdb377e7 0 diffs; 181 probes (r4rev p/**, r4 p/, r5 p/) max 6.1 s / 554 MB, 0 exit 2, 0 timeouts;
      k1/k2/k4/k6 equal impl#1's JavaScript values
- [ ] push + PR body ### r5
