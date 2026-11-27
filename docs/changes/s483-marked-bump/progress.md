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
- unit suite 93/93 (was 90; 7 marked-14-pinned tests rewritten to marked-18 truth + 3 new).
- r3rev a-set (rebuilt runner .tmp/a-set.sh from s482-2101-r5/probe/a-set.sh, git-free restore): 24/24 exit 1,
  byte-identical to r5's a-set.out (first 200 cols).
- r4rev b-set (s482-2101-r5/probe/b-set.ts): identical to r5 except b04/b04b now READ (b04 line 4 positive,
  b04b marked by its marker) instead of exit 2; b27 = known probe construction error.
- classify fuzz seeds 11/23: 20000/20000 gate=commonmark, 0 exit2 (was 129/132), 0 fail-open, 0 line
  mismatch; lazy class 161/159 → 0 exit2, 0 fail-open; marked18 vs cm 40000/40000.
- wide generator (17 prefixes x 22 line kinds, 50k x seeds 11/23): 0 fail-open, 0 mismatch, exit2 2551/2553
  (pre-fix on 18: 5525/5524; marked 14: 11049/11050, plus 1 line mismatch on seed 23) → new gap
  g-tool-retired-lint-marked18-residual-s483.

## Step 4 — real repo gate
- `--base-ref origin/main`: exit 0, 5462 hits, table identical; `--json` hits array identical to marked 14.

## Step 5 — gap resolved; new residual gap; SPEC §63 known-limit sentence rewritten (same line count).

## Step 6 — other consumers
- Only importers: scripts/retired-forms-lint.ts, its unit test, docs/build.ts. SPEC-INDEX / maps tooling do not
  import marked. docs/build.ts: same output on 14 and 18 (exit 1 "no articles matched" — no inputs since S469).
- Rendered the 24 articles (docs/articles/*.md + archive devto) with marked.parse on 14 vs 18: 4 diffs —
  3 whitespace-only (no blank line after an HTML-comment block), 1 structural (css-without-build-step: the
  `2.` list after a blockquote) where 18 matches commonmark.js and 14 did not.
