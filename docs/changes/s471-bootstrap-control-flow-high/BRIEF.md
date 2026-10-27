# Dispatch — change-id `s471-bootstrap-control-flow-high` (bootstrap / impl#2, `compiler/self-host-v2/`)

Bootstrap work: the native compiler written in scrml, in `compiler/self-host-v2/`. This is the operator's priority. Both gaps are HIGH and FAIL OPEN: the bootstrap accepts a program and does the wrong thing silently.

## The gaps (read each entry IN FULL in `docs/known-gaps.md` by id)
1. `g-bootstrap-else-if-else-attrs-ignored` (HIGH). `if=` / `else-if=` / `else` sibling chains: the `else-if=` / `else` attributes are ignored, so the branches all render or are mis-gated. Governing text: SPEC §17.1 (read the `if=` / `else-if=` / `else` section IN FULL). Implement the chain semantics. Where any shape cannot be lowered correctly, refuse it by name (E-BOOTSTRAP-UNSUPPORTED naming the attribute), never ignore it.
2. `g-bootstrap-defer-scope-001-and-runs-anyway` (HIGH). `defer` (§19.16): the bootstrap reports E-SCOPE-001 and still runs the code. A program with an Error-severity diagnostic must produce no runnable artifact (§2.2.1), and `defer` must be built (block-scoped, LIFO, every exit, evaluated at exit) or refused by name. Read §19.16 IN FULL. If building the full semantics is too large for this lane, land the fail-closed half (a named refusal, nothing written) and report.

For each gap:
- Reproduce it on current main FIRST with `bun scripts/scrml-boot.ts compile <f> --format line` and RUN the output (`scrml-boot dev`, or the slice runtime harness) so the wrong behaviour is executed, not inferred. Record the result in progress.md.
- QUOTE the governing SPEC sentence in progress.md before changing behaviour.
- Commit with slice tests plus an acceptance case that compiles AND runs.

## Concurrency: four bootstrap lanes run at once. Stay in your region.
- **stdlib-import lane:** the `analyze.scrml` import/module region, `link.scrml`, `slice-m2/lowered.js`, `scripts/scrml-boot.ts`.
- **parse lane:** `parse.scrml`.
- **lin/loop lane:** `analyze.scrml` `planLoop` and `lin`.
- **You:** the `if=` chain and `defer` handling across `analyze.scrml` / `lower.scrml` / `print.scrml` / the runtime.

If you need `parse.scrml`, keep the edit minimal and say so in the report. Small appends to `severity.scrml` and `slice-m4/acceptance.test.js` are expected overlaps: append them, never reorder. Run `bun scripts/bootstrap-conformance.ts` for before/after numbers, but do NOT commit `docs/bootstrap-conformance.md`. Do not touch `compiler/src/`, `compiler/SPEC.md`, `docs/known-gaps.md` or `docs/FACTS.md`.

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
Reuse the bootstrap's existing lowering and runtime pieces. Do not write a regex over source text post-parse. Where the existing path cannot decide, refuse by name. Never fail open.

## Gates before reporting DONE (the hook is not CI)
- `bun test compiler/tests/{unit,integration,conformance} --bail`
- The CI `slices` job, exactly: `bun scripts/lint-no-default-arm.js && bun test ./compiler/self-host-v2/slice-m1/ && bun test ./compiler/self-host-v2/slice-m2/ && SLICE_CORE=lowered bun test ./compiler/self-host-v2/slice-m1/ && bun test ./compiler/self-host-v2/slice-m3/ && bun test ./compiler/self-host-v2/slice-m4/ && bun test ./compiler/self-host-v2/slice-codec/`
- `bun run types:check`
- `bun scripts/bootstrap-conformance.ts` (numbers only, not committed)
- Gap updates and new gaps go in progress.md.

## Final report (tiny)
WORKTREE_PATH · branch · FINAL_SHA · files touched · per-gap outcome (built / fail-closed only / NOT-REPRODUCED) with the governing sentence · executed before/after behaviour · gates · bootstrap-conformance before/after · open questions · map load-bearing?
