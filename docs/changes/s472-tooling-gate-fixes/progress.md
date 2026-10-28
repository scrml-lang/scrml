# s472-tooling-gate-fixes — progress

Input: S472 backfill review bf3 (six tooling/test-gate findings on #1488 #1511 #1428 #1498 #1505 #1544).

| # | finding | status | regression test | red on main |
|---|---|---|---|---|
| 1 | #1488 facts crash warned as stale | fixed (stale = exit 4; dangling symlink = exit 5 fail-closed; crash named) | compiler/tests/unit/facts-check-exit-codes-s472.test.js | 10 of 14 fail |
| 4 | #1498 slice trigger list misses stdlib/ | fixed (stdlib/* added; repo-root reads asserted against the list) | compiler/tests/unit/hook-slice-trigger-list-s472.test.js | 2 of 4 fail |
| 2 | #1511 whitespace-red baseline masks resolved guards | pending | | |
| 3 | #1428 await pack has no positive control | pending | | |
| 5 | #1505 banner exemption unenforced | pending | | |
| 6 | #1544 inbox-debt needs vocab / basename handled | pending | | |
