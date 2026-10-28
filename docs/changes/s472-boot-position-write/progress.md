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
