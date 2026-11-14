# BRIEF — s477-boot-tape-bounds (TASK verbatim)

change-id: `s477-boot-tape-bounds`. scrml repo, BOOTSTRAP compiler (`compiler/self-host-v2/`, written in scrml) + one SPEC edit.

## THE RULING (bryan, S477, verbatim in `scrml-support/user-voice-scrml.md` §S477 "⭐ RULED — O36")
A write that PROVABLY violates a sequence invariant (a length bound or a per-position type, §66.11.2 / §66.12) stays a compile error (`E-WRITE-INVARIANT`); a write whose effect the compiler cannot prove is checked at RUN TIME and TRAPS on violation (the §19.17 trap kind), extending the S473 index-past-end trap (`E-INDEX-OUT-OF-RANGE-RT`).

## TASK
1. SPEC: in §66.22 mark O36 RULED (replace the "⚑ OPEN (not ruled) — O36" block with the ruled text + `> **Provenance:** ruling:user-voice-scrml.md S477 "⭐ RULED — O36"`), and update every §66.11 / §66.12 sentence that says enforcement of the unprovable case is "⚑ O36" (grep `O36` in SPEC.md). Name the runtime trap code: check §34 and §19.17 for an existing code; if none, add a §34 row for a new `E-WRITE-INVARIANT-RT` (trap kind, §19.17) in the same landing as its emitter. Mark this change's direction-of-change in progress.md (semantics-defined: previously unspecified).
2. Bootstrap: gap `g-boot-bounded-length-unenforced-s475` (read it in `docs/known-gaps.md`: bound tokens like `int[1..=3, free, …]` are dropped/refused today). Build bounded-length tape types (§66.12.2) in every position SPEC allows (cell, field, local, parameter, return), the compile-time E-WRITE-INVARIANT on provable violations (e.g. append to a full fixed-length literal), and the runtime trap on unprovable ones (append/prepend/insert/pop/shift/remove/length changes in loops, through parameters, etc.). Keep the check out of the provably-safe path (no runtime cost where proven).
3. Build `insert` (§66.12: anywhere-grow grant) with its grant check, bound check (compile or trap) and index-range behaviour per SPEC (§66.12.6; S473 trap for past-the-end).
4. Tests: bootstrap unit tests + conformance cases (positive, compile-error, runtime-trap — execute emitted JS and assert the trap); value semantics (§66.10) preserved. Update gap markers (resolved resolved-by=s477-boot-tape-bounds, or narrowed + residue). Report bootstrap test + conformance deltas.

## POLICY
Bootstrap only; no `compiler/src/` changes. SPEC `compiler/SPEC.md` normative: quote governing sentences (§) in progress.md; where silent, record the search, refuse INTERIM by name, list as ruling owed. A scrml sequence is a `tape` (no JS arrays). No null/undefined/try/catch/async/await. Do not hand-edit generated blocks.
CONCURRENCY: lane `s477-boot-tape-forms` (part edits, removal-as-value, spread value) is running in parallel in analyze.scrml, and open draft #1824 (branch `worktree-agent-aa0286ee9c80eeabc`) changes tape-edit printing (in-place when owned, `print.scrml ownedLocals`). Fetch #1824's branch and read its diff so runtime checks compose with in-place edits; build on origin/main; report expected rebase conflicts.
