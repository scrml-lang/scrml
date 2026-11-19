# s480-runtime — progress

Lane: three RULED bootstrap items (user-voice-scrml.md S479 "⭐ RULED — the rest of S478 hand-off §3.B").

## Item 20 — g-boot-mount-trap-blanks-page-s476 — DONE (commit 1)
- Ruling: "the trap unit is the effect, not the mount — the failing hole renders nothing, the trap is reported once, the rest of the mount proceeds. One §19.17 sentence."
- Base repro: `<p>${@xs[@i]}</p>` with @i out of range → nothing inserted (`BODY <!--scrml-->`).
- Built: runtime.js `hole(scope, fn, blank)`; Effect.run blanks on any throw, reports a trap once and stops; non-traps rethrown. Holes: text, textCellRow, cond (no arm, else included), visibility (hidden), bind, gather, gatherKeyed, each, errors, cssVar.
- Security: `rt.attr` NOT a hole (absent `sandbox` = unsandboxed iframe) — owner question, gap g-boot-mount-trap-attr-hole-unruled-s480. `rt.run` (body-top) not a hole (a guard must not be skipped).
- Re-run: a cond whose test traps on a re-run now REMOVES the arm (base kept it: fail-open).
- Tests: slice-m4/mount-trap-s480.test.js — 8 tests, 7 red on base.

## Item 17 — g-bootstrap-loop-value-form-residue-s469 (statement-arm lift) — DONE (commit 2)
- parse armTails: a statement-position arm's last-statement `lift` (Eval+lifted) becomes a Lift stmt.
- analyze armLift: statement arm passes LiftTo through (bound loop); Tier-0 stays LiftInArm (INTERIM: row pass doesn't read arm elements); message reworded.
- analyze liftReachable / typer liftOperands see statement-arm lifts (binder typed; E-TYPE-031 checked); check C20 liftsInto counts Attempt arms.
- Tests: slice-m4/stmt-arm-lift-s480.test.js (7 red on base); value-form-s469 arm test now runtime.
## Item 24 — g-placement-only-helper-always-async-peer-s466 — TODO
