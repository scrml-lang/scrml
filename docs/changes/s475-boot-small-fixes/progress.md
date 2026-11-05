# s475-boot-small-fixes progress
- 2026-11-05T15:32:37-07:00 start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-aaf6d8e02ffc1e350, base be56b6dad
- 2026-11-05 item 1 (W-MATCH-001) fixed in analyze.scrml resolveArms/coverDiags; test w-match-001-failing-s475: base 2 pass/4 fail, head 6/6
- 2026-11-05 item 2 (unmatchedFailure tag cap) in runtime.js; test unmatched-failure-tag-s475: base 6 pass/6 fail, head 12/12
- 2026-11-05 item 2 commit: hook shard 0 timed out, then shard 1 hit the memory ceiling (machine load); passed with SCRML_HOOK_SHARDS=16 SCRML_HOOK_SHARD_TIMEOUT_S=2400
- 2026-11-05 items 3+4 (txConnection driver refusal; awaited/caught release/close, gate after) in server-runtime.js; test tx-connection-guards-s475: base 1 pass/6 fail, head 7/7. Existing live PG tests (pg-envelope, statement-savepoint-pg) 27/27 on PGlite :54473 (maxConnections 100)
- 2026-11-05 items 3+4 commit: first try shards 1,6 failed + 14 memory (load; output truncated); identical tree passed on retry (16 shards, 2400 s)
- 2026-11-05 item 5(a) quote-aware pgKeyColumns; test pg-key-columns-s475 (live on PGlite): base 3 pass/5 fail, head 8/8. 5(b) left open: §8.9.2 Amendment S474 item 1 makes a failed COMMIT a server error "whatever the function's declared error type"
