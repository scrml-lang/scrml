# s475-boot-request-followups — progress (append-only)

- 2026-11-06 start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-a6465c378dd999b39, base origin/main 19fc95a24. #1783 still OPEN at start → part B deferred until it merges.
- 2026-11-06 A1: dropped the "≥1 SELECT" clause in analyze `serverReadOnly` and check C-R2 `readServerWalk` (S475 ruling, PA self-correction). A no-SQL server call is READ.
- 2026-11-06 A2: tests for analyze's `remote` guard (client diamond, `h(id) + h(id + 1)`); mutation measured: removing `tq.remote[i0] != 1` turns both red. Found C-R2 had the same per-function hole (forced READ re-checked clean) — C-R2 now counts server calls along every call (capped least fixpoint).
- 2026-11-06 A3: C-R2 tests (non-SELECT reach, two server calls, loop, diamond, clean READ). WRITE runtime fixture moved from a no-SQL server fn (now READ) to a two-call client wrapper (rule 1(b)).
