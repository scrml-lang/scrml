# s482-escapes-ruled — progress

Branch `s482-escapes-ruled` from origin/main 7de593ce0. Bootstrap-only (compiler/self-host-v2/); compiler/src untouched.

Ruling (user-voice-scrml.md, verbatim heading): "⭐ RULED — a backslash in a quoted attribute / opener value follows the
§4.18.3 escape catalog (S482, 2026-11-26)" — "RULED yes (B). Gap markers cite
`ruling:user-voice-scrml.md-S482-quoted-value-escapes-catalog`."

## Items

1. INTERIM → ruled rule. SPEC §4.18.3 (cross-ref), §5.2 bullet, §6.15 fix-it sentence, §34 E-PARSE-001 row, §66.2.4 note.
   Gaps: g-boot-opener-string-escapes-s482 resolved; duplicate g-boot-opener-quoted-value-escapes-dropped-s478 resolved;
   new g-impl1-quoted-value-escapes-content-s482 (impl#1 divergence, filed not fixed).
2. parseQuoted comment.
3. E-PARSE-001 message: emit context, `\'` hint.
4. L1: tape fix-it misses `write` when a refused position write happens.
5. #2107 r2 F1 / INFO-1 / INFO-2 — verify (closed by #2110?).

## Log

- [x] item 1 SPEC + gap markers (commit 1)
- [x] items 2+3: parseQuoted comment rewritten to the ruled rule; quotedEscMsg(n, q, emitted) — no "not decided",
      a `\'` hint per quote style, emit-specific advice in FRAGMENT MODE (fragOn). `\'` is NOT in the §4.18.3 catalog
      ("exactly three escape sequences, and no others") — kept refused. opener-escapes-s482.test.js 20/20.
- [x] item 4 (#2110 L1): resolveLocalPartWrite records the EAssignLocal effect with a refused position write's
      grant error, so writeGrantsOf adds `write`. Probes (tools/l1.ts, base vs head): append/method/filter + position
      write fix-its now `[free, append|remove, write]` and compile applied; same error codes; a lone refused position
      write now also gets W-DISPLAY-UNTRACKED (`int[write]`). Tape slices 560/560; display-untracked 34/34.
- [x] item 5: already closed by #2110 — verified, no change. F1: `xs = [...xs, 4]` → `[free, append]`,
      `int[replace]` → `[replace, free, append]`, filter → `[free, remove]`, each applied compiles (tools/l1.ts).
      INFO-1: strEscaped spells lone surrogates / U+2028 / U+2029 as `\uXXXX` (display-untracked-s482 test
      "r2 INFO-1" passes). INFO-2: §6.15 and the §34 W-DISPLAY-UNTRACKED row carry "PA reading, prov=pa-ruled —
      #2107 r2 review INFO-2" for the meta.subscribe exemption.

## Gates (head = this branch, base = origin/main 7de593ce0; tools in ~/.cache/scrml/review/s482-escapes-ruled/)

- #2110 12×20 escape matrix: 36 SAME (byte-identical), 204+12 both-error same codes, 0 value change, 0 newly
  accepted, 0 warning diffs; 143 message diffs, all E-PARSE-001 (the intended text).
- #2110 probes (emit e1–e9, recovery, each, if, typed attrs): verdicts and codes identical.
- corpus (3441 files): 482 compile on both; 0 ok flips, 0 code diffs, 0 warning diffs, 0 byte diffs (whole result
  minus `ms`); 1 message diff (prop-substitution-string-escapes, E-PARSE-001 text).
- bootstrap-conformance --json: PASS 851 / FAIL 3 / NT 628 / UNS 491 / CRASH 0 on both; 0 verdict diffs.
- s34-census --check-new --base 7de593ce0 PASS; gen-bootstrap-severity --check current; types-gate --check OK;
  retired-forms-lint --base-ref OK; snippet-gate 120/0/9; spec-coverage-check 0 violations; delta-lint PASS.
- Chromium (SCRML_BROWSER_TESTS=1): opener-escapes + display-untracked browser files 4/4, 29 expects.
