# Dispatch — change-id `s471-windows-imported-alias-refusal` (security, impl#1, HIGH)

impl#1 fixes are authorized for SECURITY (S435 policy). This is one.

## The gap (verbatim id): `g-windows-imported-alias-chain-refusal-not-emitted-s470` (HIGH, open)
#1563 (S470) made a payload-field member read on an enum-typed value a compile error (E-TYPE-004 / E-TYPE-031), typed by the resolved type, including when the enum type arrives through an imported alias, an alias of an alias, a re-export (`export *`), or an imported function's return type. On the CI `windows` job, 10 cases in `compiler/tests/unit/enum-value-member-read-s470.test.js` FAIL — K-ALIAS2, IMP-STRUCT, EXPORT-STAR, both DEPTH cases, I1, I2, I3, I-cross, STAR-PREC — `codesOf` returns `[]` where `E-TYPE-004` is expected. Linux/macOS pass. So a Windows build of a multi-file program can read a payload field off an imported-alias enum value with no refusal (fail-open). The `windows` job has been red on main since #1563 (main run 40350986599; PR #1581 run 40416129494); it is `continue-on-error: true` and not required, so nothing blocked it.

Locus: UNTRACED. Hypothesis (PA, unverified — searched, not traced): the cross-file enum/alias resolution #1563 added keys files by a raw path in one place and by a `/`-normalised specifier/path in another, so on Windows (`\` separators, drive letters, possibly case) the lookup misses and the type resolves to "unknown", which the refusal treats as "not an enum" → silent. Report whether this held, was refined, or was wrong, and the real locus.

Method:
1. Read the failing job logs first: `gh run view 40350986599 --log-failed` (filter to the windows job) — confirm the exact 10 failures and any path text in them.
2. Find every place #1563's resolution builds or compares a file key (`git show` the #1563 merge; grep the diff for `path.`, `resolve`, `relative`, `replace(/\\\\/`, Map keys). Compare with how the REST of the compiler normalises module paths (there is almost certainly an existing normaliser used by the module resolver — REUSE it; do not invent a new one).
3. Reproduce without Windows: write a unit test that drives the resolver with Windows-shaped paths (`path.win32`, or by injecting the separator the code reads) if the code permits; if it does not, make the code take its paths through the existing normaliser so the Windows and POSIX keys are identical by construction, and test the normaliser boundary.
4. FAIL CLOSED on the general shape: when the resolved type of the receiver is UNKNOWN because a cross-file lookup missed (as opposed to genuinely not an enum), that must not silently pass the refusal. Decide with evidence whether a lookup miss is distinguishable; if it is, refuse (or emit an internal error) rather than accept. Report what you chose and why.
5. Prove it on real Windows: push your branch (`git -C "$WT" push -u origin <branch>`) and run `gh workflow run ci.yml --ref <branch>`; watch the `windows` job (`gh run list --branch <branch> --workflow ci.yml`, `gh run watch <id>`). The 10 cases must pass there. Do NOT open a PR; the PA lands. Record the run id in progress.md.

Out of scope (other lanes running concurrently): the null-in-arm lane edits expression-position `!{}` arm lowering / null refusal (`codegen/emit-logic.ts`, `codegen/arm-structure.ts`, the `!{}` arm path); the SPEC lane edits `compiler/SPEC.md` / `compiler/SPEC-INDEX.md`. Do not edit those. If your fix seems to need them, stop and report.

Direction-of-change: on Windows newly-rejecting (restores #1563's rule); on POSIX inert. Verify POSIX is byte-for-byte inert on the R26 recompile.

Do NOT edit `.github/workflows/ci.yml` (making `windows` required is the PA's step after you land).
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
