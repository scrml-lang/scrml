# Dispatch — change-id `s471-bootstrap-parse-batch` (bootstrap / impl#2, `compiler/self-host-v2/parse.scrml`)

Bootstrap work: the native compiler written in scrml, in `compiler/self-host-v2/`. This is the operator's priority. Your region is the PARSER, `compiler/self-host-v2/parse.scrml`, plus tests and acceptance cases.

## The gaps (read each entry IN FULL in `docs/known-gaps.md` by id; each names its locus)
1. `g-bootstrap-semicolon-braceless-else-rejected-s462` (MED): `parseIf`.
2. `g-bootstrap-code-body-several-display-literals-refused` (MED): `isStandaloneDisplay`.
3. `g-bootstrap-runaway-display-literal-cascades-before-closer` (MED): `displayCloseAt`.
4. `g-bootstrap-let-decl-in-db-channel-body-refused-s469` (MED): the db / channel body parse.
5. `g-bootstrap-rejects-sanctioned-is-some-is-not-s460` (MED): the `is` forms. Note the S462 ruling: `is some` is SOFT-DEPRECATED, so it parses identically and the bootstrap fires its W-lint W-IS-SOME-DEPRECATED. `is given` / `is not` are canonical.

For EACH gap:
- Reproduce it on current main FIRST, with `bun scripts/scrml-boot.ts compile <f> --format line` or the slice harness. Record the result in progress.md. A gap that no longer reproduces is NOT-REPRODUCED: record why and move on.
- Before changing what the bootstrap accepts, QUOTE the governing SPEC sentence (§ + text) in progress.md. A gap with no governing sentence is a RULING: stop on that gap, record it as an open question, and continue with the others.
- One commit per gap, each with a slice test and, where it runs, an acceptance case.

## Concurrency: four bootstrap lanes run at once. Stay in your region.
- **stdlib-import lane:** `analyze.scrml` import/module region, `link.scrml`, `slice-m2/lowered.js`, `scripts/scrml-boot.ts`.
- **control-flow lane:** `analyze.scrml` / `lower.scrml` around `if=` / `else-if=` / `else` and `defer`.
- **lin/loop lane:** `analyze.scrml` `planLoop` and `lin`.
- **You:** `parse.scrml`.

If a fix needs `analyze.scrml`, keep the edit minimal and local, and say so in the report. Small appends to `severity.scrml` and `slice-m4/acceptance.test.js` are expected overlaps: append them, never reorder. Run `bun scripts/bootstrap-conformance.ts` for before/after numbers, but do NOT commit `docs/bootstrap-conformance.md`; the PA regenerates it at landing. Do not touch `compiler/src/` (impl#1), `compiler/SPEC.md`, `docs/known-gaps.md` or `docs/FACTS.md`.

## Authoring scrml — anti-pattern briefing (MANDATORY)
You will write scrml source. Read BOTH before any code, and re-read before each feature: `/home/bmacs/scrmlMaster/scrml-support/docs/gauntlets/BRIEFING-ANTI-PATTERNS.md` and `docs/articles/llm-kickstarter-v2-2026-05-04.md`. Also read `compiler/self-host-v2/progress.md` (the bootstrap's own conventions log) and match the surrounding code's idiom exactly. The bootstrap speaks the RULED language: §66, `;` termination, explicit tape grants. Say "tape", not array.

## CRITICAL — STARTUP VERIFICATION + PATH DISCIPLINE
1. `pwd` MUST start with `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-`, and `git rev-parse --show-toplevel` must equal it. The tree must be clean. `git merge-base HEAD origin/main` must equal `git rev-parse origin/main`; if it does not, run `git fetch origin && git reset --hard origin/main` before any work, then re-verify. Any failure: report and STOP.
2. `bun install`, then `bun run pretest` plainly from the worktree CWD (NOT `bun --cwd <path> run …`, which silently no-ops). Check that `samples/compilation-tests/dist/` exists afterward.
3. Every Read/Write/Edit uses an ABSOLUTE path under your worktree root. Never `cd` into `/home/bmacs/scrmlMaster/scrml`. Use `git -C "$WT"`. Edit with Edit/Write; avoid Bash heredoc writes into the repo.
4. NEVER `git stash`. Compare base and build by FILE COPY or with a detached `git worktree add` under `.claude/worktrees/` (symlink node_modules).
5. NEVER `pkill -f` / `killall`; kill by captured PID only.
6. `TMPDIR` must not point inside any repo. Scratch goes in `~/.cache/scrml-agent-tmp/<change-id>/`, never in `/tmp` (it is RAM). Delete scratch before the final report.
7. First commit: `WIP(<change-id>): start at $(pwd)`, adding `docs/changes/<change-id>/BRIEF.md` (THIS ENTIRE PROMPT verbatim) and `docs/changes/<change-id>/progress.md`.
8. Commit after every meaningful unit (WIP commits expected) and append timestamped lines to progress.md. Clean `git status` before the final report. Never `--no-verify`.

## MAPS — REQUIRED FIRST READ
Read `.claude/maps/primary.map.md` first and follow its Task-Shape Routing (the bootstrap / self-host-v2 maps). Map stamp: `3d17013f8`. No post-map landing touches `compiler/self-host-v2/`. Treat map content as a hypothesis. Report whether it was load-bearing.

## Method — CONSTRAIN TO THE PROVEN PATH
Extend the parser's existing productions. Do not write a second reader. Where the grammar cannot decide, refuse by name (fail closed). Never fail open.

## Gates before reporting DONE (the hook is not CI)
- `bun test compiler/tests/{unit,integration,conformance} --bail`
- The CI `slices` job, exactly: `bun scripts/lint-no-default-arm.js && bun test ./compiler/self-host-v2/slice-m1/ && bun test ./compiler/self-host-v2/slice-m2/ && SLICE_CORE=lowered bun test ./compiler/self-host-v2/slice-m1/ && bun test ./compiler/self-host-v2/slice-m3/ && bun test ./compiler/self-host-v2/slice-m4/ && bun test ./compiler/self-host-v2/slice-codec/`
- `bun run types:check`
- `bun scripts/bootstrap-conformance.ts` (numbers only, not committed)
- Gap updates and new gaps (id, sev, locus, symptom) go in progress.md.

## Final report (tiny)
WORKTREE_PATH · branch · FINAL_SHA · files touched · per-gap outcome (fixed / NOT-REPRODUCED / ruling-needed + the governing sentence) · gates · bootstrap-conformance before/after · open questions · map load-bearing?
