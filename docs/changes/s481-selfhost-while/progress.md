# s481-selfhost-while — progress

Builds on #2043 (merged 1c2c4fbbe). PA decision S481: INTERIM impl#1-compilable loop spelling for the self-host.

- [x] Base measured (origin/main 1c2c4fbbe): bootstrap own-file errors 21,585 (project 73,456);
      first own error E-LOOP-WHILE-RETIRED in 18/28 — reproduces #2043's table exactly.
- [x] Item 1: `interim` option (fix-loops.js) / `loopInterim` (fixS66) / `--loop-interim` (CLI): writes
      `for (; c; )` and `for (;;) { S if (!(c)) { break; } }`. Tests in fix-loops.test.js.
- [x] Item 2 (LOW-1): `~{}` / `^{}` loops noted (one note per loop word).
- [x] Item 3 (LOW-2): capture guard reads every declarator; lin / const / var / fn / class / cell openers.
- [ ] Item 4: self-host migration (tool output, separate commit) + gates.
- [ ] Item 5: CI checks on final head; PR.
