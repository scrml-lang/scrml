# s482-value-no-write — progress

Lane: run-order model (c) — ruling:user-voice-scrml.md-S482-runorder-model-c ("yes, adopt (c) with
the riders"); study ~/.cache/scrml/review/s482-runorder-study/study.md. Bootstrap-only
(compiler/self-host-v2/), SPEC + gaps. Base: origin/main 30058448c. impl#1 not changed (S471).

- [ ] 1. A1 — §6.15 value-position judge widened to file-scope `let`s (+ placeless initializers,
      runtime `^{}` in a construct (Q5 rider), writing locked-field / attribute default (Q13 rider))
- [ ] 2. A2 — spine writers stay legal (tests: S479 tick(), S481 P1–P3)
- [ ] 3. A3 — E-DERIVED-READS-UNTRACKED (§34 row, gen-bootstrap-severity)
- [ ] 4. INTERIM removal (construct write-side enumeration), probes base vs head
- [ ] 5. SPEC §6.15 / §7.6 (b) model R1–R6 / §6.7.4 / §34
- [ ] gates, PR (not merged)
