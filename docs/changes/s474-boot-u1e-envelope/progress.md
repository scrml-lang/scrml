# s474-boot-u1e-envelope — progress (append-only)

## 2026-10-30 — start

Worktree `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-afd204ac018a7345d`, branch
`s474-boot-u1e-envelope`, base `34ebef81d` (= origin/main at start).

### Governing sentences (quoted from compiler/SPEC.md before coding)

§8.9.2 (as amended S473): "when a `!` server function's transitive query set contains two or more
`?{}` queries that do not carry `.nobatch()` (through non-`!` and `!` callees, a query counted once per
time it is reached — S473 #1690 review F10, amendment below), the compiler SHALL wrap the handler body
in `?{BEGIN DEFERRED}` / `?{COMMIT}` (`?{ROLLBACK}` on an exception or a `fail` exit) — the implicit
per-handler transaction."

§8.9.2: "The implicit handler transaction SHALL COMMIT only when the handler completes successfully.
It SHALL ROLL BACK when the handler throws AND when it exits through `fail` — at any depth of the body
— including a `?` that propagates a callee's failure (§19.5.2 …). The failure value is returned to the
caller unchanged; only its writes are undone."

§8.9.2 amendment F10: "An inner `!` function called inside an outer envelope runs as a nested
savepoint (§19.10.6), so the outer envelope can roll back the inner's writes. A query is counted once
per time it is reached: one reached through two calls … counts twice, as one inside a loop does."

§8.9.2: "**An envelope covers its own database only — no cross-database atomicity (S451 ruling 4a).**
… a **write** to a database B other than A that the envelope's extent can reach … SHALL be a compile
error: **E-SQL-011** … Reading database B inside the envelope is allowed".

§8.9.2: "`BEGIN DEFERRED` is the SQLite spelling; on a Postgres or MySQL database (§44.2) the opening
statement SHALL be a plain `BEGIN`".

§8.9.2 amendment (review-surfaced 2): "A `?{PRAGMA journal_mode = OFF}` … inside a `!` function SHALL
be a compile error, **`E-SQL-JOURNAL-OFF`**" (stays — journalDiags, untouched).

§19.10.5: "A client-placed `!` function SHALL NOT make two or more server calls … `E-TX-CLIENT-MULTI-CALL`
… This is a permanent rule, not an interim refusal." (stays.)

§19.10.5: "The implicit envelope SHALL roll back on a `fail` exit (including `?` propagation) as well as
on an exception, and commit only on successful completion".

§19.10.6: "Concurrent requests SHALL NOT observe or join another request's open transaction"; "A
transaction SHALL hold its connection from its `BEGIN` until its `COMMIT` or `ROLLBACK`, across every
suspension point in between. On a single-connection database (SQLite), a statement from another request
SHALL wait until the transaction ends. Waiting requests SHALL be served in arrival order."; (R5) "The
gate covers every statement on the connection"; "A statement issued by the request that owns the
transaction — including from a server function that request calls in-process — SHALL run inside the
transaction without waiting."; "The connection SHALL be released on every exit path: after `COMMIT` or
`ROLLBACK`, after a `BEGIN` that fails …"; "A failed `COMMIT` SHALL NOT release the connection … the
`ROLLBACK` that follows releases it"; **Nesting**: "A `BEGIN` issued by a request that already owns an
open transaction on that database … SHALL open a savepoint, not a second transaction: its `COMMIT`
releases the savepoint and its `ROLLBACK` rolls back to it, and neither commits, ends, or releases the
enclosing transaction."; **Pooled drivers**: "A transaction SHALL run on one connection taken from the
pool for it alone".

### Rulings (user-voice-scrml.md §S473, read verbatim)
- D1: "the bootstrap SHALL refuse code whose server guarantee it does not build (transaction envelope,
  …), never compile it without the guarantee."
- D28: "every construct the bootstrap does not build gets a NAMED refusal, from one table."
- "the transitive `!` envelope counts QUERIES, not writes"; F10 "`!` callees count … nested savepoint
  … Reach multiplicity counts"; F11 "client-placed `!` … two or more server functions is a PERMANENT
  named refusal".

## 2026-10-30 — unit 1: server runtime (gate + envelope + savepoints)

Measured first (Bun 1.4.3, Bun.SQL sqlite :memory:): raw `BEGIN DEFERRED` through the tagged template
works; an autocommit INSERT from a second async flow issued while the first sat between BEGIN and
ROLLBACK ran INSIDE the first's transaction and was rolled back with it (so the §19.10.6 gate is a
precondition of any envelope); an `ON CONFLICT ROLLBACK` conflict ends the transaction by itself and the
next statements autocommit (so a failed statement inside an envelope is followed by a probe).

`server-runtime.js`: `fifoGate()` per connection; AsyncLocalStorage scope = the owning transaction;
`query` runs in the owned transaction or through the gate; `envelope(conn, run, standalone)` —
BEGIN DEFERRED / COMMIT / ROLLBACK, SAVEPOINT / RELEASE / ROLLBACK TO when nested; broken-transaction
probe. Scratch check (8 scenarios: commit, fail, throw, outer-undoes-inner, inner-savepoint-rollback,
concurrent isolation, auto-rollback detection, non-standalone plain) all as expected.

## 2026-10-30 — unit 2: the envelope in the compiler (commit 4bf8d92e3)

- core.scrml: `Envelope { fn, db, standalone }`, `CoreProgram.envelopes` (7 literal sites updated).
- analyze.scrml: the s473 interim refusal in `envelopeDiags` is REMOVED (manual-tx refusal and F11
  stay there); new `envelopePass` / `envelopeOf` after the per-function loop of `placePass`:
  every `!` function with a non-empty transitive query set gets an Envelope (`standalone` = the
  S473 trigger: 2+ queries, one reached twice, or one in a loop/lambda/recursion). Named refusals
  for what is not built: E-SQL-011 (SPEC code, write to another db), E-BOOTSTRAP-UNSUPPORTED for a
  read of another db, a pooled (PG/MySQL) envelope, and a client `!` whose one server call is a
  non-`!` function running the queries. F11 false positive fixed: a server-only (inherited, §12.2
  T5) function's calls are in place, not requests (`txQuerySets(…, inherited)`).
- print.scrml `envelopedFnJs` / print-server.scrml `bodyFnJs`: the body becomes inner
  `async function body$()`, the function returns `await rt.envelope(db$N, body$, standalone)`;
  printer fail-closed `envelopeRefusal`.
- check.scrml C-TX1..C-TX3 (`checkEnvelopes`).
- severity.scrml regenerated (+E-SQL-011).
- Hook: 52356 pass / 0 fail / 152 skip (same as baseline).

## 2026-10-30 — unit 3: tests + acceptance

- slice-m4/envelope-s474.test.js (24 tests): the emitted server against a real SQLite FILE, every
  assertion a SELECT through a second connection (bun:sqlite) after the response. BITE checks
  (temporary env-var switches in server-runtime.js, reverted, never committed): envelope → plain
  run: 9 of the runtime tests fail; gate off for autocommit statements: the R5 interleaving test
  fails (all six concurrent plain writes rolled back inside another request's envelope).
- acceptance/envelope/ — 4 runtime cases (sqlEngine real) + 5 neg cases; STATUS rows added.
- ruled-refusals-s473 / failclosed-sql-protect-s473 tests converted from "refused" to "compiles,
  with the Envelope" (the interim-refusal assertions).

## 2026-10-30 — unit 4: docs, refusal text, more runtime exits

- parse.scrml: the `transaction { }` refusal no longer promises "arrives with unit U1e" (U1e built
  the implicit envelope, not the block form).
- slice test +5: a trap (out-of-range index) after two writes → 500, nothing persisted; runtime exits
  over a real SQLite with an injecting driver — failed COMMIT (ROLLBACK follows, throws, gate
  released), failed BEGIN (released, body never runs), ON CONFLICT ROLLBACK (nothing after it
  autocommits, envelope throws), a non-rolling constraint violation stays a failure value.
- docs/known-gaps.md: g-boot-implicit-envelope-unbuilt-not-refused-s473 RESOLVED;
  g-boot-manual-tx-left-open-no-gate-s473 narrowed (gate built, manual form still refused); NEW
  g-boot-envelope-pooled-and-cross-db-read-refused-s474 (MED, open). gap-counts hunk regenerated
  (only that hunk — the master-list.md change from `state.ts --write` was reverted).
- docs/bootstrap-spec-coverage.md: §8.1.1 E-SQL-011 → BUILT; §8.9.2 / §19.10.5 / §19.10.6 → PARTIAL
  (SQLite built; pooled / cross-db read / client non-`!` callee refused); §8.6, §8.9.2 manual,
  §19.10.1-4, §8.5.3, §44.6 evidence refreshed. `spec-coverage-check.ts`: 0 warnings, 0 violations.
- Conformance (`bun scripts/bootstrap-conformance.ts`): before PASS 283 / FAIL 241 / NOT-TWINNED 685
  / UNSUPPORTED 604; after IDENTICAL, no verdict bucket or emitted-code change (no corpus case hit
  the interim refusal). docs/bootstrap-conformance.md rewritten (`--write`; only the
  transaction-block reason text changed). Acceptance (`--cases compiler/self-host-v2/acceptance`):
  before PASS 235 / FAIL 0 / UNSUP 3; after PASS 244 / FAIL 0 / UNSUP 3 (+9 new envelope cases).
- Empirical (CLI, default host = Bun.SQL on a real file): `bun run boot:compile` of
  acceptance/envelope/{fail-rolls-back,savepoint}/case.scrml, the emitted program.server.js driven by
  POSTs, SELECT through bun:sqlite after each:
    move(6) -> HTTP 500 {"__scrml_error":true,"type":"E","variant":"Bad","data":{}}  -> []
    move(1) -> HTTP 200 1                                                             -> [1,2]
    outerFails(1) -> HTTP 500 … "Bad"                                                -> []
    outerHandles(1) -> HTTP 200 0                                                     -> [1,2]
