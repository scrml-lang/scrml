# Dispatch — change-id `s470-inbox-debt-probe` (tooling; scripts only)

## Why
Since S447 (pa-base v2.18 §10), sibling agents deliver messages by pushing to scrml's `inbox` BRANCH (`origin/inbox`, under `handOffs/incoming/`). A message is HANDLED once its file name exists under `handOffs/incoming/read/` on the integration branch (`main`). The scrml boot only listed the local `handOffs/incoming/` directory. At S470 boot that reported "inbox empty" while `origin/inbox` held an unhandled `needs: action` message from flogence, sent the same day. The obligation and the probe read different artifacts (pa-base §10). Build the probe that reads the right one.

## What to build
`scripts/inbox-debt.ts`. Mirror the shape and conventions of `scripts/issue-debt.ts` and `scripts/review-debt.ts`: read them first and copy their output style, exit-code policy and header-comment style.
- `git fetch origin inbox` (read-only; never pull, commit or push).
- Enumerate `git ls-tree -r --name-only origin/inbox -- handOffs/incoming/`. Exclude anything under `read/` or `resolved/`.
- A file is HANDLED iff its basename exists under `handOffs/incoming/read/` OR `handOffs/incoming/resolved/` in `origin/main`'s tree. Read that with `git ls-tree origin/main`, not the working-tree filesystem, so a dirty checkout can't fake it.
- For each UNHANDLED file print: basename, plus `from:` / `needs:` / `subject:` parsed from its frontmatter (via `git show origin/inbox:<path>`). Sort so `needs: action` / `needs: reply` come first.
- Print the population: `N unhandled of M on origin/inbox`.
- pa-base §8, "the indistinguishable failure": if the fetch or any git call fails, print `inbox-debt: UNAVAILABLE (<reason>) — inbox NOT verified this session. Say so in the boot report.`, the same pattern review-debt uses. It must NEVER print an empty / zero result on an error path.
- Detection, not control: exit 0 by default. `--check` exits 1 iff any unhandled message has `needs: action` or `needs: reply`.
- Also flag messages addressed `to:` someone other than scrml (e.g. `to: peter`) as `MISDELIVERED?` instead of silently counting them.
- Wire it into `scripts/boot.ts`'s probe list the same way `issue-debt.ts` is delegated to. That is a minimal addition; do not restructure `boot.ts`. If `boot.ts` has a read-set or drift manifest that needs a needle for a new probe, follow its existing pattern.
- Unit test under `compiler/tests/unit/` (or wherever the review-debt / issue-debt tests live; mirror them) for the handled/unhandled classification and the frontmatter parse. Use pure functions that take tree listings as input, so the test needs no network.
- Prove the bite (pa-base §8 "the unproven gate"): run it live against the real `origin/inbox` and report the output. It must list `2026-10-24-from-flogence-S59-to-scrml-type-027-on-error-type-arm.md` (unhandled unless the PA has moved it to `read/` by then) and the three S454 bryan→peter messages as MISDELIVERED?. Then simulate a fetch failure (e.g. a bogus remote name via an env/flag the script exposes for testing) and confirm it prints UNAVAILABLE, not zero.

Do NOT edit `.pa-base/profile`, `docs/known-gaps.md`, `docs/FACTS.md`, or anything in `compiler/src/`. The PA wires the contract text.

## CRITICAL — STARTUP VERIFICATION + PATH DISCIPLINE
1. `pwd` MUST start with `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-`; `git rev-parse --show-toplevel` must equal it; tree clean; `git merge-base HEAD origin/main` == `git rev-parse origin/main` (else `git fetch origin && git reset --hard origin/main`, re-verify). Any failure → report and STOP.
2. `bun install`. (`bun run pretest` only if you run browser tests.)
3. Absolute worktree paths for every Read/Write/Edit; never `cd` into `/home/bmacs/scrmlMaster/scrml`; use `git -C`. Use Edit/Write, not Bash heredocs, for repo files.
4. NEVER `git stash`; NEVER `pkill -f`. Scratch in `~/.cache/scrml-agent-tmp/s470-inbox-debt-probe/`, not `/tmp`, not in the repo; delete it before reporting.
5. First commit `WIP(s470-inbox-debt-probe): start at $(pwd)` adds `docs/changes/s470-inbox-debt-probe/BRIEF.md` (this entire prompt verbatim) + `progress.md`. Commit after each unit; clean tree at the end; never `--no-verify`.

## MAPS
Read `.claude/maps/primary.map.md` first (stamp `e0c4ad6cc`, HEAD `915b6775f`, 77 commits past; treat as a hypothesis). Report whether it was load-bearing.

## Gates
Pre-commit `bun test compiler/tests/{unit,integration,conformance} --bail`; `bun run types:check` if scripts are in its scope.

## Final report (tiny)
WORKTREE_PATH · branch · FINAL_SHA · files touched · the live run output (both the real run and the simulated failure) · gates · map load-bearing?
