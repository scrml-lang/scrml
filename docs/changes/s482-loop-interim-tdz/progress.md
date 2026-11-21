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
- [ ] commit item 1

## Item 2 — brace + migrate the 4 braceless `while` in parse.scrml
- [ ] brace (one commit)
- [ ] run --loop-interim
- [ ] bundle base/head compare, literal check, bootstrap-conformance compare
