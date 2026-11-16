# s478-boot-sql-row-types — progress

Lane goal: close `g-boot-sql-row-types-s478` — type a `?{}` SELECT's value from the `<schema>` on the
bootstrap (§39.11, §14.8).

## Done

- `schema.scrml`: `SchemaCol.nn` (the column carries `not null`).
- `parse.scrml` finishSchema / `ast.scrml` `FileAst.tables`: the file's first `<schema>` tables, kept
  only when they read with nothing above a warning.
- `sql.scrml` `rowProjection`: one provable single-table SELECT of bare columns / `*` / `t.c` / `t.*`
  from the one whitelist scanner; anything else fails closed.
- `analyze.scrml` `rowTypes` (end of phaseA): one nominal struct per (file, table, projection) for
  each `?{}` of a function whose nearest database (dbsPass) is the `<schema>` program's; `.get()` →
  `Row | not`, `.all()` / bare → `Row[]`; fields §39.4 → §14.8.3. `Tables.rows` / `Globals.rows`;
  `resolveSql` and the typer (`sqlVType`) read it.
- `analyze.scrml` resolveMember / typeMember: a struct field of a `T | not` local resolves; the typer
  reports an un-narrowed read as E-TYPE-046 (§42.3.5) — new bootstrap code, severity.scrml regenerated.
- `analyze.scrml` typeHandled: an empty `[]` arm takes a tape success type (§19.8.3 item 1).
- `analyze.scrml` rowFits: §14.8.8 width-subtyping, EXACT case (no extra column).
- `lower.scrml`: row structs (built-in-file StructDefs) ship in the Core.
- Test: `slice-m4/sql-row-types-s478.test.js` (21 tests: compile + SQLite runtime; 12 red on base).
- Doc pins updated (README tasks, tutorial 02b / 10, kickstarter ×4): the refusals moved from "no
  typed rows" to E-TYPE-031 (`integer` is `number`, §14.8.3).
- known-gaps: g-boot-sql-row-types-s478 resolved; new g-boot-sql-row-field-types-owner-s478 (OWNER
  QUESTION), g-boot-sql-row-projection-closed-s478, g-boot-sql-row-width-extra-s478,
  g-boot-sql-row-type-names-s478; g-bootstrap-method-receiver-narrowing-blind-s469 narrowed.

## Measurements

- Bootstrap conformance: base 539 PASS / 11 FAIL / 683 UNSUPPORTED → head identical (0 PASS→FAIL,
  0 bucket changes). Every `server-db/*-rt` case still stops on another blocker.
- Corpus (samples, examples, benchmarks, acceptance, conformance — 3157 files, single-file bootstrap
  compile, base vs head): 0 newly rejecting, 0 newly accepting; 1 changed (already failing):
  `examples/29-engine-vs-flags.scrml` gains E-TYPE-031 (`Item.id: int` vs a `number` column) and
  loses one E-BOOTSTRAP-UNSUPPORTED.
- CI checks: types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim,
  lint-no-default-arm — all exit 0 after the pin updates.
