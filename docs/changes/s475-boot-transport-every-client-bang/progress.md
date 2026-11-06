# s475-boot-transport-every-client-bang — progress (append-only)

- 2026-11-06 start: worktree at origin/main 19fc95a24. Ruling: user-voice-scrml.md "⭐ RULED — S475 owner questions, PA recs adopted wholesale (S475, 2026-11-06)" item 4.
- 2026-11-06 probe (base): an uncomposed client `! E` fn with `s(x)?` (s a `! E` server fn, nothing after it that can fail) → E-ERROR-010 at the `?` (+ E-TYPE-VARIANT at a caller's `.Transport` arm); same via a client `?`-propagating caller; built-in `! SqlError` likewise. Composed fns were already carriers (#1760).
- 2026-11-06 change: analyze.scrml `transportCarriers` seeds every client-placed `!` fn that `?`-propagates a call of a server-placed fn (`isServerPlaced`), plus the existing fixpoint. Functions that HANDLE their server calls stay non-carriers (reading; see report).
- 2026-11-06 tests: slice-m4/transport-every-client-bang-s475.test.js — 12 pass head, 9 fail / 3 pass base (the 3 base-passing are stays-refused / unchanged pins). Two pins rewritten (caller-transport-s475, server-call-core S2): the retired §19.5.3 bullet 3 E-ERROR-010.
- 2026-11-06 commit 1 hook: shard 1 killed at the memory ceiling (3351 MB > 3072) and a spawn in shard 0 returned exit null (killed) — infra, not a test failure; retried with SCRML_HOOK_SHARDS=1. failT test moved its `fail` before the call (a later one composes, so it did not exercise the uncomposed path). Gap + coverage rows updated. Base corpus sweep: 2,252 files.
- 2026-11-06 commit 38d6a90ae (hook SCRML_HOOK_SHARDS=1: 47411/0, slices 6352/0, lowered 157/0).
- 2026-11-06 corpus (reviewer corpus.ts, scrml-boot compileSource over examples, conformance/cases, acceptance, slice-m2/src, slice-m4/src — 2,252 files) base b880c9bd6 vs head: 0 fingerprint changes (verdict, codes, messages). No corpus file has the newly-accepted shape.
- 2026-11-06 bootstrap-conformance: PASS 302 / FAIL 238 / NOT-TWINNED 685 / UNSUPPORTED 602 / CRASH 0 on both; reports identical but for the timing line.
- 2026-11-06 CI gates: severity current; types-gate OK unchanged (182); s34-census PASS; spec-coverage 0 violations (totals block STALE → bot); e2e-render-map 259/0.
- g-boot-tail-recursive-bang-fn-over-refused-s475: NOT touched — the carrier change does not touch viaOneComposed (the brief's condition), so the hint stays; open.
