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
