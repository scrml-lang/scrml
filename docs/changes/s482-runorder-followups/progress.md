# s482-runorder-followups — progress

Brief: ~/.cache/scrml/review/s482-briefs/runorder-followups.md (items A–F). Base origin/main a27564881 (#2041 merged).
Scratch: ~/.cache/scrml/review/s482-runorder-followups/ (probes p/, harness h/, Chromium runner h/pw2.ts).

## E — #2041 r2 LOW-1 (textarea anchor)
- Verified in Chromium first (h/pw2.ts): `<textarea id="t">${ const a = note("a"); }</textarea>` → value `<!--run-->`.
- Fix: lower.scrml `isTextOnlyElem` (textarea / title / script / style) — lowerPlaced puts the place after it.
- Chromium after: value "", log "a". Test slice-m4/runorder-followups-s482.test.js "E" (3 red on base, green on head).
- Pre-existing sibling checked: `<textarea>${@x}</textarea>` works in Chromium by luck (the hole's text node is
  replaced); `<textarea>a ${@x} b</textarea>` CRASHES the whole page in Chromium (`rt.at(root,0,1)` undefined —
  one RCDATA text node). Different root (hole lowering of RCDATA content, not lowerPlaced) — filed, not fixed.
