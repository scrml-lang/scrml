# Dispatch — change-id `s470-whole-error-binder-escapes` (security, impl#1, HIGH)

impl#1 fixes are authorized for SECURITY (S435 policy). This is one.

## The gap (verbatim id): `g-impl1-whole-error-binder-allowlist-escapes-s469` (HIGH, open)
SPEC §18.6.1 + the S469 ruling ("SPEC: whole error + refuse"): `!{ _ e :> … }` binds the WHOLE error value, typed as the error enum. Reading a payload field off it (`e.message`) is a compile error, in any spelling, and so is comparing it to a primitive. That refusal is E-TYPE-004, emitted from `compiler/src/type-system.ts` `auditWholeErrorBinderText` (PA-located-verify). Passing `e` on WHOLE is allowed, so there is an allow-list that follows `e` into callees. The S469 final review found three escapes past that allow-list. Each one still lets a wrong password log in on every side (server / fullstack / library):

1. **Callee resolved by name, not by scope.** `auditBinderCallArgs` looks the callee up in the file-wide `fnDecls` map (any `function` at any depth). An audited top-level `function check(x: AuthErr) { return x is .Denied }` admits `check(e)` even where `check` is shadowed at the call site. Fix: resolve the callee LEXICALLY, the binding the call actually names, using the scope information the tree already carries (do not build a new resolver if one exists; find the existing scope / symbol-table lookup and use it). An unresolvable callee → refuse.
2. **`log` inherited.** Following `e` into a local function, the audit keeps the CALL SITE's `logIsBuiltin`, so `function chk(x: AuthErr, log) { return log(x) }` with a lambda reading `.reason`, or a local `const log = (y) => y.reason == "bad"`, logs in. Fix: recompute `logIsBuiltin` inside each audited function, from that function's own scope.
3. **Constructor residual.** Passing `e` whole to a variant constructor is allowed, but nothing follows the payload: `Box.Wrap(e).data.inner.reason == "bad"`, `match b { .Wrap(i) :> i.reason == "bad" }`, or `i == "bad"`. Fix (from the hand-off, preferred because it reuses the existing rule): refuse a payload-field member read on ANY enum-typed value (E-TYPE-004), and enforce that from the type of the value, not by tracking `e`. If that turns out to newly-reject real corpus code beyond the binder case, STOP at that point and report the list; the fallback is to refuse a whole `e` into a constructor.

Probes from the review: `~/.cache/scrml/review/return-match-r6-keep/` (`r6a.mjs`, `r6b.mjs`). Reproduce all three on current main FIRST (verify-before-claim) and record the results in progress.md. Add each shape to the security probe pack as a permanent case.

Out of scope (another agent's lane, running concurrently): markup render-position lowering (`codegen/emit-event-wiring.ts`, `codegen/emit-html.ts`, derived-cell emission). Do not edit those files. If your fix seems to need them, stop and report.

Direction-of-change: newly-rejecting. Measure it with the R26 corpus recompile and report the list.
## CRITICAL — STARTUP VERIFICATION + PATH DISCIPLINE (PATH-DISCIPLINE INCIDENT counter: see marker history)
1. `pwd` MUST start with `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-`. `git rev-parse --show-toplevel` must equal it. Tree clean. `git merge-base HEAD origin/main` == `git rev-parse origin/main` (your base is origin/main; if not, `git fetch origin && git reset --hard origin/main` BEFORE any work, then re-verify). Any failure → report and STOP.
2. `bun install`, then run `bun run pretest` plainly from the worktree CWD (NOT `bun --cwd <path> run …` — it silently no-ops). Check `samples/compilation-tests/dist/` exists afterward.
3. Every Read/Write/Edit uses an ABSOLUTE path under your worktree root. Never `cd` into `/home/bmacs/scrmlMaster/scrml` (the main checkout). Use `git -C "$WT"`. Edit with Edit/Write (a path-discipline hook guards them); avoid Bash heredoc writes into the repo.
4. NEVER `git stash` (the stash is shared across all worktrees). Base-vs-build comparisons by FILE COPY or a detached `git worktree add` under `.claude/worktrees/` (symlink `node_modules`, don't install).
5. NEVER `pkill -f` / `killall` on a command string; kill by captured PID only.
6. `TMPDIR` must NOT point inside any repo. Scratch goes in `~/.cache/scrml-agent-tmp/<change-id>/`. Bulk output never goes in `/tmp` (it is RAM). Delete your scratch before the final report.
7. First commit: `WIP(<change-id>): start at $(pwd)` and it adds `docs/changes/<change-id>/BRIEF.md` containing THIS ENTIRE PROMPT verbatim, plus `docs/changes/<change-id>/progress.md`.
8. Commit after every meaningful unit (WIP commits expected); append timestamped lines to progress.md (done / next / blockers). Never batch. Clean `git status` before your final report. Never `--no-verify`.

## MAPS — REQUIRED FIRST READ
Read `.claude/maps/primary.map.md` first and follow its Task-Shape Routing. Map stamp: commit `e0c4ad6cc` (2026-10-24). HEAD is `915b6775f`, which is **77 commits past the map**. Post-map landings that touch your area include #1538 (`a0d81f949`, structural else-guard: structural openers are read by the markup tokenizer) and #1539 (`91133c96b`, server-return match-await: whole-error binder audit, payload-binder planner, async colouring of match arms). Treat map content as a hypothesis and verify it against source. Report whether the map was load-bearing ("not load-bearing" is a valid answer).

## Method — CONSTRAIN TO THE PROVEN PATH (S469 lesson, binding)
Over four S469 security lanes, every round-N FIX finding came from NEW machinery: a smarter reader, a carve-out, a new region, a regex scanner. The existing path never broke. So:
- Reuse the existing parsed tree / the markup tokenizer / the plain lowering. Use main's existing behaviour as the oracle.
- Do NOT write a new text scanner or a regex over source text in a post-AST stage (overlay Rule 7). Ask the tree.
- Where the proven path cannot decide, REFUSE (fail closed) under a labelled impl#1 code. Never guess, and never fail open.

## Gates before reporting DONE (the hook is not CI)
- `bun test compiler/tests/{unit,integration,conformance} --bail` (the pre-commit gate)
- `bun run types:check` (a BLOCKING CI step; if your change alters the set, `--write` the baseline in the same commit)
- `bun scripts/s34-census.ts` if you add or touch any §34 code
- The security probe pack. Find it with `grep -rln EXPECTED_SHAPE_COUNT compiler/tests` and run it; if you add shapes, update `EXPECTED_SHAPE_COUNT`.
- R26 empirical: recompile `examples/*.scrml` and `samples/**/*.scrml` on base and on your branch (`bun compiler/bin/scrml.js compile <f> --output-dir <scratch>`). Report the diagnostic delta per file. Any NEWLY-REJECTED real file is reported as a list (file + code). Do not migrate it and do not hide it.
- Do NOT edit `docs/known-gaps.md` or `docs/FACTS.md`. Put gap status updates and any new gaps (id, sev, locus, symptom) in progress.md; the PA files them.

## Final report (tiny)
WORKTREE_PATH · branch · FINAL_SHA · files touched · locus hypothesis held / refined / wrong (and the real locus) · gates (pass/fail counts) · probe-pack before/after FAIL counts · R26 delta · newly-rejected corpus list · open questions · map load-bearing?
