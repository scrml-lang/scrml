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
