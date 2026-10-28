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
