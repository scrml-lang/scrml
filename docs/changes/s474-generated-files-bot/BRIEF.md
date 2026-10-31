You are a dispatched agent for the scrml PA (session S474). Change-id: `s474-generated-files-bot`. main is branch-protected: push a branch, open a DRAFT PR; the PA reviews and merges.

## CRITICAL — STARTUP VERIFICATION + PATH DISCIPLINE
1. `pwd` must start with `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/`; toplevel equals it; clean; after `git fetch origin`, merge-base with origin/main == origin/main. Else STOP.
2. `bun install`; `bun run pretest` from the worktree CWD.
3. Absolute worktree paths for Edit/Write; never `cd` into `/home/bmacs/scrmlMaster/scrml`; no `git stash`; no bare `pkill -f`; TMPDIR → `~/.cache/scrml-agent-tmp/s474-generated-files-bot/`.
4. First commit: this prompt verbatim → `docs/changes/s474-generated-files-bot/BRIEF.md` (`WIP(s474-generated-files-bot): start at $(pwd)`); commit after each unit; append-only `progress.md`. Never `--no-verify`.

## The ruling (bryan, S474, verbatim in `../scrml-support/user-voice-scrml.md` §S474 — read it)
"Generated files move to a post-merge bot. PRs stop committing regenerated blocks (known-gaps counts, coverage totals, `severity.scrml`, SPEC-INDEX, bootstrap-conformance.md and the like); a post-merge bot (the FACTS.md pattern) regenerates them on main; CI checks only the sources."
Why: in S473 every PR that touched gaps went DIRTY when another landed; ~8–10 re-merge rounds.

## Task
1. **Inventory first (report it):** enumerate EVERY generated artifact/block in the repo whose content derives from other files and that PRs currently must regenerate: grep for `@generated`, look at `scripts/state.ts --write/--check`, `scripts/regen-spec-index.ts`, `scripts/git-merge-generated.ts`/`.sh` (the merge driver — `.gitattributes`), `scripts/spec-coverage-check.ts`, the bootstrap conformance report writer, `severity.scrml` generator, the md shim gate in `.github/workflows/ci.yml`, the pre-commit hook (`scripts/git-hooks/` and `git config core.hooksPath`), and CI `gate` steps that `--check` currency. For each: what it derives from, who regenerates it today, which gate fails when stale. Print N of M — do not truncate.
2. **Classify:** (a) pure derived DOC blocks (counts, indexes, reports) → move to the bot; (b) generated CODE/inputs the build or tests consume (e.g. a shim the runtime loads, `severity.scrml` if the bootstrap compiles it) → these CANNOT go stale on main between merge and bot run without breaking main; for those, report and propose (keep in-PR + merge driver, or make the build generate them). Do not move class (b) without stating the hazard; when unsure, leave it in-PR and list it.
3. **Build the bot** modelled exactly on `.github/workflows/facts-regen.yml` (read it fully: concurrency, `bot/…` branch, one PR, auto-merge through the merge queue, no-race reasoning). Either extend facts-regen into one `generated-regen` workflow or add a sibling — pick one, justify. It runs every class-(a) regenerator on main after merge and opens/updates one bot PR.
4. **Flip the gates:** CI and the pre-commit hook stop FAILING on stale class-(a) blocks (mirror how ci.yml treats FACTS.md stale: exit 4 → `::warning::`, other non-zero still FAILS — i.e. a broken/degenerate generator still fails the PR; only staleness is non-blocking). Source-validity checks that are NOT staleness (e.g. spec-coverage rows must exist for a gap, `state.ts` parse errors, malformed markers) MUST stay blocking — list which checks stay blocking and why. Base §8: do not create a gate that cannot fail; prove each changed gate still bites on a deliberately broken input (corrupt → red → restore → green), and record the proofs.
5. **Docs:** update the places that tell agents/PA to regenerate in-PR: `../scrml-support/pa-scrml-overlay.md` wrap step 6d is in scrml-support — DO NOT edit scrml-support; instead list the exact lines that need changing in your report. In scrml: update any in-repo instructions (CONTRIBUTING, scripts headers, hook messages, ci.yml comments, the merge driver message).
6. The `.gitattributes` merge driver for these files: decide whether it stays (harmless, still useful locally) — justify.

## Landing
Push; `gh pr create --draft`, title `ci(S474): generated blocks regenerate post-merge (bot); PRs and CI check sources only`; body = inventory table, class (a)/(b) split, gate changes with bite proofs, overlay lines to change; ending:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Commits end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Final report: worktree path, branch, SHA, PR, files, the inventory (N of M), class (b) hazards, bite proofs, overlay edits needed. Clean `git status`.
