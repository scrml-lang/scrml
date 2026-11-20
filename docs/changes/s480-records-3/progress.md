# s480-records-3 — progress

Base: origin/main 1765c43a2. Ruling: user-voice-scrml.md "⭐ RULED — bootstrap census build order, carve-out 2
widening, four smaller questions, PA recs adopted (S480, 2026-11-20)" items 6–9
(`ruling:user-voice-scrml.md-S480-census-recs`).

- [x] Item 6 — §7.3.5: `@.` counts as a read of `as r` (ruled bullet added; no lane-reading marker existed).
- [x] Item 7 — §7.3.5 `<onchange>` arm binders SHALL be reported (built with the channel); gap marked ruled, open.
- [x] Item 8 — §34 E-TYPE-004 row reworded; s34-census --check-new PASS.
- [x] Item 9 — §4.15 reserves the cell names db / schema / md (E-NAME-COLLIDES-RESERVED); bootstrap
      `programFields` / `reservedCellName`; test reserved-cells-s480.test.js; conformance
      components/name-collides-reserved-cell-{neg,pos}; impl#1 carried gap. Corpus count 0.
- [x] Records 1–8 filed (see docs/known-gaps.md §S480-records-3); handler-pipeless-arms-rt description fixed;
      fn-count scaling bound indep/chain 10× → 8× (compile-scaling-fn-count-s480.test.js — the bound is there,
      not in shared-graph-walks-s480.test.js).
- [x] §4.15 endpoint owning-locus sentence: already fixed on main (S480 parenthetical) — dropped.
- [ ] Final gates, PR.
