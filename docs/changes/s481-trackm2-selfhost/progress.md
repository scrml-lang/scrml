# s481-trackm2-selfhost — progress

Track M step 2 (user-voice-scrml.md S480 "⭐ RULED — bootstrap census build order", item 1).

- [x] Precondition measured: impl#1 refuses `for (cond) { … }` (E-IMPL1-RULED-FORM-UNSUPPORTED, §49.8).
      impl#1 compiles `for (; cond; )` to the same JS as `while (cond)` (modulo the head). The bootstrap
      accepts `for (cond)`, `for (; cond; )`, `for (;;)` and `for { … }`.
      => item 1's self-host application STOPPED; owner question filed in the PR body.
- [x] Item 1: `loop-while` / `loop-do-while` rules (compiler/src/commands/fix-loops.js) + tests
      (compiler/tests/commands/fix-loops.test.js). Opt-in (S66_RULES / RULED_ONLY_RULES), not impl#1-safe.
- [x] Item 2: self-host migration with stmt-semi + arm-comma only (2868687f2, tool output; bundle
      byte-identical). severity.scrml via its generator (generator emits the ruled `,` / `;`).
- [x] Item 3: residual census (62 reports: keyword-named members / `server` 26, `from` 9,
      multi-line `|` heads 27) — in the PR body.
- [ ] Final gates: pretest, bootstrap-conformance, CI checks job, PR.
