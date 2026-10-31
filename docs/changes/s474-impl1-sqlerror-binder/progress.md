# progress — s474-impl1-sqlerror-binder (append-only)

## 1. Startup (2026-10-30)
- Worktree `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-a0d8b9b72e9c11d8a`, base = origin/main `34ebef81d`. bun install + pretest OK.
- Baseline pre-commit suite (hook, first commit attempt): 47046 pass / 0 fail / 125 skip.
- Map `.claude/maps/primary.map.md` (stamp d139f747c) read: header themes only; not load-bearing (the locus was in the brief and verified directly in source).

## 2. SPEC re-read (quoted)
- §18.6.1 (SPEC.md ~19724): "**The binder's type** is the type of the failure being handled — the same type the arm's variant patterns name: a call to a function declared `!` (§19.4.1): the declared error enum …; a `?{}` query (§19.8.3): `SqlError`; a client call to a server function (§19.9.10): the call's failure set — `Transport(t: ServerCallError)`, and for a server function declared `! E` the variants of `E` as well".
- §18.17.1 (~20455): "Every enum value has the member `.variant`" / "Reading any member other than `.variant` off a value of a known enum type SHALL be a compile error (**E-TYPE-004**)."
- §19.8.1 (~21714): `type SqlError:enum = { QueryFailed(message: string) …, ConstraintViolation(field: string) …, ConnectionLost … }`; §19.8.4: "SHALL have at least the three variants … The compiler MAY add additional variants"; §8.9.4: `SqlError::BatchPrepareFailed { sites }`.
- §19.8.3 item 3 (~21776): moving the query into a `!` function, `function loadUser(id: int)! -> SqlError { … }`, the caller handles with `!{}`.

## 3. Locus verdict: REFINED
`resolveFailableErrorType` is not itself on the path. `wholeBinderCalleeEnum` calls `resolveErrorEnumThroughAliases(errName, typeRegistry, …)`, which calls `resolveFailableErrorType` → `typeRegistry.get("SqlError")` → undefined (SqlError is in COMPILER_ERROR_TYPE_NAMES, never in the registry), so the enum is null and every use of `e` is E-TYPE-031. Imported: `importedFnErrorEnums` holds nothing for the name (the declaring file cannot resolve SqlError either) and the S473 plain-server-callee branch excludes `canFail` callees → null. Same root for a `?{}` handled at the site: no callee name at all → null (`g-impl1-whole-binder-direct-sql-untyped-s473`).

## 4. Fix (commit 8d6be0b8e + next)
- `SQL_ERROR` binder enum (lazy, frozen, never registered) built from `SQL_ERROR_EXHAUSTIVE_VARIANTS` + `SQL_ERROR_VARIANT_FIELDS` (sql-attempt.ts: the same lists the `?{}` exhaustiveness check and the codegen use); `SqlError | Transport(t)` set for a client call to a server-placed callee.
- `wholeBinderCalleeEnum`: local + imported callee declared `! -> SqlError`, no program `SqlError` enum → that set. Audit site: a `?{}` handled at the site → SqlError.
- Consumers of `resolveFailableErrorType` untouched (exhaustiveness, `?` propagation, qualifier checks keep S466 scope).

## 5. Runtime finding (surfaced, NOT fixed)
Dropping the table under the compiled server: the `! -> SqlError` route answers a plain 500 (the failing `?{}` inside a `!` body throws; §19.8.2 says it "SHALL produce a SqlError variant"), and the declared-`!` client stub `JSON.parse`s the 500 text → host backstop (§19.6.8). The `!{}` arm is never entered, imported or local. Fails closed (no cell written, no server text on the client). Pre-existing: the same holds on base for the `.QueryFailed(m) :>` arm, which compiled before this change. Client routing of declared-`!` callees is out of scope per S473 ruling item 3; delivering `QueryFailed(message)` to the client also exposes the driver's message text — both are rulings. Pinned in the test; gap filed.
The `?{}`-handled-at-the-site shape IS wired: the arm receives `{type:"SqlError", variant:"QueryFailed"}` and `e.variant` reads `QueryFailed` (test).

## 6. Corpus diagnostic differential
Script (scratch, not in repo): `~/.cache/scrml-agent-tmp/s474-impl1-sqlerror-binder/diag-diff.ts` — compiles every `.scrml` under samples/ examples/ conformance/ stdlib/ benchmarks/ (this worktree) and `/home/bmacs/scrmlMaster/flogence` (read-only; output to ~/.cache) with a BASE compiler (`git archive 34ebef81d`) and a HEAD compiler (`git archive` of this branch at `443784c68`, the code under review; later commits change tests/docs only), both extracted under `~/.cache/scrml/review/s474-sqlerror-binder/`, and compares exit code + diagnostic-code multiset per file.
- Result: 2927 sources (samples 881, examples 71, conformance 1852, stdlib 54, benchmarks 7, flogence 62); **0 differ**; exit!=0 base 1185 / head 1185.
- A first run with HEAD = the worktree itself (inside the git repo) and BASE = the extract (outside) showed 33 deltas (E-IMPORT-008 / E-ASYNC-NOT-IN-SCRML / E-NAME-COLLIDES-RESERVED-PREFIX on stdlib and samples): compiler-root-location noise, not this change — gone when both sides are extracts.
- No corpus file (flogence included) has a `! -> SqlError` callee handled by `_ e :>` today, so the delta is expected empty: the change is newly-accepting only on a shape the corpus does not yet contain.

## 7. Residuals observed (pre-existing, not changed)
- One-line `match e { .Unit :> … }` (unit-variant arm first) inside a `!{}` arm is E-SCOPE-001 `match` for ANY enum, client or server (`g-impl1-match-expr-in-bang-arm-client-fn-s473`; it is not client-only). Named binders `.V(field: x)` parse.
- `match e { .QueryFailed(m) :> … }` (positional) inside the arm is E-TYPE-027 (codegen cannot see the subject's enum); named `.QueryFailed(message: m)` compiles and lowers `.data.message`.
- `.QueryFailed(m) :>` directly on an IMPORTED `! -> SqlError` call is E-TYPE-027 (base too); local is fine.
- Block `match e { … }` statement inside a `{ }` arm body is "an expression the compiler does not model" (E-TYPE-031) for any enum.
