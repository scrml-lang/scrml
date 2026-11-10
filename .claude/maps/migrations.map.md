# migrations.map.md
# project: scrml
# updated: 2026-11-08T16:47:39Z  commit: f92d1a8fb
# The repo has no database of its own. This map covers the schema-migration machinery the compiler provides to user programs (SPEC §39, :33429).
# No migration code changed fa0e875b4..f92d1a8fb.

## Tool
Library: compiler-internal. Desired state = the program's `<schema>` block; actual state = the live DB.
compiler/src/schema-differ.js (4,364 lines) — computes migration SQL from desired `<schema>` vs actual state (SQLite `PRAGMA table_info()`)
compiler/src/commands/db-migrate.js — `scrml db-migrate <project-dir|entry.scrml> --db <connection-url> [options]`: applies the reconciling DDL (including §14.8.11 db-authoritative RLS/role DDL) to a real database. `--db` is required (the privileged migrator connection)
compiler/src/commands/introspect.js — `scrml introspect <postgres-url> [--out f] [--table n]`: reads a live Postgres schema and emits `<schema>` source (the inverse of db-migrate)
compiler/src/commands/migrate.js — `scrml migrate`: SOURCE rewrites for deprecated syntax (`--dry-run`, `--check`, `--program-shape`, `--report`). It is NOT a database migrator (see non-compliance.report.md N-S475-1)
compiler/src/codegen/db-authoritative.ts, codegen/db-driver.ts, codegen/sqlite-defaults.ts, codegen/sqlite-file-target.ts — emitted DB setup
Config: `<program db="…">` or a direct-child `<db src="…">`; built output reads SCRML_DATA_DIR for SQLite file targets
Directory: no migrations directory; the diff is computed at compile/apply time

## Naming Convention
Not applicable (no migration files are written by the compiler at f92d1a8fb: no code in compiler/src writes `<db-path>.migration.sql` / `.migration.json`).

## Latest Migration
Not applicable.

## Rollback
Manual. db-migrate applies DDL to the live DB; no down-migrations.

## Bootstrap (impl#2)
`<schema>` is REFUSED-LOUD on the bootstrap (E-BOOTSTRAP-UNSUPPORTED via analyze.scrml `structuralOwner`); gap `g-boot-schema-unbuilt-s473` (docs/bootstrap-spec-coverage.md §39 rows).

## Examples / tests
examples/17-schema-migrations.scrml, examples/26-type-derived-schema.scrml; conformance/cases/schema/; compiler/tests/integration/db-authoritative-p2-pg.test.js (Postgres; skip with SCRML_PGTEST=0); compiler/tests/commands/migrate-program-shape-fixtures/.

---

# Carried detail (pre-f92d1a8fb body sections)
The sections below are the previous map generation's body (mostly impl#1, `compiler/src`), carried rather than lost. They were NOT re-read line by line. Each carries a verification line from f92d1a8fb: code identifiers checked to exist, `symbol` :line anchors re-derived by grep, cited paths checked, cited gaps whose marker is no longer `open`, and STALE-RISK flags for the CI/bot facts that changed in S468–S475. Where a carried section disagrees with a refreshed section above, the refreshed section wins.

## (carried) Model — desired-state reconciliation, not versioned migration files
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 10/10 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

`scrml db-migrate <project-dir|entry.scrml> --db <migrator-url>` is the APPLY inverse of
`scrml introspect`'s EMIT (introspect: live DB → `<schema>` source; db-migrate: desired `<schema>` →
reconciling DDL on the live DB). Every run:

1. Parses the project's `<schema>` (all `.scrml` files, live parse pipeline `splitBlocks`→`buildAST`,
   merged first-decl-wins) into the DESIRED table/column/fn set via `extractDesiredSchema`.
2. Reads the ACTUAL live-DB state (`readActualSchemaPg` for Postgres / `readActualSchema` for
   SQLite) PLUS, on Postgres, a narrow scrml-managed-object PRESENCE read (`pg_policies WHERE
   policyname LIKE 'scrml\_%'`, `pg_roles WHERE rolname = 'scrml_app'` — Fork 2, minimal
   object-awareness, NOT a full object-aware policy/trigger/function differ).
3. `diffSchema(desired, actual, {driver, allowDestructive, queriedTables, queriedPrivileges})`
   computes the reconcile plan: `CREATE TABLE`/`ALTER TABLE … ADD/DROP COLUMN` for structural drift,
   PLUS (NEW S290) **per-column CONSTRAINT drift on an EXISTING column** (`columnConstraintDrift` —
   NOT NULL / UNIQUE / REFERENCES / DEFAULT; Postgres reconciles it and warns
   `W-SCHEMA-CONSTRAINT-TIGHTENED`, SQLite cannot `ALTER` a constraint at all so nothing is applied
   and the plan is reported WITHHELD via `W-SCHEMA-CONSTRAINT-DRIFT-UNAPPLIED`), PLUS (NEW S292)
   **`GRANT` statements for NON-db-authoritative tables the app's `?{}` bodies actually touch**
   (see "Queried-table grants" below), PLUS (Postgres only, per
   `db-authoritative` table) the idempotent §14.8.11 DDL — S1 RLS+policy, S6 bounded-role GRANT
   (S3-reshaped whenever any column is EFFECTIVELY immutable: author-marked `immutable`, OR the
   table's PRIMARY KEY, OR `tenant_id` — **auto-immutable as of S288**, `isEffectivelyImmutable` in
   schema-differ.js, see schema.map.md. Every `db-authoritative` table always carries a PK, so this
   branch is now ALWAYS taken for such a table — the prior "zero-immutable-columns emits
   byte-identical to M1" guarantee is RETIRED, SPEC §14.8.11.2 records the supersession explicitly)
   — PLUS (Postgres only, if any `fn` is declared) the §14.8.11.2 S4 SECDEF mutation-choke DDL
   (`generateScrmlHasCapDDL` once + `generateSecdefDDL` per `fn`).
4. Applies the WHOLE plan in ONE transaction under the migrator connection; a statement failure
   rolls the entire run back (no partial-apply state). **S288: a statement failure is now
   ATTRIBUTED to its exact index + SQL text** — see "Failing-statement attribution" below.

Because every piece of DDL the tier emits is IDEMPOTENT (`CREATE ROLE … EXCEPTION WHEN
duplicate_object`, `DROP POLICY IF EXISTS` + `CREATE POLICY`, `CREATE OR REPLACE FUNCTION`, natural
`GRANT`/`ALTER TABLE ENABLE/FORCE ROW LEVEL SECURITY` idempotency), re-running `db-migrate` against
an already-migrated database is a SAFE no-op re-assertion, not an error — this is what lets the tool
skip a versioned migration-file history entirely.

## (carried) Queried-table grants (NEW S292, §14.8.11) — the fix that makes the PRESCRIBED shape work
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 10/10 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. Cited gaps whose marker is no longer open: g-dbauth-migrate-no-grants-for-unmarked-identity-table=resolved._

**The defect (`g-dbauth-migrate-no-grants-for-unmarked-identity-table`, was HIGH).** The bounded-role
`GRANT` is emitted **per db-authoritative TABLE**, but the `SET LOCAL ROLE scrml_app` drop is emitted
**per `?{}` QUERY in any request scope**. So the moment ONE table is `db-authoritative`, EVERY
request-scope query runs as `scrml_app` — including reads of tables that were never marked, which
have no grants and fail with `permission denied for table users`. And §14.8.10's own corollary
PRESCRIBES leaving the identity table unmarked (you cannot tenant-scope the table that tells you the
tenant). **The documented, recommended shape was the broken one, and it failed closed at login with
an opaque Postgres error.** bryan RULED direction (b) at S292: grant the tables the queries touch.

**Mechanism, three files.**
1. `sql-table-refs.js` (`tableRefsInSource`) scans every `?{}` body in every project file, returning
   `{tables, privileges, undetermined}` — with the privilege each reference IMPLIES (`from`/`join`
   -> SELECT, `insert into` -> INSERT, `update` -> UPDATE, `delete from` -> DELETE; `PRIV_RANK`
   resolves `DELETE FROM`'s double match).
2. `commands/db-migrate.js` `parseProjectSchema` unions those across the project into
   `{queriedTables, queriedPrivileges, undeterminedSql}` and threads the first two through
   **`runPgApply`'s WIDENED signature** — `{connectionString, desired, dryRun, allowDestructive,
   queriedTables, queriedPrivileges}` — into `diffSchema`'s options at all three call sites.
3. `schema-differ.js` `diffSchema` emits, for each NON-db-authoritative desired table present in
   `queriedTables`:
   `-- §14.8.11: <t> is not db-authoritative but is read under SET LOCAL ROLE scrml_app.`
   `GRANT <exercised privileges> ON "<t>" TO scrml_app;`

**Four scope decisions, each deliberate:**
- **Gated on ≥1 db-authoritative table.** That is exactly when the role exists and the role-drop is
  emitted; with none, there is no `scrml_app` to grant to and the statements would fail.
- **Only the privileges the queries actually exercise.** Blanket CRUD would hand the bounded role
  DELETE on the IDENTITY TABLE, which login merely SELECTs — strictly more permissive than the
  db-authoritative path beside it, which narrows UPDATE to mutable columns.
- **Absent privilege info falls back to SELECT, not CRUD** — least privilege that can make a read work.
- **NO RLS, NO POLICY, NO column-scoped UPDATE narrowing.** Those are the db-authoritative tier's
  guarantees and an unmarked table has deliberately not opted into them. This grants exactly the
  access the app already demonstrably needs.

**The honest boundary is REPORTED, never guessed.** scrml carries no compile-time SQL parser, so the
scanner refuses five shapes outright — a CTE (`WITH … AS (`, whose name shadows a real table), a
subquery in `FROM` or `JOIN` position, a `LATERAL` join, and a dynamic `EXECUTE`. Each lands in
`undetermined`, and `runDbMigrate` prints a per-fragment operator warning: *"could not determine the
table(s) this query touches, so no grant was derived for it. If it reads a table that is NOT
db-authoritative, that read will fail with `permission denied` at request time — grant it
manually."* **A caller must never read an empty `tables` as "touches nothing"** — that is precisely
how this bug reproduces on a different table, and the failure mode (opaque `permission denied` at
request time) cost the reporting adopter three sessions.

## (carried) Constraint-drift reconcile (NEW S290, §38.6.2 rows 6/7/8 + §38.6.3)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 1/1 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. Cited gaps whose marker is no longer open: g-db-migrate-ignores-constraint-drift-on-existing-columns=resolved._

§38.6.2 always specified eight operations; only ADD / DROP / RENAME COLUMN were built, so **every
constraint change on an existing column was silently ignored**
(`g-db-migrate-ignores-constraint-drift-on-existing-columns`). This is a conformance RESTORATION.

- `columnConstraintDrift(desiredCol, actualCol)` (`schema-differ.js`, exported) reports
  `{notNull, unique, references, default}`. PK-aware (a PRIMARY KEY is implicitly NOT NULL and
  UNIQUE — do not fight the driver over an implied constraint) and default-tolerant via
  `sameDefaultText` (drops a PG `::type` cast suffix, unwraps one quote layer, case-folds), so a
  driver's echoed default never reads as permanent phantom drift.
- **Postgres** reconciles via `ALTER TABLE … SET NOT NULL` / `ADD CONSTRAINT … UNIQUE` /
  `ADD CONSTRAINT … FOREIGN KEY`, each preceded by `W-SCHEMA-CONSTRAINT-TIGHTENED`. Adding a
  constraint to a POPULATED table will FAIL if a NULL, duplicate or orphan row exists — that failure
  is CORRECT (the data does not match the declared schema) and rolls back atomically; the warning
  exists so an operator can backfill first rather than decode a driver error.
- **SQLite cannot change a constraint via `ALTER` at all**, so reconciling needs the §38.6.3
  full-table rebuild — destructive, refused by default. NOTHING is applied for that column and
  `W-SCHEMA-CONSTRAINT-DRIFT-UNAPPLIED` fires. **`printPlan(plan, actualTableCount, warnings)`
  (`db-migrate.js`:291) now filters for that code** and prints
  `plan: 0 statements — but N column(s) have constraint drift that was NOT applied. NOT up to date.`
  An EMPTY plan and a SUPPRESSED plan are different states; printing them identically told the
  operator the database matched the schema when it did not.

## (carried) `E-SCHEMA-011` — the foreign-key production is now enforced (S290, §39.5.5)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 2/2 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

`references <table>(<column>)` — table name OUTSIDE the parens — is the ONLY production. Every other
shape (`references(owners.id)`, `references owners (id)`, `references owners.id`) was **silently
DROPPED**: the column compiled and migrated clean with no `REFERENCES` clause and no diagnostic. An
adopter declared 34 foreign keys in a real 19-table ledger schema and got **zero rows in
`pg_constraint`**; an INSERT naming a non-existent parent was accepted. RULED S290: reject rather
than admit a second form (admitting is newly-accepting beyond the contract, a §8 one-way door;
rejecting is recoverable; the corpus migration was MEASURED at 17 sites, all of them scrml's own
documentation). Since S290 `db-migrate` ALSO reconciles a `REFERENCES` clause onto an existing table
(§38.6.2) — Postgres via `ADD CONSTRAINT`, SQLite via the gated §38.6.3 rebuild. See error.map.md.

## (carried) Failing-statement attribution (NEW S288)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 3/3 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

Both apply loops (the Postgres transaction loop in `runPgApply`, and the SQLite loop in
`runSqliteApply`) now wrap each statement's execution individually: on a throw, they attach
`e.scrmlFailedStatement = {index, total, sql}` before rethrowing. The CLI's error path
(`printFailedStatement`, `db-migrate.js`) echoes it:

```
error: migration failed (rolled back): relation "nonexistent_table" does not exist
  failing statement: (2 of 8)
    CREATE TABLE "bad_two" ( ... )
```

**Motivation (adopter S5 signal, offered as data, not filed as a bug):** the whole plan is printed
BEFORE the apply step, so an error's position in the printed output previously said nothing about
which statement actually failed — and Postgres's own message can point nowhere near the cause (e.g.
the pre-fix `default(now())` truncation bug surfaced as a misleading `syntax error at or near ";"`
with no indication which `CREATE TABLE` was truncated). The adopter burned a bisection cycle on that
exact combination before disproving a wrong hypothesis by repro. Verified by executing a
deliberately-failing migration against real PG16, not by reading the emit.

## (carried) Privilege separation (load-bearing, §14.8.11.1)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 0/0 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

`--db` is the MIGRATOR/owner connection — a DDL-capable role (`CREATE ROLE`, `ALTER TABLE … FORCE
ROW LEVEL SECURITY`, `CREATE POLICY`, `GRANT`). The RUNNING APP is a DIFFERENT, bounded principal:
the emitted server connects and, per query, `SET LOCAL ROLE scrml_app` (a `NOLOGIN NOBYPASSRLS` role
with CRUD-only grants) — it is, BY CONSTRUCTION, unable to apply or alter the security DDL (a role
that could install the RLS policy could also `DROP POLICY` it). So the apply step is OUT-OF-APP, run
by an operator/CI under the migrator credential — NEVER by the app runtime. Auto-apply-on-boot is
ELIMINATED for Postgres (a `scrml dev` local auto-apply and a `scrml build`-emitted `.sql` artifact
are separately-scoped, unbuilt fast-follows). Mirrors PostgREST's migrator-vs-authenticator
discipline.

## (carried) The ledger — `_scrml_migrations` (thin, NOT a version history)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 1/1 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

```sql
CREATE TABLE IF NOT EXISTS "_scrml_migrations" (
  id bigserial PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  object_kind text NOT NULL,
  object_name text NOT NULL,
  ddl_hash text NOT NULL
);
```

One row per applied STATEMENT (not per migration run), recording what scrml authored
(`{table|policy|function|role|grant|revoke|alter|drop-policy|drop-table}` via
`classifyStatement` in `db-migrate.js`) + a content hash (`Bun.hash(stmt)`). Purpose: apply-atomicity
(guarded by a `pg_advisory_xact_lock(<fixed key>)`, transaction-scoped so a dead migrator process
leaks no lock) + OBJECT-AUTHORSHIP (an audit can answer "did scrml author this object" without a
full object-aware differ). There is no per-file migration history and no migration-authoring
surface — the S7-full object-aware policy/trigger/function differ is a separately-scoped, deferred
tail.

## (carried) Naming Convention
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 4/4 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
N/A — no migration files exist. The only naming surface is the ledger's `object_kind`/`object_name`
classification (above) and the DB-authoritative constant names: `scrml_app` (the bounded role),
`scrml_tenant_iso` (the tenant-isolation policy), `scrml.tenant`/`scrml.principal.caps` (the two
txn-scoped GUCs).

## (carried) Latest Migration
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 0/0 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
N/A — desired-state reconciliation has no "latest" concept; every run reconciles against the
project's CURRENT `<schema>` source. The ledger's most recent row (`ORDER BY applied_at DESC LIMIT
1`) is the closest analog, but it is an audit trail, not a migration pointer.

## (carried) Rollback
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 0/0 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
Manual. There is no `scrml db-migrate down` / no-op inverse — the tool is forward-reconcile only.
To remove a table: delete it from `<schema>` and re-run `db-migrate` with `--allow-destructive` (the
never-clobber fence otherwise refuses a bare `DROP TABLE` and fires `W-SCHEMA-DESTRUCTIVE-DROP`,
since a Postgres DROP CASCADEs the table's attached RLS policy/grants/role membership). scrml NEVER
emits `DROP FUNCTION`/`DROP ROLE` for a SECDEF/owner role, so a P2 `fn`/owner is never
auto-rolled-back either — remove it by hand if truly retiring it.

## (carried) Never-clobber fence (Fork 3)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 1/1 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
A bare `DROP TABLE` for an actual-but-not-desired table is REFUSED by default
(`options.allowDestructive === false`, `diffSchema` in `schema-differ.js`) — fires
`W-SCHEMA-DESTRUCTIVE-DROP` instead, pointing the operator at `--allow-destructive`. The
scrml-managed security objects are roles/policies (never tables), so the table-DROP gate is the
whole fence at the table grain; `DROP POLICY IF EXISTS scrml_tenant_iso` re-creates ONLY the
scrml-managed policy name, never touching a hand-authored one on the same table.

## (carried) Known open gaps (`docs/known-gaps.md`)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 5/5 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. Cited gaps whose marker is no longer open: g-db-migrate-check-constraint-oneof-pattern=resolved, g-db-migrate-default-emission=resolved, g-db-migrate-ignores-constraint-drift-on-existing-columns=resolved, g-dbauth-migrate-no-grants-for-unmarked-identity-table=resolved, g-dbauth-p2-pk-tenant-not-auto-immutable=resolved._

**RESOLVED S292 — `g-dbauth-migrate-no-grants-for-unmarked-identity-table`** (was HIGH, adopter
login-500). See "Queried-table grants" above. The residual is the scanner's documented boundary, not
a silent hole: an `undetermined` fragment is reported to the operator.

**RESOLVED S290 — `g-db-migrate-ignores-constraint-drift-on-existing-columns`.** See
"Constraint-drift reconcile" above (§38.6.2 rows 6/7/8 + the §38.6.3 SQLite withheld-plan report).

**RESOLVED S290 — the `references` silent-drop** (now `E-SCHEMA-011`, §39.5.5). See above.

**RESOLVED S288 — `g-db-migrate-check-constraint-oneof-pattern`.** All three original sub-bugs
verdicted against real Postgres 16 through the real CLI: (1) the unquoted-bareword CHECK — FIXED
(the `oneOf`/`notIn` SQL-literal lowering, see schema.map.md's literal-lowering-functions section);
(2) the false `E-DBAUTH-NO-TENANT-COLUMN` pre-flight fire — tried 9 shapes, NOT REPRODUCED; (3) the
`pattern(/…{n}…/)` brace — was ALREADY fixed by P2, now regression-locked.

**RESOLVED S288 — `g-db-migrate-default-emission`** (was HIGH) — `default(now())` truncated the
whole `CREATE TABLE` (the old `[^)]+` capture stopped at the first `)`) and `default("US")` emitted
the SQL IDENTIFIER `DEFAULT ("US")` instead of a string literal; both fixed in the same landing
(`findMatchingParen` balanced two-pass scan + `lowerDefaultToSql`). Blocked 7 of the adopter's 10
real tables pre-fix.

**RESOLVED S288 — `g-dbauth-p2-pk-tenant-not-auto-immutable`.** See schema.map.md's
`isEffectivelyImmutable` — a `db-authoritative` table's PRIMARY KEY and `tenant_id` are now
auto-immutable regardless of the `immutable` bareword.

**Still open:** `g-schema-predicate-arg-parse-edges` (MED, NEW S288) — `oneOf([])` on an empty array
still emits invalid SQL (`CHECK (col IN ())`) rather than a compile rejection or `CHECK (false)`;
`escapeSqlString` doesn't escape `\` (a latent MySQL-only trap, unreachable today — MySQL apply is
hard-refused, "Phase 3" in `db-migrate.js`). `g-dbauth-p2-caps-provenance` (MED, S287) —
`tenant-egress.ts`'s `_scrml_active_caps(req)` has no real session-caps source yet, so any
`requires cap("x")` SECDEF is inert-deny until wired (couples to S8 live revocation).
`g-dbauth-secdef-owner-crud-all-tables` (LOW, S287) — a SECDEF owner role gets CRUD on every
db-authoritative table, not just the ones its `fn` body touches. `g-dbauth-no-request-path-test`
(MED, NEW S288) — the tier's regression lock (`schema-only-tenant-principal.test.js`) asserts
EMISSION, not a real login-over-HTTP → cookie → per-user-read round trip; The adopter has offered
their own request-path harness. `g-dbauth-docs-no-do-not-mark-users-example` (LOW, NEW S288) — the
`db-authoritative` marker reads as "apply to everything"; ask is a worked counter-example (don't
mark the `users` table itself — the login lookup that establishes the principal can't yet BE the
principal) in the docs pass.

Also see error.map.md (the exact §34 fire sites) and schema.map.md (the lowering-function
inventory and `isEffectivelyImmutable`).

## Section audit (migrations.map.md, pre-f92d1a8fb → this file)
| old section | disposition |
|---|---|
| dated `S4xx — … DELTA` / `ZERO DIFF FOR THIS MAP` blocks and the stacked header stamps | dropped: dated stamp blocks |
| Tool | now lives in migrations.map.md "Tool" (re-read; adds introspect + the §39.8 mismatch) |
| Model — desired-state reconciliation, not versioned migration files | carried above as "(carried) …" (10/10 ids; anchors 0 ok/0 re-derived; flags 0) |
| Queried-table grants (NEW S292, §14.8.11) — the fix that makes the PRESCRIBED shape work | carried above as "(carried) …" (10/10 ids; anchors 0 ok/0 re-derived; flags 0) |
| Constraint-drift reconcile (NEW S290, §38.6.2 rows 6/7/8 + §38.6.3) | carried above as "(carried) …" (1/1 ids; anchors 0 ok/0 re-derived; flags 0) |
| `E-SCHEMA-011` — the foreign-key production is now enforced (S290, §39.5.5) | carried above as "(carried) …" (2/2 ids; anchors 0 ok/0 re-derived; flags 0) |
| Failing-statement attribution (NEW S288) | carried above as "(carried) …" (3/3 ids; anchors 0 ok/0 re-derived; flags 0) |
| Privilege separation (load-bearing, §14.8.11.1) | carried above as "(carried) …" (0/0 ids; anchors 0 ok/0 re-derived; flags 0) |
| The ledger — `_scrml_migrations` (thin, NOT a version history) | carried above as "(carried) …" (1/1 ids; anchors 0 ok/0 re-derived; flags 0) |
| Naming Convention | carried above as "(carried) …" (4/4 ids; anchors 0 ok/0 re-derived; flags 0) |
| Latest Migration | carried above as "(carried) …" (0/0 ids; anchors 0 ok/0 re-derived; flags 0) |
| Rollback | carried above as "(carried) …" (0/0 ids; anchors 0 ok/0 re-derived; flags 0) |
| Never-clobber fence (Fork 3) | carried above as "(carried) …" (1/1 ids; anchors 0 ok/0 re-derived; flags 0) |
| Known open gaps (`docs/known-gaps.md`) | carried above as "(carried) …" (5/5 ids; anchors 0 ok/0 re-derived; flags 0) |
| Tags | replaced by the new footer |
| Links | replaced by the new footer |

## Tags
#scrml #map #migrations #schema #db-migrate #sqlite #postgres

## Links
- [primary.map.md](./primary.map.md)
- [config.map.md](./config.map.md)
- [non-compliance.report.md](./non-compliance.report.md)
- [master-list.md](../../master-list.md)
- [pa.md](../../pa.md)
