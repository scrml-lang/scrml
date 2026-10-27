# Dispatch — change-id `s471-owner-rulings-spec` (SPEC text, docs-only)

Spec-text lane: record seven owner rulings in `compiler/SPEC.md` (and regenerate `compiler/SPEC-INDEX.md`). NO compiler source changes. The rulings are verbatim in `../scrml-support/user-voice-scrml.md` under "## S471" (read it — it is in the sibling repo `/home/bmacs/scrmlMaster/scrml-support`, read-only for you). Background for each is in `hand-off.md` §3 and in the named gap entries in `docs/known-gaps.md`.

For EACH ruling: find the governing section, read it IN FULL with offset/limit, then amend. Each amendment carries an inline `> **Provenance:** ruling:user-voice-scrml.md S471 "go, and yes to all the recs" (hand-off-470 §3 item N)` line under it (overlay `{{provenance_fills}}`). Keep the SPEC's voice: normative SHALL text, short, no narrative.

1. §6.7.4 (`when … changes`, newest run wins): a helper function's continuation, called from the body, IS part of the run, and is cancelled with it. Say what "cancelled" means for the helper (same as the body: its pending continuation does not resume; writes already made stay).
2. §51.7.1 (or wherever async engine hooks are specified — find it; #1577 implemented it): async state `effect=` and `<onTransition>` bodies get newest-run-wins, same semantics as §6.7.4. Name the opener `effect=` explicitly as covered.
3. §13.8: the `safeCallAsync` thunk body is an awaited position (find where §13.8 enumerates awaited positions).
4. §13.8 item 3 (host waiting values; today names only `fetch`): name `Promise.all`, `Promise.race`, `Promise.any`, `Promise.allSettled` — over waiting values they are waiting values (closes `g-spec-host-promise-statics-s470` on the SPEC side).
5. §18 / §14 (enum payload declarations): a payload field named `variant` is refused, because `.variant` reads the tag. Name a code: check §34 for an existing enum-declaration code that fits; if none, mint `E-ENUM-PAYLOAD-FIELD-RESERVED` and add its §34 row marked Nominal (impl pending).
6. §18: document `.variant` as a user-facing member — it reads the variant tag on every enum value, unit variants included (#1571 behaviour).
7. §34 rows for `E-ERROR-014` (a gapped `! {` — `!` separated from its `{`) and `E-TRY-NOT-IN-SCRML` (the `!{…} catch` statement form / try-catch, §19.1 "There is NO try/catch"). impl#1 already emits both (#1568) — read the emit sites (`grep -rn 'E-ERROR-014\|E-TRY-NOT-IN-SCRML' compiler/src`) so the row text matches what fires. Mark these rows as PA-drafted in the commit message; bryan vetoes on read.

Then run `bun run scripts/regen-spec-index.ts` and add one-line notes to the affected SPEC-INDEX rows. Run `bun scripts/s34-census.ts` and the conformance runner (`bun conformance/run.ts`) — both must stay green. Report any ruling whose governing section you could not find, or where existing SPEC text contradicts the ruling (quote both) — do not resolve a contradiction yourself.

Out of scope: all of `compiler/src/`, tests, `docs/known-gaps.md`, `docs/FACTS.md`. Two other lanes edit compiler source concurrently.
## CRITICAL — STARTUP VERIFICATION + PATH DISCIPLINE (PATH-DISCIPLINE INCIDENT counter: see marker history)
1. `pwd` MUST start with `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-`. `git rev-parse --show-toplevel` must equal it. Tree clean. `git merge-base HEAD origin/main` == `git rev-parse origin/main` (your base is origin/main; if not, `git fetch origin && git reset --hard origin/main` BEFORE any work, then re-verify). Any failure → report and STOP.
2. `bun install`, then run `bun run pretest` plainly from the worktree CWD (NOT `bun --cwd <path> run …` — it silently no-ops). Check `samples/compilation-tests/dist/` exists afterward.
3. Every Read/Write/Edit uses an ABSOLUTE path under your worktree root. Never `cd` into `/home/bmacs/scrmlMaster/scrml` (the main checkout). Use `git -C "$WT"`. Edit with Edit/Write (a path-discipline hook guards them); avoid Bash heredoc writes into the repo.
4. NEVER `git stash` (the stash is shared across all worktrees). Base-vs-build comparisons by FILE COPY or a detached `git worktree add` under `.claude/worktrees/` (symlink `node_modules`, don't install).
5. NEVER `pkill -f` / `killall` on a command string; kill by captured PID only.
6. `TMPDIR` must NOT point inside any repo. Scratch goes in `~/.cache/scrml-agent-tmp/<change-id>/`. Bulk output never goes in `/tmp` (it is RAM). Delete your scratch before the final report.
7. First commit: `WIP(<change-id>): start at $(pwd)` and it adds `docs/changes/<change-id>/BRIEF.md` containing THIS ENTIRE PROMPT verbatim, plus `docs/changes/<change-id>/progress.md`.
8. Commit after every meaningful unit (WIP commits expected); append timestamped lines to progress.md (done / next / blockers). Never batch. Clean `git status` before your final report. Never `--no-verify`.

## MAPS — REQUIRED FIRST READ
Read `.claude/maps/primary.map.md` first and follow its Task-Shape Routing. Map stamp: commit `3d17013f8` (2026-10-26). HEAD is `a8bac7248`, 15 commits past the map; the post-map landings are #1581 (`s470-promise-all-batch-elements`: lift-concurrent Promise.all batch elements, `codegen/scheduling.ts`) and the S470 wrap docs. Treat map content as a hypothesis and verify it against source. Report whether the map was load-bearing ("not load-bearing" is a valid answer).

## Gates before reporting DONE
- the pre-commit hook (it runs on commit); `bun scripts/s34-census.ts`; `bun conformance/run.ts`; `bun run scripts/regen-spec-index.ts` then confirm its check mode (if any) is clean.
- Do NOT edit `docs/known-gaps.md` or `docs/FACTS.md`; list gap-status effects in progress.md.

## Final report (tiny)
WORKTREE_PATH · branch · FINAL_SHA · files touched · locus hypothesis held / refined / wrong (and the real locus) · gates (pass/fail counts) · per-ruling: section amended + quoted new text · open questions · map load-bearing?
