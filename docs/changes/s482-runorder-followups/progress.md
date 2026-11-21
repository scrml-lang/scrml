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

## A — next (seeds in place)
