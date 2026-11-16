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

## Fix round 1 (#1915 review — H1, H2, H3, L1, M1)

- H1 `analyze.scrml` typeMember: E-TYPE-046's "proven" now requires the narrowed receiver to BE the
  field's owner struct (`knownOf(ro.vt)` is `Named(owner)`); a LOCAL receiver is judged on every
  struct-field read (a rebinding can widen its typer type away from the binder's).
- H2 `analyze.scrml` resolveHandled (binder, `sqlArmsAdmitted`): a handled `?{}` is its row type only
  when every arm is `not` (`.get()`), `[]` (`.all()` / bare) or leaves; else untyped. Typer
  `sqlArmsCheck` (typeLocal, unannotated local): an arm yielding other than the success type is
  E-TYPE-031 (§19.8.3 item 1 + S475 amendment "E-TYPE-001 / E-TYPE-031 at the position").
- H3 `analyze.scrml` resolveLocal (`sqlInitRow`): an unannotated `let` from a row-typed `?{}` records
  the row type as its annotation — every rebinding is checked (E-TYPE-031), object literals field
  by field.
- L1 `sql.scrml` rowProjection: a bare `current_timestamp` / `current_date` / `current_time` item
  fails closed (the SQLite keyword, not the column); `t.current_timestamp` stays typed.
- M1 known-gaps g-boot-sql-row-field-types-owner-s478: the trust assumption (no DDL, non-STRICT
  affinity) added to the text.
- Tests: `slice-m4/sql-row-types-s478.test.js` 42 pass (21 new: H1/H2/H3/L1 compile tests, the
  review's runtime repros refused, 4 runtime tests incl. a failing-query database).
- Conformance 539/11/683/0 CRASH — identical buckets to base; 1 more code inside UNSUPPORTED
  (`server-db/sql-hoisted-loop-unbindable-key-rt`: `.get() !{ … :> "QF", _ :> "other" }` into an
  undeclared const — E-TYPE-031 per §19.8.3 S475). Corpus (3157 files): 0 newly rejecting vs base.
