# Lane s476-boot-tape-inplace — local tape append / slot write in place when no alias can see it

change-id: `s476-boot-tape-inplace` · agent: scrml-js-codegen-engineer · S476 (bryan, theRog)

## Problem (adopter report, bryan's lotto-analyzer app on the bootstrap, main @ a9057254c)
- `rt.tapeAppend` (`compiler/self-host-v2/slice-m1/runtime/runtime.js:2425`, PA-located-verify) is copy + push on every call, so the canonical list build in a pure `fn` — `let out: T[free, append] = []; for (…) { out.append(x); }` — is O(n²). Measured in headless Chromium: 10,000 appends ≈ 150 ms; 100,000 ≈ 18 s (10× n → ~120× time). The app had to cap input at 20,000.
- A slot write on a local, `xs[i] = v`, lowers to `rt.writePath`, which does `obj.slice()` per write (runtime.js ~:1476), so a counting table updated in a loop is O(n) per write. Overall the bootstrap build ran ~3× slower than a plain-JS port (1,372 ms vs 444 ms one run).
- `sortBy` / `tapePrepend` / `tapeConcat` share the copy-per-call shape (lower priority).

## Goal
Make these writes amortized O(1) (append) / O(1) (slot write) WHEN no other binding can observe the old value, while keeping §66.10 value semantics exactly: aliases snapshot. This must be SEMANTICS-INERT — the same program prints the same output; only time changes.

Read SPEC §66.10 (value semantics: "aliases snapshot") and §66.12 (tapes, grants) first and quote the governing sentences in progress.md. If you find a case where an in-place write would be observable, it stays a copy.

## Design direction (not ruled — you choose, justify in progress.md)
Options: (a) a compile-time uniqueness proof in the lowering — a local whose value has not been read into any other binding, cell, argument, closure, return, or struct/tape since its last write may be written in place; (b) runtime copy-on-write (an owned flag / refcount on the backing array, cleared when the value escapes); (c) a hybrid. Prefer the one that is correct BY CONSTRUCTION and cannot fail open: when unsure, copy. An escape you cannot see (a value passed to a call, stored, captured, returned, iterated by a `for … of` that lets the body read it) must force a copy. Consider loops: a value read in iteration k and written in k+1.

## Verification
1. Correctness tests (new `compiler/self-host-v2/slice-m4/tape-inplace-s476.test.js`): every alias shape stays a snapshot — `const b = a; a.append(1)` leaves `b`; append after passing to a function, after storing in a cell, after returning, after putting in a struct, inside a loop that reads the previous value, after a `for (x of a)` over it, slot write after aliasing. Run them on base and after: identical outputs.
2. Performance test: 100,000 appends in a pure `fn` completes in well under 1 s (state the measured number before/after); 100,000 slot writes on a local likewise. Make the test robust to slow CI (assert a generous bound, e.g. < 2 s, and report the real numbers).
3. Full bootstrap test set green; `bun scripts/bootstrap-conformance.ts --json` before/after: no PASS→FAIL, no new CRASH.
4. R26: `~/projects/lotto-analyzer/analyzer.scrml` (bryan's app; read it, do NOT edit it — copy it to `~/.cache/scrml/s476-boot-tape-inplace/` if you need to raise its input cap) compiled with `bun scripts/scrml-boot.ts compile` on base and after; outputs identical for the same seed; report timings. `node --check` every emitted .js. DO NOT mark DONE without this.
## CRITICAL — STARTUP VERIFICATION + PATH DISCIPLINE (F4) — path-discipline incidents on record: S99×4, S314×1
1. `pwd` MUST start with `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-`. `git rev-parse --show-toplevel` MUST equal `pwd`. `git status --short` MUST be clean. If any check fails: STOP, report, exit.
2. Your worktree is cut from `origin/main`. Assert it: `git fetch origin && git merge-base HEAD origin/main` == `git rev-parse origin/main`; if not, `git merge --ff-only origin/main`.
3. `bun install` then `bun run pretest` (run from the worktree cwd; `bun --cwd <path> run …` without `=` silently no-ops).
4. First commit: `WIP(<change-id>): start at <pwd output>`.
5. Edit with Edit/Write on WORKTREE-ABSOLUTE paths only. NEVER `cd` into `/home/bmacs/scrmlMaster/scrml` (the main checkout). Use `git -C "$WT"` and worktree-absolute paths. NEVER use `git stash` (the stash is shared across all worktrees). NEVER `pkill -f` / `killall` — kill only by a PID you captured.
6. `TMPDIR` must not point inside any repo. Scratch files (commit messages, PR bodies, probes) go under `~/.cache/scrml/<change-id>/`, not the session scratchpad.

## MAPS — REQUIRED FIRST READ
Read `.claude/maps/primary.map.md` first and follow its Task-Shape Routing to the 2–4 maps for your task. Map stamp: commit `fa0e875b4`, 2026-11-03. ⚠ STALE: every S475 landing (#1744–#1812) is after the stamp and changed `compiler/self-host-v2/{analyze,parse,check,core,print}.scrml` and `slice-m1/runtime/runtime.js` heavily. Treat map content as a hypothesis; verify against source. Report in your final message whether the maps were load-bearing ("not load-bearing" is a valid answer).

## Policy
- impl#1 (`compiler/src/`) gets NO work (bryan, S475: "we are not wasting resources on the impl#1"). All work is in the bootstrap (`compiler/self-host-v2/`, `scripts/scrml-boot.ts`, its tests, conformance).
- `compiler/SPEC.md` is normative. Before changing what a program MEANS or whether it is ACCEPTED, quote the governing sentence (with §) in progress.md, or record "searched §X, §Y — no governing sentence found" and STOP that item: an unspecified shape is an owner ruling, not yours. Record a `provenance:` line for any language-surface change.
- Capability over limitation (S474): if you must refuse a form, tag it INTERIM (refused until built) with the capable form named. Never invent a PERMANENT restriction.
- Generated blocks are bot-owned: do NOT commit `docs/generated/*`, SPEC-INDEX totals, FACTS.md, coverage totals, `bootstrap-conformance.md`, `severity.scrml` regen. Commit `@gap` markers and sources only.
- Any locus named in this brief is PA-located-verify (searched, not traced). Report whether it held, was refined, or was wrong.

## Commit + hooks + report
- Commit after each meaningful unit (WIP commits fine). Keep `docs/changes/<change-id>/progress.md` (append-only, timestamped: done / next / blockers). Clean `git status` before your final report.
- Pre-commit hook under parallel lanes: run commits with `SCRML_HOOK_SHARDS=1 SCRML_HOOK_SHARD_TIMEOUT_S=2400` in the environment. NEVER `--no-verify`. If the hook outlasts the foreground limit, run it in the background and wait on its PID with a cap (`while kill -0 $PID; do sleep 20; done`), never `pgrep -f`.
- Push your branch (`git push -u origin HEAD`) and open a DRAFT PR (`gh pr create --draft`), body under `~/.cache/scrml/<change-id>/pr-body.md`. Do NOT merge. Do NOT mark ready.
- Do not end your turn while any background command is running. Your FINAL MESSAGE IS YOUR ONLY REPORT: worktree path, branch, head SHA, PR number, files touched, what changed, tests red-on-base→green, conformance delta, R26 result, every PA reading you made (marked ⚑), open items, and maps load-bearing yes/no.
