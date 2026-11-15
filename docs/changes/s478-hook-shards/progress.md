# s478-hook-shards — progress

Lane: tooling (scripts/test-sharded.ts, scripts/git-hooks/pre-commit, scripts/git-hooks/pre-push, tests).
Gaps: g-hook-single-shard-test-pollution-s477, g-hook-sharded-prepush-exit-s477.

## Baseline (start, 314bad402)
- Default sharded hook: 12 shards, 47443 pass / 0 fail, 362.8 s wall; per-shard peaks 966–2603 MB.
- `SCRML_HOOK_SHARDS=1` (exact hook command, direct and through a real `git commit`): 47443 pass / 0 fail —
  the victim did NOT fail in this worktree's file order. bun's file order is not sorted and differs between
  worktrees, so the S477 lane's order is not reproducible by re-running.

## 1. Test-order pollution (b17-4-codegen-ontransition-effect.test.js)
- Method: `bun test <F> <victim>` for every one of the 1680 other test files (probe script, 10 at a time).
- Polluters (5): enum-subset-match-exhaustiveness-da-b2, gauntlet-s19/match-exhaustiveness,
  gauntlet-s28/error-arm-scope, s441-review-r5 (each compiles a file declaring `function log` →
  emit-expr `_logShadowedInFile` left true), print-builtin-compile (§E `production: true` compile →
  emit-expr `_logProductionStrip` left true).
- Effect: the victim calls the emitters directly (not via runCG), so `log("entered")` in a hook body lowers
  to `(void 0)`: §B17.4.5 and §B17.4.7 fail.
- Fix (victim isolation): `beforeEach` → `resetCodegenModuleState()` + `setLogProductionStrip(false)`.
  Re-run of the 5 pairs: 0 hits; all 5 chained before the victim in one process: 179 pass / 0 fail.
- Not fixed here (compiler source, out of lane): runCG's `finally` does not reset the two log flags, unlike
  the chunk-namespace token and the emit-logic state. Surfaced to PA.

## 2. Memory ceiling
- Measured (RSS summed over the shard's process tree): N=1 5009 MB; N=4 (other lanes running) 1404 / 2176 /
  2578 / 3424 MB — 3424 is over the old 3072 ceiling; N=12 966–2045 MB plus the one-file shard
  bootstrap-conformance-counter at 2603 MB.
- Rule: ceiling = max(4608, ceil512(1.5 × (2900 + 2100 × share))), share = the shard's fraction of the run's
  estimated seconds. 7680 / 5632 / 5120 MB at N=1 / 4 / 12. (Superseded in fix round 1: SCRML_HOOK_SHARD_MEM_MB
  is a floor, max(env, adaptive); only --shard-mem is a fixed ceiling.) Not tied to free memory: admission + slots already do that.

## 3. Pre-push exit status
- Root: bun reports an error outside any test as " 0 fail" + " 1 error", exit 1, no `(fail)` line.
  Reproduced with an `afterAll` that rejects a promise. The runner did not count it; pre-push printed only
  counts + `(fail)` lines → "exit 1, 0 failures". A runner that died before TOTAL printed "Tests: , , ".
- Fix: runner counts errors, prints `(error)` lines + a final `RESULT:` line naming every reason, exits 3
  on its own crash; pre-push `suite-verdict` block prints the cause, keeps the full log on disk, and blocks
  an exit 0 that has no summary or says RESULT: FAIL.
- Bite: compiler/tests/unit/hook-prepush-suite-verdict-s478.test.js (runner run for real on a red test and
  on an unhandled error → exit 1; green → exit 0; the hook block run verbatim on every case).

## Bite proof (worktree's own scripts/git-hooks/pre-push, run directly with an update-ref stdin line)
- Temp file with an `afterAll` unhandled rejection (0 failing tests): pre-push exit 1 —
  "Tests: 45219 pass, 0 fail, 1 error", "RESULT: FAIL — 1 unhandled error(s) outside any test …",
  "[s6] (error) Unhandled error between tests in compiler/tests/unit/zz-s478-bite-unhandled.test.js".
- One assertion in b17-4 changed to a string that cannot match: pre-push exit 1 — "1 fail",
  "RESULT: FAIL — 1 test(s) failed", the (fail) line.
- Restored (temp file deleted, assertion back, tree clean): pre-push exit 0 — 45218 pass / 0 fail / 0 error,
  12 shards, adaptive ceiling 4608–5120 MB, per-shard peaks 859–2747 MB, RESULT: PASS.

## Commits
- dcf13e661 and earlier on this branch; each through main's pre-commit hook (SCRML_HOOK_SHARD_MEM_MB=4608).

## Seen, not this lane
- N=4 measuring run, under load: "§3 scrml dev run from the project root > REFERENCING program, missing
  database …" failed at 30.7 s (a timing failure under CPU load; passed in every other run).

## Fix round 1 (PR #1855, S239 review of 6c5862197)
- F1 (MED, false red): SCRML_HOOK_SHARD_MEM_MB is now a FLOOR — ceiling = max(env, adaptive); only
  `--shard-mem=MB` is exact. Repro (`SCRML_HOOK_MEM_RESERVE_MB=10000000 SCRML_HOOK_SHARD_MEM_MB=4608`, N=1):
  PR head said "ceiling 4608 MB per shard (SCRML_HOOK_SHARD_MEM_MB)"; now "ceiling 7680 MB per shard
  (adaptive, floor 4608 MB from SCRML_HOOK_SHARD_MEM_MB)". Probe `--shard-mem=600` + 1 GB alloc → MEMORY
  CEILING 1031 > 600, RESULT: FAIL, rc 1 (still works).
- F2 (LOW, false red under --bail): `# Unhandled error` lines are recorded as candidates and become `(error)`
  fail lines (and bail) only when the shard exits non-zero; an exit-0 shard's " N errors" count is zeroed.
  Repro (passing test printing " 3 errors" + "# Unhandled error between tests", --shards=2 --bail): PR head
  rc 1 "RESULT: FAIL — 3 unhandled error(s)"; now rc 0, RESULT: PASS. Real afterAll rejection: still rc 1,
  "RESULT: FAIL — 1 unhandled error(s)", `(error)` line names late.test.js.
- F3 (LOW): pre-push SUITE_LOG is per run — mktemp under ~/.cache/scrml/pre-push-suite-logs/
  (`pre-push-suite-<date>-<pid>-XXXXXX`), pruned after a day; path printed in the block messages.
- Tests: hook-prepush-suite-verdict-s478.test.js 20 pass. Bite: the same file against 6c5862197's runner +
  pre-push → 4 fail (F2 printy, F1 floor header, --shard-mem exact label, F3 per-run log), 16 pass.
