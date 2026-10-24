# s470-inbox-debt-probe — progress

- [x] startup verified (worktree at origin/main 915b6775f, bun install, bun run pretest)
- [x] scripts/inbox-debt.ts (pure classifier + CLI)
- [x] compiler/tests/unit/inbox-debt.test.js (17 tests)
- [x] scripts/boot.ts probe wiring (one runProbe line + header list)
- [x] live bite proof + simulated fetch failure (bogus remote) + simulated ls-tree failure (--no-fetch, bogus remote)
- [x] gates: pre-commit hook green on every commit; types:check OK (unchanged)

## Findings
- The three S454 bryan->peter messages carry `to: scrml` in frontmatter; the addressee lives in the
  FILE NAME (`-to-peter-`) and the subject (`(for Peter)`). A `to:`-only check would miss them, so the
  probe reads both the frontmatter `to:` and the file-name `-to-<who>-` segment.
- Live run at 915b6775f: 5 unhandled of 14 on origin/inbox; 2 owe action (flogence S59 E-TYPE-027,
  and the misdelivered S454 merge-on-green review); 3 MISDELIVERED?.
- `--check` exits 2 on UNAVAILABLE (exit 0 there would read as "verified clean").
- A first commit failed the hook before `bun run pretest` (a §3 test reads samples/compilation-tests/dist).
