# s478-ruled-fn-types — progress

Lane: S478 open-Qs rulings items 3–8 (user-voice "⭐ RULED — open owner questions, PA recs adopted
wholesale (S478, 2026-11-17)"), gap `g-boot-fn-values-residue-s478` owner questions 1–6.
Branch `s478-ruled-fn-types`, base b04fdc27a. Scratch: `~/.cache/scrml/review/s478-ruled-fn-types/`.

## Plan
1. SPEC text for items 3–8 (§7.5, §7.5.1, §7.3.4, §12.5.3, §19.4.3, §48.6.3, §14.3, §34).
2. Item 5 (Q3): `->` / `fn()` in a type → E-PARSE-TYPE with the named fix; migrate 3 conformance cases.
3. Item 8 (Q6): function-typed server result → E-ROUTE-003 (§12.5.3 already names it; see owner Q).
4. Item 4 (Q2): pure function type `fn (x: T) => R`.
5. Item 3 (Q1): failable function type `(x: T)! E => R`.
6. Tests, gates, corpus, PR.

## Status
- [ ] SPEC
