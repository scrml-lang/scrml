# Lane s476-boot-call-source-types — iterating a call result keeps its element type; an array literal is a typed receiver

change-id: `s476-boot-call-source-types` · agent: scrml-js-codegen-engineer · S476 (bryan, theRog)

Two LOW adopter friction items from bryan's lotto-analyzer app on the bootstrap (main @ a9057254c):

## 1. A `for … of` or `<each in=…>` source that is a call loses the declared element type
```scrml
type F:struct = { a: int }
fn mk() -> F[] { let out: F[free, append] = []; out.append({ a: 1 }); return out; }
<main><ol><each in=mk() as f><li>${f.a}</li></each></ol></main>
```
gives `E-BOOTSTRAP-UNSUPPORTED: member access .a on a value that is not a struct or an instance`, though `mk` declares `-> F[]`. `for (x of mk()) { … x.a … }` inside a `fn` fails the same way. Binding first (`const xs: F[] = mk(); for (x of xs)`) works. Goal: the source's declared return type flows to the binder (both forms). If some call sources genuinely cannot be typed (e.g. an untyped callee), the refusal message must name the real limit ("an each/for source that is a call …") and give the bind-first workaround.

## 2. An array literal is not a typed receiver
`${[10, 9, 2].sort().join(",")}` gives two E-BOOTSTRAP-UNSUPPORTED ("a built-in method needs a receiver of a known type"). An array literal of ints has a knowable type (`int[]`). Goal: a homogeneous literal is a typed receiver for the built-in methods the bootstrap already supports on that type. ⚠ `.join` on `int[]` waits on the int→string ruling (`g-bootstrap-int-to-string-conversion-unruled-s469`) — check that gap; if `join` on `int[]` is not legal today on a typed `int[]` cell either, keep that refusal and test with a method that is legal (and with a `string[]` literal + `join`).

## Locus (PA-located-verify)
`compiler/self-host-v2/analyze.scrml` — the for-of / each source typing and the method-receiver typing. Survey first; another lane (`s476-boot-page`) is also editing analyze.scrml, so keep your edits local to the functions you need.

## Rules
Read the governing SPEC text (§17.7 `<each>`, §49 `for`, §14 types, §66.12 tape methods) and quote it. Both items are conformance restorations (SPEC already types these); if you find an item is not, STOP that item and report it as an owner question.

## Verification
- New `compiler/self-host-v2/slice-m4/call-source-types-s476.test.js`: red on base, green after; include negative cases (untyped callee, heterogeneous literal) with their diagnostics.
- `bun scripts/bootstrap-conformance.ts --json` before/after; no PASS→FAIL, no new CRASH.
- R26: compile the two repros above plus `~/projects/lotto-analyzer/analyzer.scrml` (read-only) with `bun scripts/scrml-boot.ts compile`; emitted output for the lotto app unchanged except where it used a workaround; `node --check` the .js.
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
