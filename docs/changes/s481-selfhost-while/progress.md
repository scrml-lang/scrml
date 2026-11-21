# s481-selfhost-while — progress

Builds on #2043 (merged 1c2c4fbbe). PA decision S481: INTERIM impl#1-compilable loop spelling for the self-host.

- [x] Base measured (origin/main 1c2c4fbbe): bootstrap own-file errors 21,585 (project 73,456);
      first own error E-LOOP-WHILE-RETIRED in 18/28 — reproduces #2043's table exactly.
- [x] Item 1: `interim` option (fix-loops.js) / `loopInterim` (fixS66) / `--loop-interim` (CLI): writes
      `for (; c; )` and `for (;;) { S if (!(c)) { break; } }`. Tests in fix-loops.test.js.
- [x] Item 2 (LOW-1): `~{}` / `^{}` loops noted (one note per loop word).
- [x] Item 3 (LOW-2): capture guard reads every declarator; lin / const / var / fn / class / cell openers.
- [x] Measured: impl#1 unquotes string literals in any C-style `for` head (g-impl1-c-for-head-…-s470):
      the first CLI run withdrew `while (… == "")` / `>= "0"` loops and ran out of verify budget on
      analyze. Literal heads now take the top-check spelling `for (;;) { if (!(c)) { break; } … }`;
      canonicalLoops folds it (230ecd14b).
- [x] Item 4: migration d1877b9b4 (tool output; re-run byte-identical). 658 loops / 21 files (584 counted,
      74 top-check); 4 braceless `while` in parse.scrml reported. Bundle: 30 chunks, 0 canonical diffs.
      Bootstrap: E-LOOP-WHILE-RETIRED 457 → 4; own errors 21,585 → 26,244 (loop bodies now analyzed:
      E-WRITE-NOT-GRANTED +4,590 — the ruled `for (cond)` gives the same on a probe).
- [ ] Item 5: final gates (pretest, conformance vs base, CI checks list); PR.
