# s472-boot-style-attr-guard — progress

Gap: `g-bootstrap-style-attr-bound-value-unguarded-s469` (MED). Branch `s472-boot-style-attr-guard` from origin/main.

## Reading

SPEC §65.4.2 (the `style=` value-shape table) is the rule for a bound `style=` value:

> `style=<expr>` where `<expr>` is neither a quoted string literal nor a `style`-typed value/list SHALL emit `E-STYLE-VALUE-NOT-STYLE`. Dynamic raw CSS is **only** the quoted-literal form — you cannot apply an arbitrary runtime string as a style-value (that would reopen the injection surface).

The bootstrap has no `style` type (a `#{}` in expression position, §65.4.1, is not in it), so every
`style=(expr)` / `style=@x` / `style=name` is a non-style value: E-STYLE-VALUE-NOT-STYLE at compile time.
That is stricter than the gap's recommended runtime `cssDeclarationsOf` guard, which would admit
exactly what §65.4.2 forbids (an arbitrary runtime string applied as a style). The bootstrap has no
SSR of bound attributes (a bound value is written only by the client), so the compile refusal covers
both outputs; a runtime wall in `rt.attr` refuses a `style` write too (defense in depth).

## Steps
- [x] analyze.scrml: refuse `style=` from data (E-STYLE-VALUE-NOT-STYLE); show= writer-conflict advice fixed
- [x] parse.scrml: quoted `style="…${}…"` hint no longer steers to `style=(…)`
- [x] runtime.js: `attr` refuses a `style` write (fail closed)
- [x] §34 row for E-STYLE-VALUE-NOT-STYLE; severity.scrml regen (also picked up E-IMPORT-003/008/009, stale on main); SPEC-INDEX
- [x] tests: slice-m4/style-attr-guard-s472.test.js — 46 tests, 42 red on main (the 4 green: title still written, braced refused, two benign); show.test.js + sink-guards.test.js expectations flipped
- [x] gap resolved (known-gaps marker; state.ts --write: counts already current — one MED resolved, one MED filed); bootstrap-conformance.md --write: no change
- [x] filed g-impl1-style-attr-bound-value-unguarded-s472 (impl#1 has the same hole; S471 TS policy — not a lane)
- [ ] merge origin/main; final gates
