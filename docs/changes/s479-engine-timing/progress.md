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

## Item 8 — g-boot-timing-compositions-s478 (engine part) (IN PROGRESS)
- SPEC §6.13.5 / §6.13.6 / §51.0.F / §34 E-ENGINE-INVALID-TRANSITION: written.
- Plan: analyze — drop the engine refusal in timingCellProblem (keep a refusal for an engine with `<onIdle>`: owner Q); `heldWriteCheck` (literal target unreachable from initial → E-ENGINE-INVALID-TRANSITION). print — pass the edge table to rt.timed. runtime — commit-time checkEdge; transition() skips the write-time check on a timed graph cell.
- `<onTransition>` is not in the bootstrap at all (E-BOOTSTRAP-UNSUPPORTED) → the onTransition-at-commit half is owed with it.
