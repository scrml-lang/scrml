# s475-twin-request-cases — progress (append-only)

- 2026-11-06 start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-a93e19989fc4fc603, base 19fc95a24 (== origin/main). pretest green.
- 2026-11-06 base bootstrap-conformance: 12 lifecycle/request-* NOT-TWINNED; 10 by `type \`User | not\` has a space … not ruled` (fix-s66.js:1531), 2 (e-lifecycle-022 neg/pos) by CTX blockers (object literal / empty `[]`). 4 of the 10 also blocked by program-wrap `<page>` root.
- 2026-11-06 fix: fix-s66.js `bareUnionSpelling` — a union annotation stands bare (`T | U`), per §66.2.4 S451; other top-level spaces still blocked. Unit tests: 5 new (red on base: 5 fail; green on head: 137/137).
- 2026-11-06 head bootstrap-conformance: 36 cases moved, all out of NOT-TWINNED (31 → UNSUPPORTED, 5 → FAIL). request-*: 6 → UNSUPPORTED, 6 still NOT-TWINNED (4 `<page>` root, 2 CTX). impl#1 conformance/run.ts identical base vs head (1735/1827, 92 xfail).
