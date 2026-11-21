# s481-body-run-order — progress

Ruling: user-voice-scrml.md "⭐ RULED — program-body run order: one source-ordered sequence (#2025 review P1–P3),
PA rec adopted (S481)". Cite: `ruling:user-voice-scrml.md-S481-body-run-order`.

## Done
- SPEC §7.6 rule (b), §7.6.1, §40.8, the §5 interpolation one-shot bullet: one source-ordered body (S481 provenance).
- Core `View.Init(k)` (core.scrml) — the place of a program-body file-scope binding; arms in walk / measure /
  lower / check / print.
- lower.scrml `programMarks` / `lowerMarked`: an Init at each binding's place in the program's renders.
- print.scrml `bodyInits` (in sequence / early / server-only) and `clientConsts` (every unread initializer runs).
- Tests: slice-m4/body-run-order-s481.test.js (4 red on base 0d775f390, all green on head);
  file-scope-init-s479.test.js assertions updated to the S481 client form.
- Conformance: body-top/file-scope-unread-init-runs (impl#1 xfail E-ROUTE-001), body-top/file-scope-init-after-body-write,
  body-top/free-display-reads-in-place (impl#1 xfail runtime) — gap g-impl1-body-run-order-s481 (carried).

## Open (owner questions)
- Where cell construction (a cell's seed, a component's use-site value — §66.7.6 rule 5) sits in the sequence.
- What a display / statement reads when a function it calls reaches a binding whose place is later.

## r1 (#2041 S239 review)
- H1+M1: print.scrml `serverInits` (on `callsServerOnly` + `constsReached`): an unread initializer reaching
  server-only code is server-only — out of the client (bodyInits / clientConsts), run by the server
  (print-server.scrml `serverConsts` / `serverReach`). Tests a7/a1/a5/a6 (client files grepped; server module imported).
- M2: bodyInits `pre` = only declarations the program constructs (`constructedDecls`). b4 → 5; b3 pinned 1 (⚑).
- L1: analyze `programChainGaps` — a `${ }` declaration between if-chain members is E-CTRL-001 (§17.1.1 as written; impl#1 agrees). Judged by source span: a function declared inside a member is hoisted to a later program item but does not break the chain (conformance server-fn/branch-declared-server-fn-routes-to-server caught the first, order-based version).
- L2: analyze.scrml E-BOOTSTRAP-UNSUPPORTED client-only-state message reworded to S481 rule (b).
- SPEC §7.6 rule (b): the two struck sentences, server-only rule + S481 r1 provenance; INTERIM narrowed; §17.1.1 clarifying sentence.
