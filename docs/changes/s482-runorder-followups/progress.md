# s482-runorder-followups — progress

Brief: ~/.cache/scrml/review/s482-briefs/runorder-followups.md (items A–F). Base origin/main a27564881 (#2041 merged).
Scratch: ~/.cache/scrml/review/s482-runorder-followups/ (probes p/, harness h/, Chromium runner h/pw2.ts).

## E — #2041 r2 LOW-1 (textarea anchor)
- Verified in Chromium first (h/pw2.ts): `<textarea id="t">${ const a = note("a"); }</textarea>` → value `<!--run-->`.
- Fix: lower.scrml `isTextOnlyElem` (textarea / title / script / style) — lowerPlaced puts the place after it.
- Chromium after: value "", log "a". Test slice-m4/runorder-followups-s482.test.js "E" (3 red on base, green on head).
- Pre-existing sibling checked: `<textarea>${@x}</textarea>` works in Chromium by luck (the hole's text node is
  replaced); `<textarea>a ${@x} b</textarea>` CRASHES the whole page in Chromium (`rt.at(root,0,1)` undefined —
  one RCDATA text node). Different root (hole lowering of RCDATA content, not lowerPlaced) — filed, not fixed
  (g-boot-rcdata-hole-anchor-s482, MED).

## Corpus measurement (B, C)
- h/corpus.ts over examples/ samples/ benchmarks/ conformance/cases (2960 files), base tree (git archive a27564881
  in scratch base/) vs head. Changed: 3 files, all already refused on base (ok=false both sides):
  conformance components/component-scope-markup-read (+1 E-SCOPE-001; parse-broken on the bootstrap),
  samples/compilation-tests/gauntlet-r10-rust-orders, samples/gauntlet-r11-task-dashboard (+1
  E-FILE-SCOPE-INIT-IN-CONSTRUCT each). Newly rejected: 0 → B lands.

## B — body code reaching a later place → E-SCOPE-001
- analyze.scrml bodyReachDiags (+ bodyPlaces / bodyNodeReach / bodyElemReach / bodyExprReach / bodyBlockReach /
  bodyCallReach / laterPlaceDiag), on fileScopePass's usesD. Direct reads/writes and direct-call reach; handlers
  (`on…`), function values, effects/requests, component renders not judged.
- Test "B" (5 red on base, 2 legal shapes green); body-run-order-s481 "a display before the place…" flipped.
- Conformance body-top/display-reaches-later-binding-neg (impl#1 passes it — its own E-SCOPE-001).

## C — acting initializer in if= / slot content → E-FILE-SCOPE-INIT-IN-CONSTRUCT (minted)
- analyze.scrml constructInitDiags / constructAt / initActWhat. §34 row; severity.scrml regenerated.
- Test "C" (3 red on base, 2 legal green); body-run-order-s481 two INTERIM pins flipped (+1 non-acting pin).
- Conformance body-top/acting-init-in-if-content-neg (impl#1 xfail g-impl1-init-in-construct-s482).

## D — `//` / `#{}` between chain members
- Bootstrap already accepted. SPEC §17.1.1 sentence + provenance. Test "D" pins (not red on base — stated).
- Conformance control-flow/chain-comment-css-between-members-pos (impl#1 xfail g-impl1-chain-comment-css-s482).

## F — doc drift
- SPEC §7.6 (b): the S481 r2 INTERIM struck; ruled behaviour written; `<match>` / `<pre>`/`<code>` explained as
  unable to hold a place; textarea/title clarifying sentence. §40.8 bullet updated. Gaps cite the ruling.

## Final gates (head after A + lowerPlaced comment)
- pretest exit 0; bootstrap-conformance: PASS 774 / FAIL 3 (same 3 as base: loop-007-separate-while-after-decl-neg,
  defer/outside-function-when-body-neg, loop/w-assign-001-severity-pos) / CRASH 0; base 770 / 3 / 0; bucket
  changes = the 4 new cases (PASS); no PASS→FAIL.
- Byte-compare (dump.ts, printed client/server of every case): 242 printed, 1 differs —
  hostmethod/substring-match-typed (expected, A). The shared runtime file grows hold/seed/seedAll + Cell.held.
- Corpus (2964 files incl. the 4 new cases): 0 newly rejected.
- s34-census --check-new PASS, types-gate OK, snippet-gate 0 failed, claim-gate 0 failed, corpus-compile-floor PASS,
  gen-md-shim current, severity current, host-global-scan 1/2 + 2/2 exit 0.
- Chromium (h/pw2.ts): t1 textarea value "" (E), a3-order "acbmz" (A), a1-b3 5/5/5 (A).

## A — each seed computed at its place
- runtime.js: Cell.held; `hold` / `seed` / `seedAll`; construct leaves held seeds owed; land() runs a held
  seed before a write.
- lower.scrml: programMarks marks program-cell DeclItems; initView → View.Init(field sym) — only for a
  writable cell whose initializer is not a literal (literalInit), so literal-seeded programs' Core is unchanged.
  M1 oracle slice-m1/dropdown.core.scrml (earlyRead) gains the Init of `firstCountry` (its seed calls a fn).
- First hook attempt FAILED (front.test.js indexed renders[0] — an Init for a literal-seeded cell): fixed by
  literalInit; full ./compiler/self-host-v2 run then: 9379 pass, 2 fail (the M1 oracle — fixed; scrml-boot
  bundle-cache test — an artifact of editing lower.scrml mid-run, green on rerun).
- check.scrml C21: program field syms are bound (the place names the cell).
- print.scrml: heldFields / seedLive / liveSeedDecl / programInstances / reachOf / cellReadOf /
  constructedElsewhere (replaces constructedDecls) in bodyInits; placeInits keeps held cell Inits; wireHole
  .Init → seedPlaceJs `rt.seed(cell)`; factoryJs → holdJs (program only); instanceJs → `rt.seedAll(i$)` for a
  held kid in the program's render.
- Tests: "A" (4 red on base, 4 pins); b3 flipped (5/5); use-site test flipped (1/10); file-scope-init-s479
  seed-reads-C assertion flipped. Conformance body-top/seed-computed-in-place (impl#1 xfail under
  g-impl1-body-run-order-s481; host-global-scan known-throw pinned).
- Byte-compare (dump.ts, 241 printed cases): 1 diff — hostmethod/substring-match-typed (a seed calling
  `classify` is held: `rt.hold`, `<!--init-->` anchor, `rt.seed` at its place) — expected.
- Conformance: base 770 PASS / 3 FAIL; head (before A case) 773 / 3 — same 3 FAILs, CRASH 0.
- SPEC: §7.6 rule (b) ⚑ resolved + S482 provenance; INTERIM narrowed; §7.6.1, §40.8, §66.7.6 rule 5 + table row.
- Gaps: P1 / P3 resolved (built by #2041, checked on main); P2 narrowed (residue listed).

## r1 (S482 fix round, #2053 review verdict FIX)
- Step 0: merged origin/main (eca9c5af5) — dd240c4c9 (merge commit, clean). This branch's own new `while`
  (print.scrml reachOf) → `for (; todo.length > 0; )` by `scrml fix --loop-interim` (31058ae0c); body captures nothing.
- HIGH-1 (bf4b7e8d9): analyze.scrml constructAt names a `<match>` arm (`the <Idle> arm of <match for=Ph>`); SPEC §7.6 (b)
  false sentence struck, construct list / §34 row / §40.8 bullet name the arm; gap g-boot-nested-init-place-in-construct-s481
  corrected. Tests "C r1" 6 red on 758b0577b / 8 green; conformance body-top/acting-init-in-match-arm-neg. Corpus 0.
- MED-1 (7dc39c1c5): PA reading (prov=pa-ruled, conditional) built after measuring three variants on the 2964 corpus files
  (A: named function values only; B: + function expressions; C: + the `uses` closure, function values inside reached
  functions) — each 0 newly rejected, 0 code/output changes. C built (§6.7.4 rule 3's reading of "a function value counts
  as if it were called"). Over-refusal: a function value handed on and never called while the body runs (`apply(g)` with
  `apply` ignoring it; stored for later; handed to a host subscription) — the analysis cannot tell; corpus holds none.
  Tests "B r1" 5 red / 7 green; conformance body-top/fn-value-reaches-later-binding-neg (impl#1 passes it).
  Found: g-boot-handler-reach-runs-binding-early-s482 (filed, MED, pre-existing) — a handler before a binding's place that
  reaches it makes print.scrml bodyInits run it before the body (`reachOf(NView)` walks handlers).
- MED-2: NOT built — owner question. Item 2's sentence is about a display/statement that CALLS a function; a cell read is
  not a call, and item 1 sanctions the early read ("computes it early, on demand") without saying what happens when the
  seed itself reaches a later binding. Rec: E-SCOPE-001 for a read of a cell before its place whose seed reaches a binding
  whose place is after the read (the item-2 rule through the seed), measured before landing.
- LOW-1: §7.6 rule (b) S482 + §66.7.6 bullet state the persisted-cell carve-out, INTERIM, gap
  g-boot-persist-seed-at-construction-s482 (capable alternative: restore at construction; on empty storage compute the
  default at the place).
- INFO: runtime.js seeding-cycle message updated (seeds run at their place or on an earlier read).

## r2 (fix round for the r1 re-review, verdict FIX) — S482

- Merged origin/main twice (1393a1539 → `1d26a35e6`; ea04fc7b0 → `240c81d61`), clean, no new `while` in self-host.
- MED-A (introduced in r1) FIXED (`6a2d74fec`): analyze.scrml fileScopePass builds a body-run closure `usesR`
  (:11427) from each function's reads and refs OUTSIDE its nested function declarations (heldSpansIn; refs via
  heldRefTargets :12011), so a nested declaration counts only through a call of it or its use as a value (an edge
  to its own node), at every depth; bodyReachDiags judges on usesR (:11477). Messages name the real path
  ("calls `h()`, which reaches `inner()`, which uses `k`"). Tests "B r2" (9): 8 red on 0548d92e4 (the 9th, a direct
  read beside a never-called nested decl, is a guard green on both). Chromium: m-nested-decl r1 E-SCOPE-001 →
  head `1 | 7` (= main); r2-two-level r1 refused → `2 | 7`; r2-called / r2-lam-call / m-nested-ret still
  E-SCOPE-001 with the inner function named.
- LOW (host-handed function value) — PA ruled keep fail-closed: §7.6 (b) S482 r2 sentence + ⚑ INTERIM; gap
  g-boot-body-reach-host-fn-value-s482 (LOW, prov=pa-ruled; capable alternative = host signatures declaring
  sync/async callback use) (`18026b452`).
- MED-2 given its own id g-boot-seed-read-early-reach-s482 (MED, open owner question), cross-referenced from P2.
- Gates on 240c81d61: pretest exit 0; bootstrap-conformance base ea04fc7b0 → head PASS 772→778 (the 6 branch
  cases), FAIL 3→3 same, CRASH 0; corpus 2968 files: 0 newly rejected, code changes only on 3 already-failing
  files (as r1), 2 byte diffs (reactive/no-write-{field,own}-init-neg — item A held seeds, as r1); PR tests 109/0;
  s34-census PASS, types-gate unchanged, snippet/claim 0 failed, corpus floor PASS, md-shim + severity current.
  119 probes base vs head in Chromium: only the r0/r1 expected changes + r2 probes.
