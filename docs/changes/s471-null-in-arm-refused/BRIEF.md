# Dispatch — change-id `s471-null-in-arm-refused` (security, impl#1, HIGH)

impl#1 fixes are authorized for SECURITY (S435 policy). This is one.

## The gap (verbatim id): `g-impl1-null-in-expression-position-arm-not-refused-s470` (HIGH, open)
`null` is not refused inside an expression-position `!{}` arm. `return (local(p) !{ _ :> [p].find(isOk) != null }) ? "LOGGED IN" : "rejected"` compiles; the comparison is emitted as `!_scrml_structural_eq(await _scrml_findAsync([p], isOk), null)`, and BOTH passwords log in (library and fullstack). The server call is awaited (#1576's fix holds); the hole is the `null` comparison. Executed by the #1576 round-4 review: `~/.cache/scrml/review/s470-li4/runs/h16/024`, `025` (FAIL on head and base). Reproduce it on current main FIRST (verify-before-claim) and record in progress.md.

Governing text: SPEC §42.1 — `null` does not exist in scrml (and neither does `undefined`); absence is `not`. Read §42.1 and the E-SYNTAX-042 row in §34 IN FULL (`grep -n` the headings in `compiler/SPEC.md`, then read with offset/limit) and quote the governing sentence in progress.md before changing anything. E-SYNTAX-042 is the existing refusal of `null`/`undefined`; the bootstrap refuses it as E-PARSE-NO-NULL.

Locus: UNTRACED. Hypothesis (PA, unverified): the existing `null` refusal (E-SYNTAX-042, in `compiler/src/gauntlet-phase*-checks.js` or the type-system / ast-builder — find it) walks statements and expressions it can see as parsed nodes, but an expression-position `!{}` arm body is held as TEXT / a separate arm structure the walker never visits, so `null` there is never inspected. Fix the ROOT: make the existing refusal see every arm body (and audit: every other place an expression is held outside the walked tree — match arms, `?{}` slots, engine bodies, if-as-expression arms — and report which ones `null` / `undefined` also escape on). Do not write a new text scanner over source (overlay Rule 7); route through the parsed tree, and where the arm is only text, parse it with the existing expression parser or refuse.

Out of scope (other lanes running concurrently): the Windows lane edits the cross-file enum/alias resolution in `compiler/src/type-system.ts` (the #1563 imported-alias path / file keying); the SPEC lane edits `compiler/SPEC.md` / `compiler/SPEC-INDEX.md`. Do not edit those regions/files. If your fix needs a SPEC sentence, write the proposed text in progress.md for the PA.

Direction-of-change: newly-rejecting (a governing sentence exists). Measure it with the R26 corpus recompile and report the list.
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
Read `.claude/maps/primary.map.md` first and follow its Task-Shape Routing. Map stamp: commit `3d17013f8` (2026-10-26). HEAD is `a8bac7248`, 15 commits past the map; the post-map landings are #1581 (`s470-promise-all-batch-elements`: lift-concurrent Promise.all batch elements, `codegen/scheduling.ts`) and the S470 wrap docs. Treat map content as a hypothesis and verify it against source. Report whether the map was load-bearing ("not load-bearing" is a valid answer).

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
