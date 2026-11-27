# s483-q8-fu — progress

Source: #2129 r1 re-review (MED-1, LOW-1). Branch s483-q8-fu off origin/main 22a6a42a9 (contains #2129).

- [x] MED-1 analyze.scrml: callTrapWhat → lengthTrapWhat / textFitsLit / recvLitLen (literal repeat count / pad width a site unless the result length is provable)
- [x] MED-1 print.scrml: primTraps → textFitsCore mirror (literal receiver only; over-keeping harmless)
- [x] LOW-1 analyze.scrml: divTrapWhat accepts `%` by a divisor typed `number` on every branch (numberOnly); message cites the governing clause
- [x] SPEC §7.6 rule (b) S483 sentence corrected; `%` clause; known-gaps entry updated
- [x] probes base/head (t01..t06, p26 + regressions + q01..q11): t01/t02/t06 refused; t03/t04 kept and trap (= t05); p26 accepted
- [x] slice-m4 trapping-construct-init-s483.test.js: 74 pass (q8-fu describes added)
- [x] conformance body-top: 3 new cases (2 neg, impl#1 xfail g-impl1-init-in-construct-s482; 1 pos) — impl#1 runAll body-top 31 pass / 16 xfail / 0 fail / 0 xpass
- [x] bootstrap-conformance --json: CRASH 0/0; PASS 872 → 875; only the 3 new cases differ
- [x] corpus differential (2998 files): 0 crash, 0 newly rejected/accepted, 0 diag/msg diffs, 0 byte diffs over 330 compiling on both → 0 newly trapping
- [x] Chromium s482/s483 (15 files): 102 pass / 0 fail (3 new q8-fu tests)
- [x] host-global-scan --check mode-shard 1/2 and 2/2: exit 0, 0 violations; throws all pinned (none from the new cases)
- [x] slice-m4 set (14 files: every E-FILE-SCOPE-INIT-IN-CONSTRUCT test, run-order, client-roots, secret / server-only, math-port): 352 pass / 0 fail
- [ ] PR (#2128 still OPEN at start → note in PR body)
