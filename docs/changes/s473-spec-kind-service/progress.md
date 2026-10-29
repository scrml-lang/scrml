# s473-spec-kind-service — progress (append-only)

## 2026-10-29 — DRAFT §68 landed in the working tree

Scope: SPEC-only. compiler/SPEC.md (§68 new; §64 intro, §64.3, §64.6 table, §34 E-TOOL-002 row, §19.17 trap table + one bullet; 13 new §34 rows; TOC line), SPEC-INDEX (regen), docs/known-gaps.md (3 gaps + counts regen). severity.scrml regen: no change (the bootstrap names none of the new codes). No compiler code.

Governing sentences (ruling:user-voice-scrml.md S473 "⭐ RULED — long-running program kind, owner questions Q1–Q4 (PA recs)"):
- Q1: "**Q1 spelling: one kind, `<program kind="service">`.** … This reverses S238's "no separate `kind="service"`". `kind="tool"`'s invoke-only harness and `serve=` stay unchanged."
- Q3 CHANGE: "**CHANGE: a runtime trap aborts only its turn.** It is reported to stderr with its code and location, and the program carries on. A program opts into stop-on-trap (exit 70) with `on-trap="stop"`."

SPEC sentences written (§68.6 statements 17-18): "A trap (§19.17) raised in a turn SHALL end that turn at the trapping expression … The trap SHALL be reported to stderr with its code and its source location … and the program SHALL then carry on with its next event." / "A program that declares `on-trap="stop"` … SHALL … stop with exit code 70".

Design-doc places that assumed trap → stop, each changed in §68: §5.4 step 3 (kept: effects flush after a trapped turn), §5.5 exit-code table row (now: no exit; 70 only under on-trap="stop"), §5.5 E-SERVICE-STOP-CODE-RT (kept 70: the turn asked to stop), §5.10 §19.17 row, §5.11 banked `trap="continue"` knob (dropped: inverted by the ruling), §6.2 doorbell cost note (now: a bad pass never ends detection), §7 trap line, §8 statement 12, §10 Q3, Recommendation weakness 3.

Derived (not separately ruled; flagged in the PR): E-SERVICE-ON-TRAP-INVALID (validity of on-trap=); traps outside a turn (§68.6 statement 19); `<onSignal>` does not count for quiescence; reserved names stdin/watch/onSignal owed with §4.15.

Gates: s34-census --check-new PASS (29 rows); regen-spec-index done.

## 2026-10-29 — review fix round 1 (FIX-FIRST, ~/.cache/scrml/review/s473-1644/REVIEW.md)

F1 liveness defined (st. 21) + "event source" term reconciled (§68.1 Terms, st. 8) + W-SERVICE-NO-SOURCE on the same definition; example 2 timer gated by `running=@polling` (no `if=` on `<timer>`, §17.1.2) so `poll` stays live. F2 prompt → stdout, first prompt after mount when the queue is empty (st. 10). F3 st. 13a: `if=` scopes mount/destroy at turn end after the effect flush; queued events of destroyed sources discarded except `<stdin>` events (held); remount continues the stream; End once per stream. F4 st. 24: SIGTERM, SIGKILL at G/2, cleanup gets the remainder. F5 st. 22a (PA ruling): a second same-kind signal while a default stop is pending exits at once 128+n. F6: E-TOOL-004/005/006 rows amended (Nominal for services), §68.14 owed list, Direction of change declares the W-ATTR-001 → Error narrowing. LOWs L1–L10 fixed (st. 22b, exit table rows, st. 6a, st. 14, st. 13 abandonment, st. 23 "adapted", example 2, st. 16 watch/poll bounds, ON-TRAP row provenance, st. 20 for `main`). Cross-PR (#1630 E-HOST-THROW-RT in §19.17) waits on #1630 (still OPEN).

## 2026-10-29 — cross-PR: #1630 merged; main merged in

Merged origin/main (merge, not rebase); SPEC-INDEX regenerated from the merged tree (git-merge-generated --regen, then regen-spec-index). §19.17 trap table gains `E-HOST-THROW-RT` (#1630's §21.3.3 rule 18), count four → five. known-gaps gap ids diffed: 0 lost. Not done here (still #1630's owed list): widening `E-HOST-VALUE-MISMATCH-RT` in §19.17 to `<host>` bindings.
