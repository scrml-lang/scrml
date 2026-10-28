# s472-boot-position-write — progress

Gaps: g-boot-position-write-s472 (HIGH), g-boot-local-part-write-s472 (MED).

## Plan
- Core: `EditKind.PositionAt(index, loc)` (a cell's `@xs[i] = v`); `Stmt.Assign` gains
  `path: PathStep[]` (empty = the whole rebinding; non-empty = a part write of the local,
  value semantics — the local is rebound to a copy with `value` at `path`).
- analyze: resolveAssign routes `@xs[i] = v` and a local part write through the ONE tape
  grant reader (`grantsAdmit`), new admission functions placed INSIDE the reader range.
- runtime: `writePath` (a copy along the path; an index outside the tape is the
  E-INDEX-OUT-OF-RANGE-RT trap, nothing written) and `setPosition` (a cell).

## Log
- (start) branch from origin/main 38c314ea1.
- 821407b0c: Core PositionAt + Assign path; analyze resolvePositionWrite / resolveLocalPartWrite
  (grant decisions in the reader range); runtime setPosition / writePath; planner refuses a waiting
  call in an index of an indexed write; pins moved (tape-write-forms, typer R3-H1, loops HIGH 2/L2,
  s1/indexWrite). Slices m1/m2/m1-lowered/m3/codec green; m4 green after the pin moves.
- (next) a tape ELEMENT of an inferred local is judged ungranted too (rule 1, fail closed).
- Red-proof: position-write-s472.test.js against base 38c314ea1 sources — 6 pass / 25 fail
  (the 6 are refusals that held on base too).
- Found (pre-existing, filed): `@ks = @ks.map(…)` bypasses element tape-field grants (fail-open).
- TODO: conformance regen, known-gaps entries (draft ~/.cache/scrml-pa/s472/pw-gaps.md),
  merge origin/main after #1607/#1608, final gates, PR.
- a480509fd inferred-element fix; 9b7ecefad merge origin/main (#1607). known-gaps: the two gaps
  added RESOLVED (same ids as #1608) + 5 new (cell sub-path writes, local part-write residue, SPEC
  past-end trap question, map-written-back fail-open HIGH). Conformance regen: no bucket movement
  (PASS 254 / FAIL 49 / UNSUPPORTED 825); `defer/return-value-contents-not-frozen` now refused as
  type-unknown instead of "no local part write".

## Review round 1 (S239, ~/.cache/scrml/review/s472-pw/REVIEW.md) — FIX
- F1 HIGH: a position write of an element that is itself a tape now needs the INNER tape's
  `replace` (analyze `elemTapeReplaceProblem` in the reader range; C3 `positionTapeProblem`);
  cell / local / parameter / nested depth tested. Map gap extended to `@g = @g.map(r => [])`.
- F2 MED: a part write of a `lin` root is E-ASSIGN-CONST (§35.2), in the linear pass (linAssign).
- F3 LOW: filed g-boot-derived-cell-with-grants-takes-writes-s472 (not fixed here).
- F4 LOW: filed g-loop-copy-part-write-no-op-s472 (recommend a W- lint).
  **PA-derived reading, pending bryan's veto:** a contract-free field reached through a `let`
  local is writable — the same transition as `p = { ...p, f: v }` (§66.11.2, §66.11.5, O57 = no);
  through a `const` / parameter / loop binder it is refused.
- F5 info: asymmetry noted — a local ANNOTATION may widen a copy's grants (`let a: string[write] =
  @xs`), while widening through an ARGUMENT is refused (argTapeProblem); no cell bypass (writing
  the copy back is a refused `replace`). Recorded in g-boot-local-part-write-residue-s472.
