# BRIEF — s474-impl1-sqlerror-binder (verbatim dispatch prompt)

You are a dispatched dev agent for the scrml PA (session S474). Change-id: `s474-impl1-sqlerror-binder`. Work in impl#1 (`compiler/src/`). Policy (S471): impl#1 work is allowed for flogence breakage — this is flogence's forward path (their library must move to the SPEC-correct `! -> SqlError` shape, and that shape currently breaks `e.variant`). main is branch-protected: push a branch, open a DRAFT PR; the PA reviews and merges.

## CRITICAL — STARTUP VERIFICATION + PATH DISCIPLINE
1. `pwd` must start with `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/`; toplevel equals it; clean; after `git fetch origin`, merge-base with origin/main == origin/main. Else STOP.
2. `bun install`; `bun run pretest` from the worktree CWD.
3. Absolute worktree paths for Edit/Write; never `cd` into `/home/bmacs/scrmlMaster/scrml`; no `git stash`; no bare `pkill -f`; TMPDIR → `~/.cache/scrml-agent-tmp/s474-impl1-sqlerror-binder/`.
4. First commit: this prompt verbatim → `docs/changes/s474-impl1-sqlerror-binder/BRIEF.md` (`WIP(s474-impl1-sqlerror-binder): start at $(pwd)`); commit after each unit; append-only `progress.md`. Never `--no-verify`. Don't regenerate `docs/FACTS.md`.

## MAPS — REQUIRED FIRST READ
`.claude/maps/primary.map.md` (stamp d139f747c); verify against source; report load-bearing or not.

## Symptom (PA-verified by execution on main 34ebef81d)
Reproducer (copy it into your worktree `.tmp/`): `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-a0027390fb2e87e78/.tmp/bang/` (`lib.scrml` exports `function listItems()! -> SqlError { … ?{…} … }`; `viewapp/view.scrml` imports it and has a local equivalent; both calls have `!{ _ e :> … e.variant … }`). `bun compiler/bin/scrml.js compile <copy>/viewapp/view.scrml --output-dir <tmp>` → exit 1, `error [E-TYPE-031]: \`e\` in \`_ e :>\` is the WHOLE error value (the handled call's error enum): the handled call's error enum cannot be resolved here` ×2.
Related, already landed: PR #1694 (draft, test-only) covers the NON-`!` callee shape, which works on main.

## Governing sentences (quoted by the prior agent — re-read and re-quote them yourself from compiler/SPEC.md before changing anything)
- §18.6.1: "The binder's type is the type of the failure being handled — … a client call to a server function (§19.9.10): the call's failure set — `Transport(t: ServerCallError)`, and for a server function declared `! E` the variants of `E` as well".
- §18.17.1: "Every enum value has the member `.variant`"; reading other members off a known enum type is E-TYPE-004.
- Also read §19.8.3 (item 3: the `! -> SqlError` shape) and the definition of `SqlError` (find it — §8.7/§19.4.3/§44.3) to know its variant set. If the SPEC does not define SqlError's variants, STOP and report "searched …": that is a ruling.

## Locus (PA-located-verify — from the prior agent's reading, not traced by me)
`resolveFailableErrorType` in `compiler/src/type-system.ts` (near the comment "turning them on is newly-rejecting beyond S466's scope") deliberately gives compiler-provided `Error` / `SqlError` / `ServerCallError` no variant set, so `wholeBinderCalleeEnum` returns null for `! -> SqlError`. Report held/refined/wrong.

## Constraint — direction of change (base §8, binding)
The target is a conformance restoration: the `_ e :>` whole binder on a `! -> SqlError` call (imported and local; client-placed call adds `Transport`) gets the §18.6.1 type so `e.variant` and `match e { … }` compile. That is newly-ACCEPTING toward a quoted contract — allowed.
The S466 comment warns that turning variant sets on GLOBALLY is newly-REJECTING (e.g. `e.message` on a SqlError somewhere would start failing E-TYPE-004). So: (1) prefer the narrowest root fix that types the binder from the declared `! E` without changing other consumers of `resolveFailableErrorType`; (2) whatever you change, MEASURE: run the corpus differential (find `scripts/corpus-emit-differential.ts` or the existing corpus compile script; corpus = samples/, examples/, conformance cases, stdlib, plus `/home/bmacs/scrmlMaster/flogence/**/*.scrml` READ-ONLY with output to your .tmp) before/after and report every diagnostic delta file-by-file. Any NEWLY-REJECTING delta → STOP and report it; do not land it (that is bryan's ruling, not ours).

## Tests + proof
Unit/integration: imported + local `! -> SqlError` callee, `_ e :>` with `e.variant`, `.Transport :>` arm, a variant arm of SqlError if it has variants, `e.message` still E-TYPE-004. Runtime: build + serve the reproducer, drop the table, show the arm receives the correct value (mirror the run-time harness in PR #1694's test `compiler/tests/unit/handler-e-variant-imported-sql-callee-s474.test.js` — fetch the branch `s474-impl1-handler-e-variant` to read it). Full pre-commit suite green. File/narrow the gap in `docs/known-gaps.md` (with locus= and prov=).

## Landing
Push; `gh pr create --draft`, title `fix(impl#1, S474): !{} whole binder on a ! -> SqlError callee gets the §18.6.1 type`; body: reproducer, quoted sentences, root cause, corpus delta table; ending:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Commits end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Final report: worktree path, branch, SHA, PR, files, locus verdict, corpus delta, runtime evidence. Clean `git status`.
