# s483-marked-bump — progress (lane scratch; dropped from the PR, copy kept at ~/.cache/scrml/review/s483-marked-bump/progress.md)

Brief: ~/.cache/scrml/review/s483-briefs/lane-marked-bump.md. Gap: g-tool-retired-lint-marked-bump-s482.

## Step 1 — version
- Today 2026-11-27; cutoff 2026-11-13. Newest 18.x on/before it: **18.2.0 (2026-11-09T23:05:41Z)**
  (18.2.1 2026-11-16 and 18.3.0 2026-11-24 are under 14 days). Pinned exactly; bun.lock integrity
  sha512-KaeL+tAb… equals `npm view marked@18.2.0 dist.integrity`.

## Step 2 — wrappers vs marked 18 internals (node_modules/marked/lib/marked.esm.js)
- Lexer constructor: fresh Tokenizer per Lexer when options carry none; `tokenizer.lexer = this` — same as 14.
- `blockTokens(src, tokens = [], lastParagraphClipped = false)` — same signature; called 4x (lex, blockquote
  segment `this.lexer.blockTokens(u, r, !0)`, list item `this.lexer.blockTokens(u.text, [])`) — same as 14.
- `this.tokenizer.{fences,heading,lheading,blockquote,list}(e)` from blockTokens, `this.blockquote(` /
  `this.list(` re-reads inside blockquote — same call topology as 14. `e = e.substring(r.raw.length)` cursor.
- `codeBlockStyle:"indented"` still marks indented code.
- Change found: blockquote re-read splices `text` as `i.substring(0, i.length - g.text.length) + m.text`
  (nested token's text length, not the outer's) → outer `text` garbled, segment 1 no longer text-matches →
  the r4 fuzz's 129/132 exit-2 docs. Fix: frame 0 placed at the blockquote's line by construction.

## Step 3 — re-prove
(see below as filled)
