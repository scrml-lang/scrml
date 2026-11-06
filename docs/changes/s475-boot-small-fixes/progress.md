# s475-boot-small-fixes progress
- 2026-11-05T15:32:37-07:00 start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-aaf6d8e02ffc1e350, base be56b6dad
- 2026-11-05 item 1 (W-MATCH-001) fixed in analyze.scrml resolveArms/coverDiags; test w-match-001-failing-s475: base 2 pass/4 fail, head 6/6
- 2026-11-05 item 2 (unmatchedFailure tag cap) in runtime.js; test unmatched-failure-tag-s475: base 6 pass/6 fail, head 12/12
- 2026-11-05 item 2 commit: hook shard 0 timed out, then shard 1 hit the memory ceiling (machine load); passed with SCRML_HOOK_SHARDS=16 SCRML_HOOK_SHARD_TIMEOUT_S=2400
- 2026-11-05 items 3+4 (txConnection driver refusal; awaited/caught release/close, gate after) in server-runtime.js; test tx-connection-guards-s475: base 1 pass/6 fail, head 7/7. Existing live PG tests (pg-envelope, statement-savepoint-pg) 27/27 on PGlite :54473 (maxConnections 100)
- 2026-11-05 items 3+4 commit: first try shards 1,6 failed + 14 memory (load; output truncated); identical tree passed on retry (16 shards, 2400 s)
- 2026-11-05 item 5(a) quote-aware pgKeyColumns; test pg-key-columns-s475 (live on PGlite): base 3 pass/5 fail, head 8/8. 5(b) left open: §8.9.2 Amendment S474 item 1 makes a failed COMMIT a server error "whatever the function's declared error type"

## r1 (review of #1755) — 2026-11-05
- start: worktree agent-ad8dc4b6b125f6992, branch s475-1755-r1 = origin/worktree-agent-aaf6d8e02ffc1e350 @ 317d02879
- Bun 1.4.3 ReservedSQL has `close(options)` (length 1, `options.timeout` in seconds) — probed against PGlite :52611, `close({ timeout: 1 })` resolved at once
- F1 (MED) closeReserved: race close() vs RESERVED_CLOSE_WAIT_MS=5000 (host `reservedCloseWaitMs` overrides), log once, release gate, original error propagates; timer cleared + unref'd; close({timeout}) passed too. tx-connection-guards-s475: on 317d02879 8 pass/3 fail (first envelope "hung"), head 11/11. Commit 0f1f22080 (first hook try: shard 2 failed + 4 memory under load; retry default passed)
- F2 (LOW) resolveArm returns patErr (pattern part only); resolveArms checks its own position diags after the body. w-match-001-failing-s475: on 317d02879 8 pass/1 fail (errInArmBody lost W-MATCH-001), head 9/9. Commit 7d36b0ba1 (hook: two sharded tries died on memory/exit 143; passed with SCRML_HOOK_SHARDS=1)
- F3 + part (b): recorded in g-boot-pg-constraint-field-fallbacks-s475; entry resolved ((a) fixed, (b) as specified, owner may amend). g-boot-reserved-close-unawaited-s475 gains an r1 line (its "no timer" cost is gone)
