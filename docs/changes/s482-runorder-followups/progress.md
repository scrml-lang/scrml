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
