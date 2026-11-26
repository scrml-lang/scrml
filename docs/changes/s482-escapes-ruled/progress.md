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
