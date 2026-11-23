# s482-markup-value-lowa — progress

Follow-up to the #2085 review (~/.cache/scrml/review/s482-2085/review.md): LOW-A, NIT-1, NIT-2.
Bootstrap only (compiler/self-host-v2/lex.scrml, parse.scrml). All on input that is already refused.

## Items
- LOW-A — FIXED. lex.scrml markupExtentFrom (terse / attribute-value mode only): a body-text `}`
  that no body-text `{` opened closes the value before the element does, so the walker answers
  "never closed" (src.length) and markupAttrValueEnd returns -1. Braces after a `//` comment
  (§27.1 position: line start or after whitespace) do not count. The token path (terse=false) is
  unchanged. a01 / a13 now give the block reading (4 / 3 errors, the same reading as the
  out-of-slot `{<count>}`), no span overrun, no `<program>` never closed.
- NIT-1 — FIXED. skippedDecls names nothing inside an arrow body `=> { … }` opened in the skipped
  text (inArrowBodyIn). Pinned `extra(⏎ y = 1;⏎)` still named. Same-line `{ a = 1; b = 2; }` is
  untouched (stmtStartIn unchanged).
- NIT-2 — LEFT. `/}` in body text is the terse closer by §19.6.2; output equals base. Recorded.

## Log
- probes: ~/.cache/scrml/review/s482-lowa/ (p/, l/, out-*.txt)
- tests: slice-m4/parser-lows-fu-s482.test.js — head all pass; base 3 red (LOW-A ×2, NIT-1).
