# s479-engine-timing — progress

Ruling: scrml-support/user-voice-scrml.md "⭐ RULED — the rest of S478 hand-off §3.B, PA recs adopted (S479, 2026-11-18)", items 7 and 8.
Branch `s479-engine-timing` off origin/main 8d432fcf3.

Baseline bootstrap conformance (base): PASS 651 · FAIL 6 · NOT-TWINNED 637 · UNSUPPORTED 576 · CRASH 0.

## Item 7 — g-boot-engine-self-write-outside-lint-s478 (DONE)
- SPEC §51.0.F.1: outside-state-child CONSERVATIVE bullet struck + replaced ("does NOT fire"); §34 W-ENGINE-SELF-WRITE-DETECTED row amended.
- Bootstrap: never emitted the outside half — only the INTERIM comment in analyze `literalStateWrite` changed. Slice test added (engine.test.js).
- Conformance: engine/self-write-outside-state-child-neg (bootstrap twin PASS expected; impl#1 XFAIL, new carried gap g-impl1-engine-self-write-outside-lint-s479).
- Gaps: g-boot-engine-self-write-outside-lint-s478 + g-boot-engine-self-write-lint-absent-s473 resolved.
- Website page W-ENGINE-SELF-WRITE-DETECTED updated.
- No conformance case pinned the outside firing (grep of expected.json: only self-write-pos/neg + self-target-ontransition-pos, all inside-state-child).

## Item 8 — g-boot-timing-compositions-s478 (engine part) (DONE, committed with item-8 commit)
- SPEC §6.13.5 / §6.13.6 / §51.0.F / §34 E-ENGINE-INVALID-TRANSITION: written (committed with item 7).
- analyze: `timingCellProblem` no longer refuses an engine (refuses engine + `<onIdle>` — owner Q); `heldWriteCheck` + `reachableVariants` (literal held write to a variant no reachable state is/admits → E-ENGINE-INVALID-TRANSITION, the existing static rule-violation code).
- print: `fieldCtor` passes the edge table to `rt.timed` for a graph field.
- runtime: `timed(…, table)`; `commitTimed` (checkEdge at commit, then write); leading throttle commit throws into the handler, trailing commits report via `reportLater`; refused commit opens no window; `transition` skips the write-time check on a timed engine.
- tests: slice-m4/timed-engine-s479.test.js (17, FakeClock); durations F5 updated.
- conformance: engine/timed-debounce-held-until-commit-rt, timed-throttle-trailing-judged-at-commit-rt, timed-throttle-leading-violation-rt, timed-held-write-unreachable-pos/-neg — bootstrap PASS; impl#1 XFAIL (carried g-impl1-timed-engine-commit-s479) for 4, -neg passes on impl#1.
- gaps: g-boot-timing-compositions-s478 narrowed; residue g-boot-timed-engine-residue-s479 (onIdle composition owner Q; onTransition owed with onTransition).
- CI gates run locally: severity --check, s34-census --check-new, gen-md-shim, snippet-gate, claim-gate, types-gate, corpus-compile-floor, host-global-scan --check — all pass. spec-coverage totals STALE (bot-owned).
