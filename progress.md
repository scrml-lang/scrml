# s483-self-render r2 progress (fix-2139-r2)
- merged origin/main into 7eaeb9dc9 (clean).
- item 1 (HIGH-1): throughCycle rewritten — hops carry `own` (new instance crossed via a use);
  guards on own writable state end the path unless every branch leads back. q01 compiles.
- message: starCycleMsg no longer says "same instance" when a use is crossed.
- item 3 (MED-1): everyBranch intersects each branch's closure (reach table over unconditional hops,
  least fixed point in selfMountPass); synthetic hop dropped when a kept every-branch hop already reaches it.
- every-branch walk-through of an own-state guard: sub-search counts reaching ANY `<*g/>` of the start's
  field (StarGoal.key) — without it a1/a2/a3 (two `<*ph/>`) were missed and the printer hung.
- SPEC §66.6.2 rule 1/2 + §34 rows + r1 direction corrected + r2 amendment; gaps: q22 owner question
  filed, constant-guard gap extended (initB). Message uses `bool`. Probe table base/r1/r2 done.
- tests: slice-m4 r2 describes (68 pass), Chromium r2 describe, 2 conformance cases + impl#1 pins.
