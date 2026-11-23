# s482-parser-lows-fu — progress

Lane: the three LOWs of the #2083 review (`~/.cache/scrml/review/s482-2083/review.md`), base origin/main 491c87a38.
Scratch: `~/.cache/scrml/review/s482-fu/` (base tree, probes `p/`, outputs).

- [x] LOW-1 — markup attribute value only when the element CLOSES before the value's `}`
  (`parse.scrml` markupAttrValueEnd); errorBoundary named only on `fallback=`.
- [x] LOW-2 — the element's extent from the lexer's markup-value walker (`lex.scrml` markupAttrValueExtentAt =
  markupValueExtentAt + terse `/}`), so `}` in quoted attrs / `${}` slots / comments / text does not end it.
- [x] LOW-3 — skippedDecls: keywordless binding only at depth 0 or `;`-terminated in a group; destructuring
  default not re-listed; pattern rendered as spaced in source.
- [x] slice test `compiler/self-host-v2/slice-m4/parser-lows-fu-s482.test.js`.
- [x] gap entry notes (g-boot-e-type-045-in-misread-markup-s479 stays open; alias entry note).
- [x] gates (head vs base 491c87a38): new test base 4 pass / 14 fail, head 18 pass; conformance identical buckets
  (PASS 845 · FAIL 4 · NOT-TWINNED 628 · UNSUPPORTED 491 · CRASH 0), 13 cases change only the fallback= message text;
  corpus 2972 files 0 newly rejected / accepted, 0 byte diffs, 0 code changes; pretest, s34-census, types-gate,
  corpus-compile-floor, snippet-gate, claim-gate, e2e-render-map (259) green; related slice-m4 452 pass.
- [ ] commit, push, PR.
