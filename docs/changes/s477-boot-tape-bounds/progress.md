# progress — s477-boot-tape-bounds

- start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-aab452831f80d1161, base origin/main 709f53429
- maps read: primary.map.md (Bootstrap routing rows), bootstrap.map.md — load-bearing (see report).

## Governing sentences (SPEC, quoted)

- §66.11.2 rule 1: "**Invariants** — length bounds and per-position types (§66.12) — are checked on **EVERY** write, however it is spelled."
- §66.11.2: "A write that would break an invariant is `E-WRITE-INVARIANT` (§66.20)."
- §66.12.2 table: "**length** | fixed · bounded (e.g. `1..=10`) · free"; grant row "`free` | the length can change (bounded: `a..=b`, above)"; S469 amendment: "`a..b` is half-open and `a..=b` inclusive, exactly as in a loop head (§49.2.5)".
- §66.12.6 rule 1: "A tape's grants govern every write to it, in each position that can hold one" (cell, declaration field, struct field, tuple position, local, parameter, return value).
- §66.12.6 rule 3 table: "`xs.insert(i, x)` | grow anywhere: `x` becomes position `i` | `insert`"; "An index write at or past the end, an `insert(i, x)` with `i` greater than the length, and a `length =` write that lengthens would each create a position that holds no value … for the `insert` and `length =` cases it is `E-WRITE-INVARIANT` (where the compiler cannot prove the index in range, enforcement is ⚑ O36)."
- §66.12.8 rule 7: "`xs.insert(-1, x)` traps (`E-INDEX-OUT-OF-RANGE-RT`)".
- §66.12.8 rule 5 (the no-runtime-cost-where-proven principle): "A compiler MAY omit the run-time check where it proves the index in range. The behaviour is the same either way."
- §19.17: "A **trap** is a defined runtime error … not a value of any `!` error type"; "A trap SHALL stop the current unit of execution at the trapping expression".
- §66.10 rule 1: "A binding, argument or field initialized from a cell (or from any value) holds a snapshot of that value."
- THE RULING (user-voice-scrml.md S477 "⭐ RULED — O36"): "a write that PROVABLY violates a sequence invariant (a length bound or a per-position type, §66.11.2 / §66.12) stays a compile error (`E-WRITE-INVARIANT`); a write whose effect the compiler cannot prove is checked at RUN TIME and TRAPS on violation (the §19.17 trap kind), extending the S473 index-past-end trap (`E-INDEX-OUT-OF-RANGE-RT`). Capability kept (the write compiles), fails closed."
- Older S440 text of the same question (user-voice "dpa-052 Q5 (O36)"): "A failed runtime check refuses the WHOLE write (no partial apply)" — honoured: every check runs before the write.

## Direction of change

- SPEC: **semantics-defined (previously unspecified)** — O36 ruled; new trap code `E-WRITE-INVARIANT-RT`.
- Bootstrap: **newly-accepting** (a bounded length was refused by name on every tape type; `insert(i, x)` on a local was refused) and **newly-rejecting** for `free` beside a bound / an empty range (E-GRANT-UNKNOWN) — both were already errors before (E-BOOTSTRAP-UNSUPPORTED), so no program that compiled before fails now.

## Trap code (searched §34 and §19.17)

- §19.17 lists six traps; none is a length-bound violation. `E-INDEX-OUT-OF-RANGE-RT` covers positions only (and already "a negative `xs.insert` position").
- So: a position outside the tape (insert past the end) → `E-INDEX-OUT-OF-RANGE-RT` (the ruling's "extending the S473 index-past-end trap"); every other invariant at run time (a length bound, a lengthening `length =`) → NEW `E-WRITE-INVARIANT-RT`, §34 row + §19.17 row + §66.20 row added with its emitter. **PA reading** (the split between the two codes) — recorded in §66.11.7 as such.

## SPEC silences → PA readings (rulings owed)

1. `free` beside a bound (`int[1..=3, free, append]`), or two bounds: the length axis has ONE value (§66.12.2 table) → E-GRANT-UNKNOWN. Not ruled; the refusal fails closed. Ruling owed: is `free` + bound an error, or does the bound narrow `free`?
2. An empty range (`3..=1`, `2..2`) → E-GRANT-UNKNOWN. Not ruled (a bound with no admitted length).
3. Which trap code for which unprovable case (above).
4. A bound on an ELEMENT type (`int[1..=3][free]`) when the value is neither a literal nor a declared read: a deep run-time check of every element is not built → **INTERIM** E-BOOTSTRAP-UNSUPPORTED (fail closed), named in the message.

## What was built (bootstrap)

- analyze.scrml: `resolveSeqType` reads `a..=b` / `a..b` into `LengthGrant.Bounded` (cell, field, local, parameter, return — the one type resolver); `boundValue` judges every value flowing into a bounded type (initializers of locals / consts / cells / fields / use-site attributes, cell and field writes, local rebinding and part writes, call arguments, returns, construction payloads, struct-literal fields, appended elements, grow-shape elements): a plain literal is checked statically (E-WRITE-INVARIANT), a read of a local / parameter / cell whose DECLARED bound is inside the target's is proven (no check), anything else is recorded (`TypeState.bounds` → `Typing.bounds`). Local edits (`typeLocalEdit`) and cell edits (`cellLengthCheck`) judge the bound alone (`boundEditVerdict`): a one-length bound is violated by every grow (and every shrink above 0) → E-WRITE-INVARIANT; a shrink of a bound starting at 0 is proven; else run time. `insert(i, x)` on a local: grant `insert`, the value an element, the position an `int`, a literal position above the bound's max provably past the end (E-WRITE-INVARIANT), else the runtime trap.
- core.scrml: `PrimOp.LengthCheck`, `PrimOp.TapeInsert`, `Check.RuntimeLength(min, max, loc)` (the O36 hook the Check enum's comment had held open).
- lower.scrml: `boundChecked` wraps a recorded node's value in `LengthCheck` (in `lowerExprAt`, and a local edit's result); `LInsert` → `TapeInsert`.
- check.scrml: C6 admits RuntimeLength only on Append / Prepend / RemoveEnd / RemoveFront of a field whose type carries exactly that bound; C9 sees a filter through a LengthCheck.
- print.scrml: `appendWithin` / `prependWithin` / `removeEndWithin` / `removeFrontWithin` for a RuntimeLength edit; a Commit (a grow shape adding several values) checks every write's cumulative length before any write (`lengthGuard`); `lengthCheck` / `tapeInsert` prims.
- runtime.js: `lengthCheck`, `lengthGuard`, the `*Within` edits, `tapeInsert` (re-exported by server-runtime.js for server bodies).

## Residue (not built here)

- `insert(i, x)` on a CELL (and `remove(i)` on a cell) stays E-BOOTSTRAP-UNSUPPORTED (it was; gap g-bootstrap-tape-methods-insert-remove-fill-owed-s469 narrowed, not resolved).
- `xs.length = n` (any position) is still E-ASSIGN-TARGET in the bootstrap (not a recognized edit) — its O36 case is SPEC-only.
- No flow-sensitive length tracking: `let xs: int[1..=3, append] = [1, 2, 3]; xs.append(4);` traps at run time instead of a compile error (the compiler judges the bound from the type alone). Ruling's "provably" read as "provable from the types and literals"; a length tracker would move more cases to compile time.
- A bounded local's edit carries a `LengthCheck` wrapper, so draft #1824's in-place `selfEdit` (which matches `xs = TapeAppend(xs, v)` exactly) will copy instead of editing in place for a CHECKED edit of a bounded local only — correct, not optimal. A PROVEN edit (a shrink of a bound whose min is 0) carries no `LengthCheck` and does take #1824's in-place path (correct; wording fixed in FIX ROUND 1).
- Deep element-bound runtime check (INTERIM refusal above).

## Concurrency notes

- #1824 (`worktree-agent-aa0286ee9c80eeabc`, in-place local edits) read: its `ownedLocals` / `selfEdit` key on `Stmt.Assign(xs, Prim(Tape*, [xs, …]))`. My wrap makes a bounded edit `Assign(xs, Prim(LengthCheck, [Prim(Tape*, …), …]))` → not a selfEdit → the copying path, which is semantically identical. Expected textual conflicts: runtime.js (both add functions near the Tape* block — mine sit after `tapeConcat`, theirs after `tapeRemoveAt`; separate hunks), server-runtime.js (separate export lines), print.scrml primJs arms + editJs (theirs touch stmtJs / assignedJs; mine primJs, isRuntimeEdge, transitionJs, editJs, commitJs — likely clean).
- `s477-boot-tape-forms` (part edits, removal-as-value, spread value) works in analyze.scrml `resolveLocalEdit` / `ELocalEdit` territory: expect conflicts in `ELocalEdit`'s field list (I added `index`, `loc`), `resolveLocalEdit`, and local-tape-edits-s475.test.js describe E.

## Verification (at 8ca8b53ef + the SPEC / gap / conformance commit)

- slice-m4: 5618 pass / 113 skip / 2 fail BEFORE the test updates (the two fails were the INTERIM-refusal tests E[0] and J[0], rewritten); after: tape-bounds-s477 (25 tests) + local-tape-edits-s475 = 58 pass, 0 fail; full slice-m4 green in the pre-commit hook.
- slice-m1 167 pass (plain and `SLICE_CORE=lowered`), slice-m2 + slice-codec 785 pass, slice-m3 60 pass; lint-no-default-arm and lint-duplicate-fn clean.
- Conformance (bootstrap): 1831 attempted · PASS 306 (+4) · FAIL 243 (=) · NOT-TWINNED 624 · UNSUPPORTED 658 · CRASH 0 · INVALID 0. The 4 new cases (reactive/tape-bound-append-rt, tape-bound-append-trap-rt, tape-bound-literal-neg, tape-insert-rt) PASS; no existing case moved. On impl#1 they XFAIL under the new carried gap g-impl1-tape-bounds-unimplemented-s477 (compiler/tests/conformance 2711 pass, 0 fail).
- severity.test.js + diag-gate green (no regen needed); spec-coverage-check 0 violations; §34.0 s34-census --check-new PASS; delta-lint PASS. SPEC-INDEX row ranges are stale (bot-owned, B6).

## FIX ROUND 1 (review of #1830)

- Branch `tape-bounds-fix` from 17d83a675, merged origin/main (d564780fc, docs-only).
- F1 (fail-open): `typeFail` now runs `boundValue` + `checkLitFields`/`checkNotElems` on each payload, as `checkConstructArgs` does (a `fail` is a construction, §19.3.3; §66.11.2 "checked on EVERY write"). Literal past the bound → E-WRITE-INVARIANT; computed → E-WRITE-INVARIANT-RT trap.
- F2 (fail-open): `checkArgs` and `typeReturn` now run `checkLitFields`, so a struct literal's bounded field (literal → compile error; computed → trap) and its field TYPE (`{ xs: "s" }` into `{ xs: int[] }` → E-TYPE-031, newly rejecting) are checked in those positions.
- Audit find (fail-open, same class): `checkLitFields` did not recurse into a `match` / `!{}` arm's value, so `const b: B = match @k { .A :> { xs: [1,2,3,4,5] }, … }` held 5 elements. New `handledArmValueExprs` (an arm's one expression, or a lifted block arm's last value) — checked like a ternary's branches.
- S1: `commitDelta` / `capDelta` now key on capability AND instance (`commitInstKey`). Not buildable as a false trap today: every Commit writes one instance (lower `editStmts` / `spreadStmts`); defensive.
- F3: §19.17 "seven traps" header, §19.17 trap-table row and §66.20 row marked "PA reading — ratification owed". Wording fixed: a PROVEN shrink (bound min 0) takes #1824's in-place path.
- Positions audited (probe, bootstrap): construction payload (ok), `fail` payload (fixed), call arg incl. struct literal / tape of struct literals / nested struct literal (fixed), return incl. ternary / match (fixed), match arm into const/return (fixed), lifted block arm (refused earlier: E-BOOTSTRAP-UNSUPPORTED), cell init / cell write with replace (ok), local rebind / local field write (ok), local + cell append of a struct literal (ok), use-site attribute + declaration-field initializer (ok, already boundValue + checkAttrLitFields), server fn return (ok), `reset(@x)` (re-applies a checked initializer), `fail` with a struct-literal payload (refused: E-TYPE-STRUCT-CONTEXT), map-lambda with a braced body (refused), maps (no map type in the bootstrap), channel cells (NOT probed — not verified).
- Newly rejected: 0 of 1831 conformance cases change bucket or emitted codes (PASS 306, FAIL 244, NOT-TWINNED 624, UNSUPPORTED 657, CRASH 0 — identical per case vs. the pre-fix tree); corpus (samples + examples, 952 .scrml files, single-file bootstrap front end): 0 files change their error set; full slice-m4 green in the hook.
