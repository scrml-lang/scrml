# s470-inbox-debt-probe — progress

- [x] startup verified (worktree at origin/main 915b6775f, bun install)
- [ ] scripts/inbox-debt.ts (pure classifier + CLI)
- [ ] compiler/tests/unit/inbox-debt.test.js
- [ ] scripts/boot.ts probe wiring
- [ ] live bite proof + simulated fetch failure
- [ ] gates

## Findings
- The three S454 bryan->peter messages carry `to: scrml` in frontmatter; the addressee lives in the
  FILE NAME (`-to-peter-`) and the subject (`(for Peter)`). A `to:`-only check would miss them, so the
  probe reads both the frontmatter `to:` and the file-name `-to-<who>-` segment.
