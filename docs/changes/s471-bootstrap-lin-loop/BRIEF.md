# Dispatch — change-id `s471-bootstrap-lin-loop` (bootstrap / impl#2, `compiler/self-host-v2/`)

Bootstrap work: the native compiler written in scrml, in `compiler/self-host-v2/`. This is the operator's priority. These are the first items on the S469 "bootstrap next" list.

## The gaps (read each entry IN FULL in `docs/known-gaps.md` by id)
1. `g-bootstrap-loop-wait-and-defer-s469` (MED). The locus is `analyze.scrml` `planLoop`: a loop body that suspends at a server call (§13.8 action positions, §49 loops) and/or holds a `defer` (§19.16). Read §49 and §13.8 IN FULL.
2. `g-bootstrap-lin-not-implemented-s469` (MED). Linear types (§35: exactly-once consumption, control-flow rules, closures, the lin function params in §35.2.1, cross-`${}` lin in §35.2.2, and the E-LIN codes). Read §35 IN FULL.

Do 1 first. Then do 2, which is the larger build, so slice it. Land the declaration plus the exactly-once consumption check first, then control flow, then closures and params. Commit each slice. Where a §35 rule cannot be checked by construction, refuse by name. A `lin` program the bootstrap cannot verify must not compile.

For each gap:
- Reproduce it on current main FIRST (`bun scripts/scrml-boot.ts compile <f> --format line`) and record the result in progress.md.
- QUOTE the governing SPEC sentence in progress.md before changing behaviour. A shape SPEC does not govern is a RULING: record it as an open question and refuse that shape.
- Add slice tests, plus acceptance cases that compile AND run where the shape runs.
- Note: the `defer` statement itself (§19.16) is being fixed by another lane, `s471-bootstrap-control-flow-high`, which refuses or builds `defer` in function bodies. YOUR scope is the loop-body interaction only. If you find `defer` unbuilt at the base, refuse `defer` in loop bodies by name and note it. Do not build `defer` itself.

## Concurrency: four bootstrap lanes run at once. Stay in your region.
- **stdlib-import lane:** the `analyze.scrml` import/module region, `link.scrml`, `slice-m2/lowered.js`, `scripts/scrml-boot.ts`.
- **parse lane:** `parse.scrml`.
- **control-flow lane:** `if=` chains and `defer`.
- **You:** `planLoop` and `lin`, across `analyze.scrml` / `lower.scrml` / `check.scrml` / the runtime.

Small appends to `severity.scrml` and `slice-m4/acceptance.test.js` are expected overlaps: append them, never reorder. Run `bun scripts/bootstrap-conformance.ts` for before/after numbers, but do NOT commit `docs/bootstrap-conformance.md`. Do not touch `compiler/src/`, `compiler/SPEC.md`, `docs/known-gaps.md` or `docs/FACTS.md`.

## Authoring scrml — anti-pattern briefing (MANDATORY)
You will write scrml source. Read BOTH before any code, and re-read before each feature: `/home/bmacs/scrmlMaster/scrml-support/docs/gauntlets/BRIEFING-ANTI-PATTERNS.md` and `docs/articles/llm-kickstarter-v2-2026-05-04.md`. Also read `compiler/self-host-v2/progress.md` and match the surrounding code's idiom exactly. The bootstrap speaks the RULED language: §66, `;` termination, explicit tape grants. Say "tape", not array.

## CRITICAL — STARTUP VERIFICATION + PATH DISCIPLINE
1. `pwd` MUST start with `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-`, and `git rev-parse --show-toplevel` must equal it. The tree must be clean. `git merge-base HEAD origin/main` must equal `git rev-parse origin/main`; if it does not, run `git fetch origin && git reset --hard origin/main` before any work, then re-verify. Any failure: report and STOP.
2. `bun install`, then `bun run pretest` plainly from the worktree CWD (NOT `bun --cwd <path> run …`). Check that `samples/compilation-tests/dist/` exists afterward.
3. Every Read/Write/Edit uses an ABSOLUTE path under your worktree root. Never `cd` into `/home/bmacs/scrmlMaster/scrml`. Use `git -C "$WT"`. Edit with Edit/Write.
4. NEVER `git stash`. Compare base and build by file copy or with a detached `git worktree add` under `.claude/worktrees/` (symlink node_modules).
5. NEVER `pkill -f` / `killall`; kill by captured PID only.
6. `TMPDIR` must not point inside any repo. Scratch goes in `~/.cache/scrml-agent-tmp/<change-id>/`, never in `/tmp`. Delete scratch before the final report.
7. First commit: `WIP(<change-id>): start at $(pwd)`, adding `docs/changes/<change-id>/BRIEF.md` (THIS ENTIRE PROMPT verbatim) and `docs/changes/<change-id>/progress.md`.
8. Commit after every meaningful unit and append timestamped lines to progress.md. Clean `git status` before the final report. Never `--no-verify`.

## MAPS — REQUIRED FIRST READ
Read `.claude/maps/primary.map.md` first and follow its Task-Shape Routing (the bootstrap maps). Map stamp: `3d17013f8`. No post-map landing touches `compiler/self-host-v2/`. Treat map content as a hypothesis. Report whether it was load-bearing.

## Method — CONSTRAIN TO THE PROVEN PATH
Reuse the bootstrap's existing analysis passes (scope, flow, effects). Do not write a regex over source text post-parse. Where the existing path cannot decide, refuse by name. Never fail open.

## Gates before reporting DONE (the hook is not CI)
- `bun test compiler/tests/{unit,integration,conformance} --bail`
- The CI `slices` job, exactly: `bun scripts/lint-no-default-arm.js && bun test ./compiler/self-host-v2/slice-m1/ && bun test ./compiler/self-host-v2/slice-m2/ && SLICE_CORE=lowered bun test ./compiler/self-host-v2/slice-m1/ && bun test ./compiler/self-host-v2/slice-m3/ && bun test ./compiler/self-host-v2/slice-m4/ && bun test ./compiler/self-host-v2/slice-codec/`
- `bun run types:check`
- `bun scripts/bootstrap-conformance.ts` (numbers only, not committed)
- Gap updates and new gaps go in progress.md.

## Final report (tiny)
WORKTREE_PATH · branch · FINAL_SHA · files touched · per-gap / per-slice outcome with the governing sentence · gates · bootstrap-conformance before/after · open questions · map load-bearing?
