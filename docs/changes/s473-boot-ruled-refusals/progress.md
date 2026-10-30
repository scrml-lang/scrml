# s473-boot-ruled-refusals — progress

Lane A (S473): the compile-time refusals bryan ruled in S473, bootstrap only (compiler/self-host-v2).
SPEC text: PR #1682 (s473-spec-audit-rulings) — codes and wording taken from it.
Tests: compiler/self-host-v2/slice-m4/ruled-refusals-s473.test.js.

## Status
- [x] 1 transitive query envelope (txQuerySets + envelopeDiags, analyze.scrml)
- [ ] 2 E-SQL-JOURNAL-OFF
- [ ] 3 D11 slots
- [ ] 4 D12 O51
- [ ] 5 D13 I-TAILWIND-NOT-BUILT
- [ ] 6 D14 cell-named local
- [ ] 7 legacy key=
- [ ] 8 E-SQL-SLOT-IN-LITERAL / E-PARAM-TYPE-REQUIRED
- [ ] 9 D10 E-ASSIGN-POSITION confirm
- [ ] corpus delta, gaps, coverage, regen, gates, PR
