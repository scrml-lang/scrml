# BRIEF — s474-impl1-handler-e-variant (verbatim dispatch prompt)

You are a dispatched dev agent for the scrml PA (session S474). Change-id: `s474-impl1-handler-e-variant`. Work is in impl#1 (`compiler/src/`, TypeScript). Policy (S471): impl#1 work only for flogence/bryan-tool breakage — this qualifies (flogence reported it). main is branch-protected: push a branch, open a DRAFT PR; the PA reviews and merges.

## CRITICAL — STARTUP VERIFICATION + PATH DISCIPLINE
1. `pwd` must start with `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/`; toplevel equals it; clean; after `git fetch origin`, merge-base with origin/main == origin/main. Else STOP and report.
2. `bun install`; `bun run pretest` from the worktree CWD.
3. Absolute worktree paths for every Edit/Write; never `cd` into `/home/bmacs/scrmlMaster/scrml`; no `git stash`; no bare `pkill -f`; TMPDIR → `~/.cache/scrml-agent-tmp/s474-impl1-handler-e-variant/`.
4. First commit: this prompt verbatim → `docs/changes/s474-impl1-handler-e-variant/BRIEF.md` (`WIP(s474-impl1-handler-e-variant): start at $(pwd)`); commit after each unit; append-only `progress.md`. Never `--no-verify`. Don't regenerate `docs/FACTS.md`.

## MAPS — REQUIRED FIRST READ
`.claude/maps/primary.map.md` (stamp d139f747c; main 34ebef81d, docs-only since); Task-Shape Routing for type-system work; verify; report load-bearing or not.

## Phase 1 — REPRODUCE FIRST (reverse verify-before-claim)
flogence reported (their note, quoted): "The probe's other two arms were also failing on impl#1 with **E-TYPE-031**: they read `e.message`, and `e.variant` failed too ('the handled call's error enum cannot be resolved here'). The call is an **imported** `?{}`-using server fn (`listArcs` from `../graph-read.scrml`) and a local `?{}` fn. They compile now because they don't read `e` at all. If `e.variant` is meant to work on those calls, that's a gap."
Build a minimal two-file reproducer under your worktree (`.tmp/`): file A exports a function using `?{}` (with a `<db>`/program setup mirroring a real project — look at `/home/bmacs/scrmlMaster/flogence/viewapp/view.scrml` and `/home/bmacs/scrmlMaster/flogence/graph-read.scrml` READ-ONLY for the real shape), file B imports it and calls it with a `!{ ... }` handler whose arms read `e.variant` and `e.message`. Also the local-fn variant. Compile with `bun compiler/bin/scrml.js compile <src> --output-dir <tmp>`. Record exact diagnostics. If it does NOT reproduce on current main, classify NOT-REPRODUCED with the table and stop (still open the PR with just the reproducer test marked as a regression guard, and report).

## Phase 2 — governing sentence, then fix
Before changing behaviour, find and QUOTE the SPEC sentences that say what `e` is in a `!{}` arm on a call to a non-`!` server function / a `?{}`-using function (the error type of an implicitly failable call — §19 (§19.4.3 / §19.8.3: `?{}` is failable everywhere, `SqlError`), §19.9 Transport (S473 narrow transport routing ruling: only a `!{}` that covers the failure with `_` or `.Transport` gets a Transport value), §18.17.1 (`.variant` reads the tag on every enum value), §7.5.1 E-TYPE-031). Use grep -n on compiler/SPEC.md + targeted reads. If the SPEC does not say what `e`'s type is there, STOP and report "searched §…, no governing sentence" — that is a ruling for bryan, not a fix. If it does: the change is a conformance restoration (newly-accepting toward the contract). Fix at the ROOT (why the handled call's error enum cannot be resolved for an imported callee — likely the cross-file function signature/route metadata lacks the implicit error type), not per-position. Note: S473 PRs #1645/#1661/#1664 touched handler arms with imported callees and `transportRoutableCallee` in `compiler/src/type-system.ts` — that area is the likely locus (PA-located-verify; searched, not traced). Report held/refined/wrong.

## Tests + proof
Unit/integration tests for imported and local callee, `e.variant` and `e.message` (and an arm that matches on the variant). Runtime: run the emitted server against a failing query and show the arm receives the right variant. Measure direction-of-change: compile the samples/examples corpus before/after (find the existing differential script, e.g. `scripts/corpus-emit-differential.ts`) and report diagnostic deltas. Full pre-commit suite green.
Also re-compile flogence's real `viewapp/view.scrml` (output to your .tmp, never into flogence) with `e.variant` re-added in a scratch copy to show it now compiles.

## Landing
Push; `gh pr create --draft`, title `fix(impl#1, S474): !{} arm e.variant/e.message on an imported ?{} callee (flogence)`; body with reproducer, governing sentences, root cause, corpus delta, ending:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Commits end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Final report: worktree path, branch, SHA, PR, files, reproduced or not, governing sentences, root cause, locus verdict, corpus delta. Clean `git status`.
