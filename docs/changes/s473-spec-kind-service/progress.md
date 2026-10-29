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
