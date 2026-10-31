You are a dispatched dev agent for the scrml PA (session S474). Change-id: `s474-boot-u1e-envelope`. Work is in the BOOTSTRAP compiler `compiler/self-host-v2/` (written in scrml; built and run by `scripts/scrml-boot.ts`). main is branch-protected: push a feature branch, open a DRAFT PR; the PA reviews (adversarial S239 pass) and merges.

## CRITICAL — STARTUP VERIFICATION + PATH DISCIPLINE
1. `pwd` must start with `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/`; `git rev-parse --show-toplevel` equals it; tree clean; after `git fetch origin`, `git merge-base HEAD origin/main` == `git rev-parse origin/main`. Any failure: STOP and report.
2. `bun install`, then `bun run pretest` from the worktree CWD (NOT `bun --cwd <p> run`, which silently no-ops). Copy `samples/compilation-tests/dist` from main if the browser tests need it.
3. Every Edit/Write: absolute path under your worktree. Never `cd` into the main checkout `/home/bmacs/scrmlMaster/scrml`. Never `git stash`. Never bare `pkill -f`. TMPDIR → `~/.cache/scrml-agent-tmp/s474-boot-u1e-envelope/` (never in a repo, nothing bulk in /tmp).
4. First commit: this prompt verbatim → `docs/changes/s474-boot-u1e-envelope/BRIEF.md`, message `WIP(s474-boot-u1e-envelope): start at $(pwd)`. Commit after each unit; append-only timestamped `progress.md` beside it. Never `--no-verify`. Don't regenerate `docs/FACTS.md`.

## MAPS — REQUIRED FIRST READ
Read `.claude/maps/primary.map.md` first (stamp d139f747c, 2026-10-30; main is at 34ebef81d — only the S473 wrap docs landed since) and follow its Task-Shape Routing for bootstrap work. Treat map content as a hypothesis to verify against source. Report whether the maps were load-bearing.

## scrml-writing briefing (MANDATORY — you are writing scrml)
Read `../scrml-support/docs/gauntlets/BRIEFING-ANTI-PATTERNS.md` and `docs/articles/llm-kickstarter-v2-2026-05-04.md` before writing any scrml; reread before each feature. Also read `compiler/self-host-v2/progress.md` (the bootstrap's own log) and mirror the dialect the existing self-host-v2 files use (it follows SPEC §66 / S469 forms: `;` termination, one `for`, tapes not arrays, etc.).

## Task — build the transitive `!` transaction envelope (U1e)
Today the bootstrap REFUSES a `!` function whose transitive query set needs an envelope (interim refusal landed in PR #1690). Build the real thing so those programs compile with the guarantee, then remove the interim refusal for what you build.

Governing rules — read them in SPEC.md directly (use `grep -n` then targeted Read), quote the governing sentences in progress.md before coding: §8.9 / §8.9.2 (implicit envelope), §19.10.5 (implicit per-handler tx; the F11 client multi-call refusal stays), §19.10.6 (nested savepoints, manual `?{BEGIN}` bounded by its function), §8.1.2/§8.1.3 (`<db>`), §47.14 is irrelevant. Rulings (verbatim in `../scrml-support/user-voice-scrml.md` §S473 — read them; brief from there, not from this summary):
- The envelope trigger is the TRANSITIVE QUERY set: every `?{}` reached from the `!` body through non-`!` AND `!` callees; reach multiplicity counts; a query in a loop counts as ≥2. ≥2 → envelope.
- An inner `!` call inside an outer envelope runs as a nested SAVEPOINT; the outer can roll back the inner's writes.
- `PRAGMA journal_mode = OFF` reaching a `!` connection stays refused. `navigate()` inside `transaction {}` stays a compile error. Client-placed `!` calling ≥2 server fns stays the permanent refusal E-TX-CLIENT-MULTI-CALL.
- D1: refuse rather than compile without the guarantee — anything you do NOT build (e.g. cross-database writes in one envelope, manual BEGIN interplay you can't prove) must stay a NAMED refusal from the one refusal table (`refusals.scrml`, D28), never compile unguarded.

Locus (PA-located-verify — I searched by name, I did not trace; report whether this held): the interim refusal is in the #1690 code (`git log --oneline -5 -- compiler/self-host-v2/` and `git show` the #1690 merge to find it); server emission is likely `print-server.scrml` + `lower.scrml` + `sql.scrml`; reach analysis likely `analyze.scrml`/`effects.scrml`. Find how the bootstrap emits a server handler's `?{}` calls and the SQLite connection; emit BEGIN/COMMIT/ROLLBACK (SAVEPOINT/RELEASE/ROLLBACK TO for nesting) around the `!` body such that a `fail`, a `?` propagation, a trap, or a thrown host error rolls back, and success commits. Match whatever impl#1 (`compiler/src/codegen/emit-server.ts`, envelope) does at runtime ONLY as a behavioural oracle — do not copy its known gaps (g-implicit-envelope-only-on-baseline-csrf-arm, g-impl1-cross-database-write-in-envelope-s451).

## Tests + empirical proof (do NOT mark done without these)
- Conformance/acceptance cases for: two queries direct; one direct + one via non-`!` callee; via `!` callee (savepoint, outer rollback undoes inner); query in a loop; `fail` after the first write → nothing persisted (RUN the emitted server against a real SQLite file and SELECT afterwards); success → both persisted; still-refused shapes each produce their named code.
- Run the bootstrap conformance (`bun scripts/scrml-boot.ts` / the bootstrap-conformance command documented in progress.md / docs/bootstrap-conformance.md) before and after; report PASS/FAIL/UNSUPPORTED deltas. No PASS may be lost.
- Run the full pre-commit suite (the hook runs it on commit).
- Update `docs/bootstrap-spec-coverage.md` rows and close/narrow the gaps you resolve in `docs/known-gaps.md` (find them: grep envelope/transitive/U1e/s473). Keep `bun scripts/spec-coverage-check.ts` at 0 warnings.

## Landing
Push `s474-boot-u1e-envelope`; `gh pr create --draft`, title `feat(bootstrap, S474): transitive ! envelope — BEGIN/COMMIT/ROLLBACK + nested savepoints (U1e)`; body = what was built, what stays refused and why, governing sentences quoted, test evidence, conformance deltas; end the body with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Commits end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Final report: worktree path, branch, final SHA, PR number, files touched, locus hypothesis held/refined/wrong, empirical rollback evidence (commands + output), conformance before/after, anything deferred. Clean `git status` before reporting.
