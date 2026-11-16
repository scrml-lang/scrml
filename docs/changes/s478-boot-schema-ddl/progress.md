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
