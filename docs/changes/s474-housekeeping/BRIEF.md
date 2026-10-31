You are a dispatched agent for the scrml PA (session S474). Change-id: `s474-housekeeping`. Repo: scrml (TS compiler impl#1 + SPEC). main is branch-protected: you land by pushing a feature branch and opening a DRAFT PR; the PA reviews and merges.

## CRITICAL — STARTUP VERIFICATION + PATH DISCIPLINE (path-discipline incidents to date: several; don't add one)
1. `pwd` must start with `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/`. `git rev-parse --show-toplevel` must equal it. Tree clean. `git merge-base HEAD origin/main` == `git rev-parse origin/main` (fetch first). If any check fails: STOP, report, exit.
2. `bun install` in the worktree. Every Edit/Write uses an absolute path UNDER your worktree. Never `cd` into `/home/bmacs/scrmlMaster/scrml` (the main checkout). Use `git -C <worktree>`.
3. Never `git stash` (shared across worktrees). Never bare `pkill -f`/`killall`. TMPDIR, if needed: `~/.cache/scrml-agent-tmp/s474-housekeeping/` (never inside a repo, never /tmp bulk).
4. First commit: write this whole prompt verbatim to `docs/changes/s474-housekeeping/BRIEF.md` and commit it as `WIP(s474-housekeeping): start at $(pwd)`. Commit after every unit of work; keep `docs/changes/s474-housekeeping/progress.md` (append-only, timestamped). Never `--no-verify`.
5. Do NOT regenerate `docs/FACTS.md` (bot-owned).

## Tasks (docs-only; no compiler source)

### T1 — Record the S473 (and remaining S472) review markers
`bun scripts/review-debt.ts` reports 77 merged PRs OWED a `@review` marker in `docs/pr-reviews.md`. The reviews mostly HAPPENED; the record is missing. Evidence lives in the PA ledger `~/.claude/pa-ledger/scrml.md` (read-only for you; entries `S473-1 … S473-224`, and S472 entries), and in `handOffs/hand-off-473.md`/`hand-off.md` and `handOffs/hand-off-472.md`.
For each OWED PR: find the ledger evidence of its S239 review (review agent id, frozen tree, verdict, fix rounds, the PA re-run on the fix head). Append a marker in the existing format (read the top of `docs/pr-reviews.md` and several existing markers first and match them exactly):
`<!-- @review pr=<n> verdict=clean|finding|carve-out by=S473-bryan date=<ISO> probe=<what was probed, cite ledger entry id> -->`
Rules: `verdict=carve-out` ONLY for PRs with no code path (wrap, docs, gap-filing, FACTS bot) and say why in probe=. A code PR whose review you cannot find evidence for gets NO marker — list it in your report as "genuinely unreviewed". Do not invent reviews. `by=` is the session that did the review (S472 or S473). Re-run `bun scripts/review-debt.ts` at the end and report before/after OWED + the code-bearing carve-out rate.

### T2 — SPEC-INDEX.md line 1 stray text
`compiler/SPEC-INDEX.md` line 1 on main is `Run \`bun scripts/git-merge-generated.ts --regen\`: it regenerates this file from the MERGED tree and stages it.` — a message that leaked into the file (likely from the merge driver around commit f5ef06c14). Remove it. Then find the CAUSE: read `scripts/git-merge-generated.ts` / `.sh` and see whether the driver writes that message into the file (stdout redirected into the merge result?) instead of to stderr. If so, fix the driver so it can't recur, and add a test if the scripts have tests. Report the cause either way.

### T3 — Inbox: mark 4 messages handled + reply to flogence
`bun scripts/inbox-debt.ts` lists 4 unhandled on `origin/inbox`. A message is HANDLED once the identical file (name + content) is under `handOffs/incoming/read/` on main. For each: `git show origin/inbox:handOffs/incoming/<name> > <worktree>/handOffs/incoming/read/<name>` (byte-identical). The three `(for Peter)` S454 notes are Peter-lane FYI/action; moving them to read/ is correct (the action one is addressed to Peter's lane — note in your report that #1297 merge-on-green follow-up is Peter's, not done here).
flogence note `2026-10-29-from-flogence-S60-to-scrml-re-S473-note-not-delivered.md`: read it. Verify its item 2 claim that `scripts/scrml-boot.ts` `sourceClosure` follows only double-quoted imports — check current main (PR #1658 "scrml-boot single-quoted imports" may already have fixed it; test it: a fixture with `import { x } from '../a.scrml'`). Then write a reply message `YYYY-MM-DD-HHMM-from-scrml-S474-to-flogence-re-S60.md` with frontmatter `from: scrml@theRog`, `to: flogence`, `date`, `subject`, `needs: fyi`, `re: <their filename>`. Content: acknowledge the delivery miss (we will use `bun ../flogence/scripts/msg.ts send`), state the scrml-boot single-quote status with evidence (fixed at #1658 SHA, or not), and say the `e.variant`/`e.message` E-TYPE-031 on an imported `?{}` server fn is being reproduced on scrml main in a separate lane. Deliver it with `bun /home/bmacs/scrmlMaster/flogence/scripts/msg.ts send <file>` (read msg.ts usage first; it pushes to flogence's inbox branch). Report the push result. Don't write into flogence's working tree.

## Landing
Push `s474-housekeeping` and `gh pr create --draft` titled `docs(S474): S473 review markers from the ledger; SPEC-INDEX line-1 leak + cause; inbox handled; flogence reply`. Body ends with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Final report: worktree path, branch, final SHA, PR number, files touched, T1 before/after numbers + list of genuinely-unreviewed PRs, T2 cause, T3 push result. Clean `git status` before reporting.
