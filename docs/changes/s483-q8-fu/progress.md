# s483-q8-fu — progress

Source: #2129 r1 re-review (MED-1, LOW-1). Branch s483-q8-fu off origin/main 22a6a42a9 (contains #2129).

- [x] MED-1 analyze.scrml: callTrapWhat → lengthTrapWhat / textFitsLit / recvLitLen (literal repeat count / pad width a site unless the result length is provable)
- [x] MED-1 print.scrml: primTraps → textFitsCore mirror (literal receiver only; over-keeping harmless)
- [x] LOW-1 analyze.scrml: divTrapWhat accepts `%` by a divisor typed `number` on every branch (numberOnly); message cites the governing clause
- [x] SPEC §7.6 rule (b) S483 sentence corrected; `%` clause; known-gaps entry updated
- [ ] probes base/head (t01..t06, p26 + regressions)
- [ ] conformance body-top cases (+ impl#1 xfail pins)
- [ ] gates: bootstrap-conformance, corpus differential + Chromium, host-global-scan x2, Chromium s482/s483, slice-m4
- [ ] PR (#2128 still OPEN at start → note in PR body)
