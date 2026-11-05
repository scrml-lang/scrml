# s475-ci-tooling — progress (append-only)

- 2026-11-05 start — worktree /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-ad5ef4810e6dd1354 at be56b6dad (= origin/main); bun install + pretest OK.
- 2026-11-05 items 1+2 — scripts/ci-pr-base.sh (HEAD^1 + HEAD^2=PR_HEAD on pull_request, merge_group.base_sha in the queue); ci.yml currency / census / tracking / bot-owned steps read it; ci-pr-base-s475.test.js (stale-base repro + executed step bodies); the bot-owned test executes the guard step on a fast-forward. One commit: the bot-owned step change rewrites the wiring test's strings, so 1 and 2 cannot be split green.
