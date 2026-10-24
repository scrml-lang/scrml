# s469-hook-flakes — progress

Test-infrastructure lane. Fix the tests that fail intermittently in the pre-commit hook and pass alone. The hook,
its sharding, env vars and parallelism are unchanged. No `compiler/src` change.

Harness scripts (not committed) live in `~/.cache/scrml/lanes/hook-flakes/`: `loop.sh` (N runs: solo / two
concurrent copies / under busy-loop CPU load), `pairconc.sh` (two files in two processes at once, as two shards),
`shard.sh` (a hook shard's exact file list from `--plan`, one process), `poison/aaa-poison.test.js` + `poison-scan.sh`
(a file that leaves the SQL fallback handle in the multi-database state, run ahead of each candidate).

## 1. SQL fallback handle leaks across test files (`_scrml_sql_UNRESOLVED`)
- Cause: `compiler/src/codegen/sql-handle-name.ts` keeps a module-level fallback handle, set per file by the
  codegen entry (`setFileSqlFallback`). Tests that call `emitLogicNode` / `rewriteSqlRefs` / `rewriteServerExpr`
  directly skip that entry, so they read whatever the last compile in the process left. After a file that compiled
  a two-database program (e.g. `program-db-driver-resolution.test.js`) it is `_scrml_sql_UNRESOLVED`. Order inside
  a shard decides; adding a test file reshuffles the shards. Deterministic given the order — not compiler
  nondeterminism (every real compile sets it per file before emitting).
- Scope: a poison-first scan over 373 candidate files (every test importing a codegen module or mentioning `?{` /
  `_scrml_sql`) found exactly 7 affected files: nested-program-db, lift-sql-chained-call, sql-params, sql-nobatch,
  reactive-decl-sql-chained-call, return-sql-chained-call, sql-write-ops.
- Fix: `beforeEach(() => setFileSqlFallback(1))` in each.
- Proof (predecessor `program-db-driver-resolution.test.js` then the file, same process, N=20 each):
  before 20/20 failed for all 7; after 0/20 for all 7.

## 2. Fixed temp dirs inside the source tree
- `s464-pure-fn-placement`: fixed `_tmp_s464_pure_fn_placement/<name>-<counter>`; two runs at once seed the same
  `shop.db` -> "table orders already exists" (a `--bail`-killed run leaves it behind too: afterAll skipped).
  Fix: `mkdtempSync(join(tmpdir(), …))` root. Two concurrent copies N=10: before 10/10 failed, after 0/10.
- `conf-CTRL-i87` / `conf-CTRL-match-arm` (+ sibling `conf-CTRL-fnbody-autoawait-choke-point`): all wrote
  `<conformance>/_tmp_<slug>-<counter>` with the SAME slugs/counter (`_tmp_codes-1`, `_tmp_runtime-2`), so two
  shards running two of them at once overwrote / deleted each other's input. Fix: per-compile `mkdtempSync`.
  The two files in two processes at once N=30: before 23/30 failed, after 0/30.
- `reactive-decl-sql-chained-call` / `return-sql-chained-call` / `lift-sql-chained-call`: fixed
  `_tmp_<prefix>_<tag>` dirs; two concurrent copies -> ENOENT mid-compile. Fix: per-compile `mkdtempSync`.
  Two concurrent copies of the three N=20: before 6/20 failed, after 0/20.
- Under 64 busy loops (32-thread box), all of the above + parser-flag-retired N=20: 0/20.

## 3. `--fail-on-fail` CLI exit-code test (bootstrap-conformance-counter) — genuinely slow work
- Two full CLI runs one after the other (`spawnSync`), each rebuilding the bootstrap bundle (~13.5 s idle, ~21 s
  per run). Under 128 busy loops the file took 265-288 s and the test hit its 180 s budget.
- First try: run the CLI calls concurrently. REJECTED: each bundle build peaks at ~1.2 GB RSS and the shard
  memory ceiling (3072 MB) counts children; the hook killed the shard at 3504 MB on commit attempt 1 (not a
  flake; my regression, caught by the hook).
- Fix: keep them sequential; explicit 600 s budget (under the 1200 s shard bound), commented.
  128 busy loops: before 1/6 failed (test 180.4 s), after 0/3 (file 251-257 s).

## 4. `sup-isnot` / `sup-issome` shared path
- inotify census (each of the 187 files that writes a temp dir into the test tree, run alone) found one more
  cross-file shared path: e-eq-005-is-literal-reject + e-type-046-optional-member-access both use
  `compiler/tests/unit/_tmp_sup-is{not,some}`. Not observed failing (0/130 concurrent pairs; ms window); fixed
  with per-compile `mkdtempSync` anyway.

## 5. parser-flag-retired — NOT reproduced, no change
- 1642 predecessor pairings (load ~70): 0 hits. 2 concurrent copies N=20 at load 138: 0. 16 copies x 5 under 128
  busy loops: 0/80; slowest test 2.32 s vs 5 s default. Left open as a gap with the capture instructions.

## Status
- [x] SQL fallback leak (7 files)
- [x] s464 temp root, conf-CTRL x3, sql-chained x3 temp dirs
- [x] parser-flag-retired (not reproduced; gap open)
- [x] `--fail-on-fail` CLI exit-code test (bootstrap-conformance-counter)
- [x] sup-isnot / sup-issome pair
- [x] known-gaps entries + state.ts --write
- [ ] CI job commands (checks / unit / integration)
