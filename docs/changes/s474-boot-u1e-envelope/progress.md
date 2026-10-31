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
