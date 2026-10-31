# BRIEF — s474-boot-key-and-assign-head (verbatim dispatch prompt)

You are a dispatched dev agent for the scrml PA (session S474). Change-id: `s474-boot-key-and-assign-head`. Work is in the BOOTSTRAP compiler `compiler/self-host-v2/` (written in scrml; built/run by `scripts/scrml-boot.ts`). main is branch-protected: push a feature branch, open a DRAFT PR; the PA reviews and merges. A sibling agent is concurrently building the `!` transaction envelope in the server-emission/analysis files — keep your edits to parsing/checking/lowering of loops and conditions, and keep any shared-file edits small and local.

## CRITICAL — STARTUP VERIFICATION + PATH DISCIPLINE
1. `pwd` must start with `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/`; `git rev-parse --show-toplevel` equals it; tree clean; after `git fetch origin`, `git merge-base HEAD origin/main` == `git rev-parse origin/main`. Any failure: STOP and report.
2. `bun install`, then `bun run pretest` from the worktree CWD (NOT `bun --cwd <p> run` — silently no-ops).
3. Every Edit/Write: absolute path under your worktree. Never `cd` into `/home/bmacs/scrmlMaster/scrml`. Never `git stash`. Never bare `pkill -f`. TMPDIR → `~/.cache/scrml-agent-tmp/s474-boot-key-and-assign-head/`.
4. First commit: this prompt verbatim → `docs/changes/s474-boot-key-and-assign-head/BRIEF.md`, message `WIP(s474-boot-key-and-assign-head): start at $(pwd)`. Commit after each unit; append-only timestamped `progress.md`. Never `--no-verify`. Don't regenerate `docs/FACTS.md`.

## MAPS — REQUIRED FIRST READ
`.claude/maps/primary.map.md` first (stamp d139f747c; main at 34ebef81d, docs-only since); follow its Task-Shape Routing; verify against source; report whether load-bearing.

## scrml-writing briefing (MANDATORY)
Read `../scrml-support/docs/gauntlets/BRIEFING-ANTI-PATTERNS.md` + `docs/articles/llm-kickstarter-v2-2026-05-04.md` before writing scrml; reread before each feature. Read `compiler/self-host-v2/progress.md` and match the dialect the self-host-v2 files use.

## Task A — loop-header `key` (canonical keyed iteration) + W-KEY-001
Ruling (S473 review-surfaced item 5, verbatim in `../scrml-support/user-voice-scrml.md` §S473 — read it): the loop-header `key` is the canonical keyed-iteration form (SPEC §17.4b); `key=` on the lifted element (§6.5.3) is legacy, already refused by the bootstrap with a hint; W-KEY-001 takes the header meaning. Read SPEC §17.4b, §6.5.3, §49 (loops — one `for`) and the W-KEY-001 / E- rows in §34 directly; quote the governing sentences in progress.md first. If the SPEC is silent or contradictory on the exact header grammar, STOP that sub-part and report — do not invent grammar. Build: parse the header key, carry it to keyed reconciliation in the emitted client code (the bootstrap's `<each>`/for-lift lowering — find it), and emit W-KEY-001 per the SPEC's fire condition. Related open gap: `g-boot-each-key-inference-unbuilt-s473` (MED) — only touch it if the SPEC rule is the same mechanism.

## Task B — D10 kept form `if ((x = e))` / `for ((m = re.exec(s)) is given)`
Ruling D10 (S473 SPEC-coverage D1–D34, verbatim in user-voice §S473): §50 keeps ONLY the double-parenthesized assignment-in-condition head; other assignment-as-expression forms are refused. Today the bootstrap refuses even the kept form because its parser drops the inner parentheses. Gap: `g-boot-assign-as-expression-unbuilt-s473`. Read SPEC §50 (grammar/typing marked at #1682) + §49 condition heads; quote. Build: preserve the paren marker through parse so the double-paren head is recognised, type it per §50, lower it; every other assignment-as-expression stays refused with its named code (E-ASSIGN-POSITION per D29).

Locus (PA-located-verify; searched, not traced): `parse.scrml` (heads, parens), `check.scrml`/`analyze.scrml` (diagnostics), `lower.scrml` + `js.scrml`/`print.scrml` (emission). Report whether it held.

## Tests + proof (do NOT mark done without)
- Conformance/acceptance cases both positive and negative for each task; for Task A a runtime check that keyed reconciliation preserves DOM identity on reorder (follow how existing bootstrap browser/runtime tests do it); for Task B a run of emitted code showing the loop/condition behaves.
- Bootstrap conformance before/after (command in self-host-v2/progress.md or docs/bootstrap-conformance.md); no PASS lost; report deltas.
- Update `docs/bootstrap-spec-coverage.md` + gaps in `docs/known-gaps.md` (resolve/narrow with locus= and prov=); `bun scripts/spec-coverage-check.ts` 0 warnings.

## Landing
Push `s474-boot-key-and-assign-head`; `gh pr create --draft`, title `feat(bootstrap, S474): loop-header key + W-KEY-001; D10 double-paren assignment head`; body with governing sentences, evidence, deltas; ending with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Commits end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Final report: worktree path, branch, final SHA, PR number, files touched, locus held/refined/wrong, evidence, conformance deltas, deferrals. Clean `git status` before reporting.
