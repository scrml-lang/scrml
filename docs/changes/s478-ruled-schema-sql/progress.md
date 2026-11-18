# s478-ruled-schema-sql — progress

Lane for S478 open-Qs rulings 17–22 (user-voice-scrml.md, scrml-support ccb6b40, entry
"⭐ RULED — open owner questions, PA recs adopted wholesale (S478, 2026-11-17)"). Bootstrap only.

**Brief vs ruling text.** The dispatch brief said "E-SCHEMA-016 for a duplicate column and E-SCHEMA-017
for a duplicate table". The user-voice ruling (item 18) says E-SCHEMA-016 = a table declared twice,
E-SCHEMA-017 = a column declared twice. Built to the user-voice text.

## Done
- [x] SPEC first: §39.2 (comma), §39.7 / §39.12 / §34 (E-SCHEMA-016/017), §4.15 / §24.4 / §34 (`schema`
      reserved), §14.8.3 / §39.11 (INTEGER → int; typed row checked as read, INTERIM), §19.10.4 / §34
      (no-query block plain; E-TX-CLIENT-PLACED PERMANENT; handler bodies under E-ERROR-001), §19.10.3 /
      §34 (W-TX-EXIT-ROLLS-BACK).
- [x] 17 comma — `schema.scrml` readColumn. impl#1 line reader owed → g-impl1-schema-column-comma-line-reader-s478.
- [x] 18 E-SCHEMA-016/017 — 4 refusal sites swapped. Second `primary key` stays fail-closed (OPEN) →
      g-boot-schema-second-pk-code-s478.
- [x] 19 `schema` reserved — analyze `reservedElementName`; INTERIM refusals removed.
- [x] 20 `integer` → `int` (colType); typed-row check (SqlQuery.row → queryJs → server-runtime checkRows,
      QueryFailed). Tutorial 02b compiles clean and runs. Cases migrated: 20 `server-db/*-rt` cases'
      `body: text` → `body: text not null` (ruling (2): "fix the cases to declare `not null`").
      Residue → g-boot-sql-row-check-interim-s478.
- [x] 21 no-query tx block = plain block; client-placed = E-TX-CLIENT-PLACED; handler tx = E-ERROR-001
      (txRulesPass walks actionPositions).
- [x] 22 W-TX-EXIT-ROLLS-BACK (txExitWarns).
- [x] Gate pins: README tasks, kickstarter ×2 (E-TYPE-031 gone), tutorial 02b / 10 stale markers removed.

## Measurements
- Bootstrap conformance (base b04fdc27a → head): PASS 614 → 614, FAIL 18 → 19, UNSUPPORTED 601 → 600,
  CRASH 0. 0 PASS→FAIL. The one UNSUPPORTED → FAIL is `defer/server-callee-error-total-handler-twin`:
  base already emitted E-ERROR-010 (a case defect — its error type lacks the SqlError variants) behind the
  `,` refusal; filed g-conf-defer-total-handler-twin-error-type-s478.
- Corpus (3150 `.scrml` under samples/, examples/, conformance/cases, self-host-v2/acceptance; raw source,
  single-file bootstrap front end, base vs head): **0 newly-rejecting, 0 newly-accepting**, 2 code-set
  changes (both lose a code: the twin case above loses E-BOOTSTRAP-UNSUPPORTED; examples/29 loses E-TYPE-031).
- New/changed tests red on base: 21 assertions across schema / schema-ddl / sql-row-types / syntax-batch.
- CI gates locally: severity --check, types-gate, snippet-gate, claim-gate, corpus-compile-floor,
  gen-md-shim, s34-census --check-new, delta-lint, e2e-render-map — all PASS.
