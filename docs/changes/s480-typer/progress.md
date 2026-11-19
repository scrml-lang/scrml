# s480-typer — progress

Ruled items (user-voice-scrml.md S479 "⭐ RULED — the rest of S478 hand-off §3.B", items 11 / 13 / 25).

- [x] Item 13 — `join(sep)` on primitive / unit-enum tapes (analyze.scrml `methodOp` + `hasOneText` + `noTextWhat`);
      refusal E-TYPE-031 names `xs.map(fmt).join(sep)`. SPEC §66.12.6 rule 3 paragraph; §34 E-TYPE-031 row cites §66.12.6.
      Acceptance `tapes/neg-join-int` → `tapes/neg-join-struct`; `tapes/join-primitives` added.
      `call-source-types-s476.test.js` join test flipped.
- [x] Item 11 — SPEC §42.3.5 loop bullet (PERMANENT back-edge reading) + INTERIM nested-fn sub-bullet; §42.4 statement 2
      names the presence-test `for` body. Presence-head narrowing was ALREADY BUILT (s469 typeLoopCond/typeCounted).
      Found + fixed: a counted head (`for (init; cond; step)`) dropped every cell narrowing in its body (tDeferEnv) even
      where the loop writes nothing — now `tCountedEnv` keeps tLoopEnv's cell narrowings.
      Gap filed: g-boot-nested-fn-call-ends-every-narrowing-s480 (INTERIM).
- [x] Item 25 — already built in the bootstrap (#1961 + §50.8.5 keywordless = const). Pins only. Gap
      g-bare-arrow-binding-false-e-mu-001 → status carried (impl#1 still false-errors; frozen).
- Tests: slice-m4/typer-rulings-s480.test.js (26; 10 red on base, 16 pins green on base).
- [ ] FINAL gates, conformance, byte-compare, corpus, PR.
