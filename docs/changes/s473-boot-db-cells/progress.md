# s473-boot-db-cells — progress (append-only)

Lane B of the `<db>` design (scrml-support/docs/deep-dives/db-body-and-client-reads-design-2026-10-28.md §5).
Rulings (verbatim source: scrml-support/user-voice-scrml.md S472 "⭐ RULED — `<db>` body + client reads, Q1–Q6 =
PA recs" items 1, 2, 4, 5; S472 "⭐ RULED — functions in a `<db>` body: visibility"; S473 item 5 (`const` stays refused)).

## 2026-10-28 — start
- Branch s473-boot-db-cells from origin/main 543791e75. bun install + pretest OK.
- Tests first: compiler/self-host-v2/slice-m4/db-cells-s473.test.js (34 tests). On base: 8 pass / 26 fail
  (the 8 passes are refusals that already hold because a db-body declaration is refused whole today, plus the
  E-SCOPE-001 "load fn not nameable" check). Not committed red (the hook runs the slices).

## Plan (the proven path)
- parse: a db-body declaration `[let] <name:Type=value/>` is desugared into (a) a hoisted program cell with NO
  value of its own and (b) a hoisted, un-nameable LOAD function `return value;` recorded as the `<db>`'s function
  (so its `?{}` binds to that `<db>`, Lane A's dbsPass) — server-placed by construction. FileAst.dbCells records
  the triple (cell decl, load fn, `<db>` element + its span).
- analyze: the load fn is a server function (existing route/codec/CSRF path — the declared type is the wire
  table, an ALLOW-LIST: §57 encode refuses an undeclared key). Writes checked at the one write-place resolver
  (placeAt): locked → E-WRITE-NOT-GRANTED; outside the `<db>` span → E-DB-CELL-WRITE-OUTSIDE-BLOCK. Server reads:
  E-REACTIVE-003's site → E-DB-CELL-SERVER-READ for a db cell.
- Core: CoreProgram.loads (cell, fn, val); the cell's init is Local(val).
- print: client awaits the loads before it mounts (no mount on failure); server routes the load fns.

## 2026-10-28 — implementation (one commit, after the slices are green)
- parse.scrml `readDbCell` / `dbCellShapeWhy` (replaces `refuseDbDecl`): the desugar; ast.scrml `ADbFn` gains
  `cell` / `start` / `end`.
- analyze.scrml: `isLoadName` (load `@name` in no file scope; Sym hint `load$name`; no W-DEPRECATED-SERVER-MODIFIER;
  no second E-SCOPE-010); `dbCellWriteGuard` (from `writeGuards` — every write place); `resolveReset` refusal;
  `serverBodyDiags` → E-DB-CELL-SERVER-READ; `dbNestedWhy` (Lane A refusal, cell message); `dbLoads` (mints the
  client value Sym; fails closed for an unplaced load or a cell outside the top-level program).
- core.scrml `CoreProgram.loads` / `DbLoad`; lower.scrml field init `Local(val)`; check.scrml C-DB1..3;
  print.scrml `dbLoadBoot` + `calledServerFns` includes loads; runtime.js `loadDbCells`.
- Reading taken (surfaced as g-bootstrap-db-cell-locked-reading-s473): "locked" = no `replace` grant (§66.9 rule 1);
  a tape with `[replace]` is the writable form (O3), so the design's refresh shape runs.
- SPEC: new §8.1.3 (the S472 function-visibility sentence + ruling items 1, 2, 4, 5 + an informative bootstrap
  note); §4.18.1's Lane A pointer now names §8.1.3 (the brief's "§8.1.2" is taken by S456's one-statement rule);
  §34 rows E-DB-CELL-SERVER-READ, E-DB-CELL-WRITE-OUTSIDE-BLOCK; E-DB-BODY-STATEMENT / E-UNQUOTED-DISPLAY-TEXT
  bootstrap citations moved from drifted line numbers to symbols. SPEC-INDEX + severity.scrml regenerated.
- known-gaps: s469 db/channel gap narrowed (db half closed); filed g-bootstrap-db-cell-locked-reading-s473 (MED,
  owner q), g-bootstrap-db-cell-load-failure-surface-s473 (MED), g-bootstrap-db-cell-loads-uncoalesced-s473 (LOW),
  g-bootstrap-db-cell-shapes-refused-s473 (LOW).
- Tests: db-cells-s473.test.js 38 (26 of the original 34 red on base; the 4 added later are also red on base —
  db cells did not compile); acceptance db-cells/* (3 new), o61/db-let-decl UNSUPPORTED → PASS; db-body-s472 /
  parse-batch-s471 expectations moved from "refused" to "compiles" (export still refused).

## 2026-10-28 — verified (commit 2)
- Red-proof: with origin/main's implementation files in the tree (tests from this branch), db-cells-s473.test.js is
  8 pass / 30 fail (the 8 are refusals that already held — a db-body declaration was refused whole). Restored.
- Gates (local, the CI `checks` + `slices` steps): types-gate OK (unchanged) · compiler/tests/*.test.js 2239/0 ·
  snippet-gate 0 fail · claim-gate 0 fail · corpus-compile-floor PASS · gen-md-shim current · conflict markers 0 ·
  SPEC-INDEX --check OK · delta-lint PASS · s34-census --check-new PASS (4 rows) · bootstrap-conformance --check
  current (no movement) · severity --check current · lint-no-default-arm 0 · slice m1 100/0, m2 614/0,
  m1 lowered 100/0, m3 60/0, m4 3102/0, codec 166/0 · e2e-render-map 259/0. Pre-commit hook: 50909 pass / 0 fail.

## 2026-10-28 — fix round 1 (S239 review of 051034e09: LAND-WITH-FOLLOWUPS — no leak, no write bypass, no server-read bypass)
- F1 (MED): print.scrml `routeName` dedupes on the `$`→`_`-normalized hint (a cell `@rows`'s `load$rows` and an author
  `load_rows()` both printed `const route$load_rows`; neither module loaded). Test: the p10 shape — distinct route
  constants in both artifacts, every route answers 200, the page mounts.
- F3: SPEC §8.1.3 item 5 states normatively that a locked `<db>` cell is read-only on the client whatever other grant it
  carries (overriding §66.9 rule 1 for a `<db>` cell; only `replace` makes one client-writable) — "PA reading of the
  S472 ruling, S473"; §66.9 rule 1 added to the provenance "supersedes". Gap g-bootstrap-db-cell-locked-reading-s473 resolved.
- F4: E-DB-CELL-EDIT-GRANT (new §34 row; analyze.scrml `dbLoads`) — a locked cell whose type grants an edit but not
  `replace` is refused at the declaration. Tests + acceptance db-cells/neg-edit-grant; neg-locked-write now a scalar.
- F5: "inside" (incl. a `<db>` nested in the cell's `<db>`) stated in item 5; the bootstrap note's nested-scope list
  gains loop/arm binders, the `<match>` arm, and the component-body hole (F2). Item 4's own-value clause labelled a derivation.
- F2: filed g-bootstrap-db-in-component-decl-body-dropped-s473 (LOW, pre-existing). Not fixed (as directed).
- Gates: slices m1 100, m2 614, m1 lowered 100, m3 60, m4 3105, codec 166 (0 fail); e2e-render-map 259/0; lint 0;
  types-gate OK; compiler/tests/*.test.js 2239/0; snippet, claim, floor, md-shim, conflict, SPEC-INDEX, delta-lint,
  s34-census (5 rows), bootstrap-conformance current, severity current — all PASS.
