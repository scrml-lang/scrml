# s473-impl1-imported-handler-arm — progress (append-only)

Policy: impl#1 work ALLOWED (S471 — flogence breakage; flogence compiles on impl#1 and uses these shapes).

## 2026-10-29 — Part 1: triage + tests first (base `9d1a97825`)

Gap: `g-impl1-imported-callee-cell-write-handler-skipped-s473` (filed on PR #1658's branch, not on main).

Governing SPEC: §19.4.3 (the arms run on failure; the guarded value is written after the arms — S473
#1645: the cell keeps its old value while the arms run) and §19.9.10 "A call to a function imported
from another file is judged by the callee's placement, exactly as a same-file call."

Measured (impl#1, compileScrml): `@x = srvF(id) !{ … }` with `srvF` an imported `export server
function … ! -> E` lowers to `let R = await _scrml_cs_reactive_set("x", await srvF(id)); if (R &&
R.__scrml_error) {…}` — arms dead, envelope in `@x`. Imported SYNC `!` fn: correct. Local server fn:
correct (s441 rewrite). Root cause:
- emit-logic's guarded-expr auto-await (`isPromiseReturningCallExpr`, which DOES classify an
  imported async callee through the export registry) prefixes `await` to the whole
  `_scrml_reactive_set(…)` statement;
- emit-client's s441 rewrite (the one that defers the write) iterates `fnNameMap` + the file's
  async-coloured client fns — LOCAL names only — so it never sees `srvF`;
- the S473 sync twin `deferSyncGuardedCellWrites` matches only `let R = _scrml_reactive_set(` —
  the `await` before the set made it skip the site.

Other positions measured, imported vs local server fn (probe in TMPDIR): let / const / reassignment /
statement / return / `?` propagation lower identically (the guarded binding is the call itself).
Event-handler attribute: imported awaits in place inside the async handler (try/catch), local gets
the IIFE — both defer the write, both correct. Module-init `@x = srvF("…") !{…}`: imported →
E-IMPL1-ACTION-NOT-AWAITED (fail closed; `render-waiting-calls` `lifted` holds local names only),
local → IIFE. Filed as a gap (fail closed, not this lane).

Found while building the executed test: a page with its own server function that imports an
exported ENUM from a lib with server functions emits `import { E } from "./lib.server.js"`, which
lib.server.js does not export → the server bundle fails to link. Filed.

Tests: `compiler/tests/unit/imported-callee-cell-handler-s473.test.js` — 21 tests (12 executed in
happy-dom with the REAL compiled route handlers answering fetch; 1 emitted shape; 8 imported-vs-local
parity over every guarded position). 5 red on base (imported srvF: arm-sees-old-value, lift-keeps,
emitted shape, 2 cell-write parity).

## 2026-10-29 — Part 1: fix

`deferSyncGuardedCellWrites` (emit-client.ts) reads an optional `await` before the set
(`let R = await _scrml_reactive_set(N, V);`) and moves it onto the value once (`let R = await V;` —
V is already `await f(…)` where the emitter awaited in place; never `await await`). The site then
gets the arms-then-`else { set(R) }` shape the s441 pass gives a local server function. No emit-logic
change (the #1645 note: emit-logic cannot tell server from sync callees in module-init /
handler-attr contexts, and routing there broke 13 s441/S446/ss41 tests).

Result: the new file 21/21; #1645's file green. flogence copy (TMPDIR; flogence untouched):
viewapp/view.scrml `@fromImport = listArcs() !{…}` now lowers to `let R = await listArcs(); if (R &&
R.__scrml_error) { …arm… } else { set("fromImport", R) }` — byte-identical in shape to the local
`fetchLocal` arm beside it; src/app.scrml nodeStats sites unchanged (`await _scrml_fetch_loadNodeStats_…`);
0 `await _scrml_*reactive_set` left in either output.

Gates: unit+conformance 32289 pass / 0 fail; root 2239/0; types-gate OK; snippet/claim/corpus floor/
md shim/conflict/spec-index/delta-lint/s34 PASS; bootstrap lints + m1/m2/lowered-m1/m3/m4/codec green;
e2e-render-map 259/0; bootstrap-conformance current.

Gaps: resolved g-impl1-imported-callee-cell-write-handler-skipped-s473 (entry copied from #1658's
branch — keep this copy when #1658 merges); filed g-impl1-imported-async-module-init-cell-handler-refused-s473
(LOW), g-impl1-server-imports-unexported-enum-s473 (MED).
