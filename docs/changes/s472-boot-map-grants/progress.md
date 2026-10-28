# s472-boot-map-grants — progress

Gap: g-boot-map-position-write-bypasses-element-tape-grants-s472 (HIGH, fail-open).

## Plan
- analyze: a shape-4 write back (`xs = xs.map(…)` / `.sort(…)` / `.reverse()`, §66.11.2 "a
  position-write") replaces EVERY element, so it needs what a position write `xs[i] = v` needs
  (#1610 r1 F1): an element that is a tape needs its `replace`; a struct element's tape fields
  (structTapeWrites, nested) need theirs. New reader fn `shapeElemTapeProblems` (inside the grant
  reader range). Call sites: resolveSeqShape (cell), localTapeProblems (local / parameter
  rebinding), localFieldWriteProblem (a local / parameter struct's tape field), fieldAtWrite
  (an instance-spread override of a cell's tape field).
- check (C3): `.PositionWrite :> positionTapeProblem(…)` (was `""`); a FieldAt whose target is a
  tape and whose value is a map / sort / reverse judges its elements (`fieldAtElemProblem`).
- Callback not walked: identity map / spread-keeping map refused (fail closed, SPEC silent).
- sort / reverse refused alike (fail closed: SPEC classifies them as the same position write).
- Out of scope, unchanged: a whole `replace` of an outer tape (`@g = [[]]`) — unruled.

## Log
- branch from origin/main c8070b56a.
- tests: slice-m4/map-grants-s472.test.js (17). Red on base: 13 of 15 initial fail.
- commit 1: analyze + check + tests.
