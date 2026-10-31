You are a dispatched dev agent for the scrml PA (session S474). Change-id: `s474-slot-exclusive-branches`. SPEC text + the BOOTSTRAP compiler (`compiler/self-host-v2/`, written in scrml). impl#1 is OUT of scope (S471 policy) unless it already implements D11 — check and report only. main is branch-protected: push a branch, open a DRAFT PR; the PA reviews and merges. Sibling agents are concurrently editing other bootstrap files (envelope emission; loop key/assignment-head parsing) — keep your edits to slot resolution and keep any shared-file edits small and local.

## CRITICAL — STARTUP VERIFICATION + PATH DISCIPLINE
1. `pwd` must start with `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/`; toplevel equals it; clean; after `git fetch origin`, merge-base with origin/main == origin/main. Else STOP.
2. `bun install`; `bun run pretest` from the worktree CWD.
3. Absolute worktree paths for Edit/Write; never `cd` into `/home/bmacs/scrmlMaster/scrml`; no `git stash`; no bare `pkill -f`; TMPDIR → `~/.cache/scrml-agent-tmp/s474-slot-exclusive-branches/`.
4. First commit: this prompt verbatim → `docs/changes/s474-slot-exclusive-branches/BRIEF.md` (`WIP(s474-slot-exclusive-branches): start at $(pwd)`); commit after each unit; append-only `progress.md`. Never `--no-verify`. Don't regenerate `docs/FACTS.md`.

## MAPS — REQUIRED FIRST READ
`.claude/maps/primary.map.md` (stamp d139f747c; main 34ebef81d, docs-only since); Task-Shape Routing; verify; report load-bearing or not.

## scrml-writing briefing (MANDATORY)
Read `../scrml-support/docs/gauntlets/BRIEFING-ANTI-PATTERNS.md` + `docs/articles/llm-kickstarter-v2-2026-05-04.md` before writing scrml. Read `compiler/self-host-v2/progress.md`; match the self-host-v2 dialect.

## The rulings (verbatim in `../scrml-support/user-voice-scrml.md` — read §S473 D11 and §S474 item 2)
- D11 (S473): "slots: zero `<slot/>` with use-site children, more than one unnamed slot, and a `<slot/>` outside `renders` are each compile errors."
- S474 item 2: "**F7: one unnamed `<slot/>` per exclusive branch is legal.** Two unnamed slots in the two arms of an `if/else` (or exclusive `match` arms) count as one, because only one can render. Refines D11; non-exclusive duplicates stay an error."

## Task
1. SPEC: find where D11 landed (grep SPEC.md §16 / §66.15 for the slot rules and their §34 codes; #1682/#1690 put them in). Quote the current sentence. Amend it per S474 item 2 with a `> **Provenance:** ruling:user-voice-scrml.md S474 item 2 · supersedes: ruling:user-voice-scrml.md S473 D11 (count rule only)` line. Define "exclusive" precisely and narrowly, from constructs the SPEC already defines: the two arms of one `if`/`else` chain (§17 if-chains / `if=`… only where the SPEC makes them mutually exclusive — check whether `if=`/`else` attribute chains exist and qualify), the arms of one `match` / `<match>` block. NOT exclusive: siblings, two separate `if`s, `<each>` bodies (repeats → a slot in an `<each>` row: check what the SPEC says and keep it). Nested exclusivity: a slot counts once per path; the rule is "on every render path at most one unnamed slot". If the SPEC lacks a definition of exclusivity you need, STOP that part and report — don't invent.
2. Bootstrap: change slot counting (PA-located-verify: `analyze.scrml` slot resolution, near gap `g-boot-named-slot-shapes-not-refused-s473`; report held/refined/wrong) from a total count to a per-render-path max. Emission must render the use-site children into whichever branch's slot is live (verify by running emitted output in both branch states).
3. Tests: positive (if/else two slots; match arms each one slot; nested if inside a match arm), negative (two sibling slots; slot in both a branch and outside it; two separate ifs), runtime check for both branches. Bootstrap conformance before/after, no PASS lost. Update `docs/bootstrap-spec-coverage.md` + known-gaps; `bun scripts/spec-coverage-check.ts` 0 warnings.

## Landing
Push; `gh pr create --draft`, title `spec+bootstrap(S474): one unnamed slot per exclusive branch (F7, refines D11)`; body with quoted before/after SPEC text, exclusivity definition, evidence; ending:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Commits end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Final report: worktree path, branch, SHA, PR, files, SPEC diff, locus verdict, runtime evidence, conformance deltas, impl#1 D11 status. Clean `git status`.
