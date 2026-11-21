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
