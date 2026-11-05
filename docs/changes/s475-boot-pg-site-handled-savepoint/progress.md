# progress — s475-boot-pg-site-handled-savepoint

- 2026-11-05T07:20:05-07:00 start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-a8695a7b436470a5e; base 65820a5e5
- 2026-11-05T07:45-07:00 MEASURED: the bootstrap refuses a Postgres / MySQL envelope at compile time (analyze.scrml envelopeOf, E-BOOTSTRAP-UNSUPPORTED), so the gap's silent loss cannot occur from compiled code on Postgres. On SQLite a site-handled `?{}` inside an envelope ran with NO statement savepoint (a deviation from SPEC item 4), visible through `OR FAIL` partial rows.
- 2026-11-05T07:55-07:00 FIX committed (b48ecd22a): core SqlQuery.handled, lower handledAtSite, print queryJs 6th arg, server-runtime `statement`; savepoint text the same on every driver; plain BEGIN off SQLite; SQLite-only probe; a COMMIT answered with ROLLBACK counts as a failed COMMIT.
- 2026-11-05T08:05-07:00 TESTS: slice-m4/statement-savepoint-s475.test.js (13 tests; 6 RED on base) and slice-m4/statement-savepoint-pg-s475.test.js (8 tests, live Postgres on PGlite 0.5.15 / PostgreSQL 18.6 through pglite-socket on :54371; RED on the base runtime).
- 2026-11-05T08:14-07:00 updated the text of coverage row §8.9.2 (not the generated totals).
