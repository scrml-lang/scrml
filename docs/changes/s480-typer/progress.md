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
- [x] Conformance case linear/bare-arrow-binding-called-pos (impl#1 xfail pins the carried gap; bootstrap UNSUPPORTED, as `const`).
- [x] FINAL gates at 939767fe2: hook PASS (56938 pass / 0 fail); conformance base→head PASS 732→732, FAIL 0, CRASH 0,
      UNSUPPORTED 556→557 (the new case only), 0 PASS→FAIL; corpus 3214 files old vs new bootstrap: 0 newly rejecting,
      byte-identical artifacts except tapes/join-primitives (new); s34-census / types-gate / snippet-gate / claim-gate /
      corpus-compile-floor / gen-md-shim / severity --check all pass.
- [ ] PR.

## r1 fix round (#2006 review LAND-W-F/U)
- [x] host-global: pinned `[esm] linear/bare-arrow-binding-called-pos` (impl#1 xfail throw) in scripts/host-global-scan.known-throws.txt.
- [x] §42.3.5 provenance: records the newly-rejecting edge (counted head re-testing an already-narrowed place →
      E-COND-NOT-BOOLEAN, §42.4 st.4); corpus 0 of 3216 files have a counted head whose middle clause is a bare place.
      Message for a narrowed place now names the redundant test (analyze.scrml condKnown). Tests pinned.
- [x] runtime joinStr writes each element via textOf (fail closed); unit test.
- [x] resolveForStep: `addDiag(resolveExpr(...))` passed an RX where an AS goes → `.st` (crash `st.diags.concat` → diagnostic). Test.
- [ ] shared-graph-walks-s480 kr24 flake (item 5).
