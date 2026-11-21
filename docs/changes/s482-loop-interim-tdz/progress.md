# s482-loop-interim-tdz — progress

Branch `s482-loop-interim-tdz` from origin/main 1107f35d5 (#2046 merged).

## Item 1 — MED-1 (top-check capture hole)
- [x] Tests added (compiler/tests/commands/fix-loops.test.js, "S482 MED-1" describe): 6 of 10 red on base
      (probe, decl forms, destructuring, member read, opaque template cond, canonical fold); 4 are
      must-stay-green guards (runtime proof, nested-block still rewrites, label/continue, numeric head).
- [x] fix-loops.js: literalHead branch runs `declCapture(..., { topOnly: true })`; refuse on hit.
- [x] declCapture: topOnly depth tracking, property names after `.` not condition reads, opaque
      condition (template `${}`, block, markup) fails closed, top-level `${}`/`^{}`/`~{}`/`!{}` fails closed.
- [x] Verify: canonical fold (forNode) now scope-aware — no fold when the test reads a name the
      rest of the body declares at its top level.
- [x] commit item 1 (d673dccbf)

## Item 2 — brace + migrate the 4 braceless `while` in parse.scrml
- [x] brace (one commit, dd27b2a6b)
- [x] run --loop-interim (1b0847e4f): 2 counted, 2 top-check (`"."`, `"->"`); no capture; re-run 0 changed
- [x] SCOPE FINDING: #2041 (merged just before #2046) added 13 new `while` loops (lower.scrml 9,
      print.scrml 4); E-LOOP-WHILE-RETIRED -> 0 needs them. Same tool, separate commit (droppable).
      All 13 counted heads, no literals.
- [x] bundle base (1107f35d5) vs head: 30 chunks, 3 text-differ (parse/lower/print — only the 17
      loops), canonical AST 0 diffs; WhileStatement 17 -> 0
- [ ] bootstrap-conformance compare, final gates, PR
