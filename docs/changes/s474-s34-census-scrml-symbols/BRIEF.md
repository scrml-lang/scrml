# BRIEF — s474-s34-census-scrml-symbols (verbatim dispatch prompt)

You are a dispatched dev agent for the scrml PA (session S474). Change-id: `s474-s34-census-scrml-symbols`. main is branch-protected: push a feature branch, open a DRAFT PR; the PA reviews and merges.

## CRITICAL — STARTUP VERIFICATION + PATH DISCIPLINE
1. `pwd` must start with `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/`; toplevel equals it; clean; after `git fetch origin`, merge-base with origin/main == origin/main. Else STOP.
2. `bun install`; `bun run pretest` from the worktree CWD.
3. Absolute worktree paths for every Edit/Write; never `cd` into `/home/bmacs/scrmlMaster/scrml`; no `git stash`; no bare `pkill -f`; TMPDIR → `~/.cache/scrml-agent-tmp/s474-s34-census-scrml-symbols/`.
4. First commit: this prompt verbatim → `docs/changes/s474-s34-census-scrml-symbols/BRIEF.md` (`WIP(s474-s34-census-scrml-symbols): start at $(pwd)`); commit after each unit; append-only `progress.md`. Never `--no-verify`. Do NOT regenerate generated blocks (known-gaps counts, FACTS.md, SPEC-INDEX totals) — ruled S474 to move to a post-merge bot (PR #1696, open).

## The hollow gate
`scripts/s34-census.ts --check-new` enforces that a new/changed SPEC §34 error-code row's provenance RESOLVES: backticked repo paths exist and every symbol named via `` `path` `sym` `` / "via `sym`" / "in `sym`" appears in executable source. But `treeIdents` only collects identifiers from `.ts`/`.js`/`.mjs` (the `JSISH` filter), although it walks `compiler/self-host-v2` and `EXT` accepts `.scrml`. Consequences, both found in S474 PR #1697:
- a correct row naming a bootstrap function (`` `compiler/self-host-v2/analyze.scrml` `resolveSlot` `` — `fn resolveSlot` exists at analyze.scrml ~:16800) FAILS as "STALE PROVENANCE";
- the workaround form `` `…analyze.scrml` (`resolveSlot`) `` PASSES only because the resolver doesn't parse the parenthesized form at all — so NO bootstrap symbol cited in any §34 row is actually checked; a renamed bootstrap function passes silently.
Gap filed on #1697's branch (not yet on main): `g-s34-census-symbol-check-ignores-scrml-s474`.

## Task
1. Read `scripts/s34-census.ts` fully, and its tests (find them: grep the tests dirs for s34-census).
2. Collect identifiers from `.scrml` files too (strip `//` and `/* */` comments and string/display-text literals first, so a name mentioned in a comment doesn't count — the same discipline the TS side should already have; check it does).
3. Make the parenthesized citation form `` `path` (`sym`) `` resolve too (it is the established bootstrap form in SPEC — grep SPEC.md for `.scrml\` (\`` to measure how many rows use it), and when a symbol is cited with a path, check the symbol in THAT file, not anywhere in the tree (stricter; measure what breaks).
4. MEASURE before landing (base §8 — this newly REJECTS): run the full census over ALL existing §34 rows (not just --check-new) on base vs your head; list every row that newly fails, with the reason. If any existing row now fails because its citation is genuinely stale, do NOT fix the SPEC in this PR — list them for the PA (newly-rejecting over a backlog is a ruling), and make `--check-new` (the CI mode, new/changed rows only) the thing that bites, so CI isn't instantly red over the backlog.
5. Prove the bite: a new row citing a renamed bootstrap symbol fails --check-new; a correct one passes; both citation forms.
6. Tests for all of the above. CI-only gate: also run `bun scripts/s34-census.ts --check-new --base origin/main` before pushing.

## Landing
Push `s474-s34-census-scrml-symbols`; `gh pr create --draft`, title `ci(S474): §34 census resolves bootstrap (.scrml) symbols, both citation forms`; body with the measurement table and bite proof; ending:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Commits end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Final report: worktree path, branch, SHA, PR, files, the base-vs-head full-census delta (N of M rows), bite proof. Clean `git status`.
