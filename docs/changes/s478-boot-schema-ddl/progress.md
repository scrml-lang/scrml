# s478-boot-schema-ddl — progress

Branch `s478-boot-schema-ddl` (from origin/main 716265978).

## Done
- `compiler/self-host-v2/sql.scrml`: `ddlScan` exports the existing whitelist scanner (`scanRun`) for the DDL reader.
- `compiler/self-host-v2/schema.scrml`: raw `CREATE TABLE` (bare, or `?{`-backtick-wrapped) read by a whitelist (`readDdl`) into SchemaTable/SchemaCol; §39.2 E-SCHEMA-012/013/014 on raw heads; SQL `--` / `/* */` comments between declarations; fail-closed refusals (other statements, comments inside a statement, CR in `--`, nested/unclosed `/*`, CREATE TABLE text outside a live declaration, `tenant_id` anywhere, non-primary types, trailing clauses, multi-statement wrappers, `${}` in DDL).
- `severity.scrml` regenerated (E-SCHEMA-014 newly emitted).
- Test: `compiler/self-host-v2/slice-m4/schema-ddl-s478.test.js` (28 tests; 16 red on base).
- known-gaps: new `g-boot-schema-ddl-affinity-s478`, `g-boot-schema-ddl-trailing-s478`; `g-boot-schema-interim-refusals-s478` text updated.

## Measurements
- Bootstrap conformance base = head: PASS 574 / FAIL 17 / UNSUPPORTED 642; 0 PASS→FAIL. All 59 raw-DDL cases move to their next blocker (protect= / `<db tables=>` / `auth="none"` ×35, tenant floor ×22, ALTER ×2). The 13 `${ schemaFor }` cases unchanged.
- Corpus (207 `<schema>` files, samples/examples/conformance): 0 newly-rejecting, 0 newly-accepting; 4 samples lose the raw-DDL refusal.

## Remaining
- hook commit, CI checks, PR.

## Fix round 1 (S478 #1925 review + owner rulings, user-voice eeafd4d)
- Ruling 1: a raw column type outside §14.8.3's primary list (or none, or a multi-word name) is E-SCHEMA-004 (readDdlCol).
- Ruling 2: `STRICT` / `WITHOUT ROWID` admitted (`,`-list); WITHOUT ROWID PK columns non-null (column- and table-level, composite); `SchemaTable.strict`; SQLite's CREATE refusals (no PK / AUTOINCREMENT with WITHOUT ROWID, CHAR/VARCHAR/CLOB/FLOAT/DOUBLE in STRICT) refused by name. Verified on real SQLite 3.53.4.
- F1: DEFAULT kind vs column type, both forms (defKind / ddlDefKind / defaultKindRefusal). F3: string literals of live statements are scanned for `CREATE … TABLE`. F4: W-SCHEMA-001 for a raw table with no PRIMARY KEY.
- F2: gap text corrected (g-boot-schema-ddl-affinity-s478 + -trailing resolved by the rulings; g-boot-sql-row-field-types-owner-s478 owner question: boundary validation via §57 decode, INTERIM).
- SPEC: §14.8.3 + §39.4 amended (S478 ruling (user-voice)).
- Measured: conformance = base (574/17/642, 0 PASS→FAIL); corpus 0 newly-rejecting (vs base and vs 4e3324201), 3 tenant/* neg cases gain W-SCHEMA-001; CI checks gates green.
