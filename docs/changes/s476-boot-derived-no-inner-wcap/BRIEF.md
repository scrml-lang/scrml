# Lane s476-boot-derived-no-inner-wcap — a derived cell is not seeded by grants inside its type

change-id: `s476-boot-derived-no-inner-wcap` · agent: scrml-js-codegen-engineer · S476 (bryan, theRog)

## The bug (silent wrong output; conformance restoration — no ruling needed)
Governing sentence, SPEC §66.9 rule 3 (compiler/SPEC.md ~:52329): *"**Derived = locked + a reactive initializer.** A locked declaration whose initializer reads cells is **DERIVED**: it recomputes when a dependency changes (the §6.6.3 lazy-pull semantics) and cannot be written"*. No §66 sentence seeds a locked cell at its declaration; O60 (§66.22) seeds only "a LIVE initializer **at a use site**".

The bootstrap emits `rt.seeded` (computed once, never tracks its inputs) for a locked cell whose initializer reads cells whenever its TYPE reaches a grant — even when the grant is only inside an element or struct field and nothing writes the cell:
- `type Row:struct = { xs: int[replace] }` + `<rows:Row[]=(make(@n))/>` → `rt.seeded` (repro `~/.cache/scrml/s476-records/p2/a.scrml`; adopter saw `3 1` where `3 3` is right).
- `type P:struct = { n: int, let tag: string }` + `<pp:P=({ n: @k, tag: "t" })/>` → `rt.seeded` (repro `~/.cache/scrml/s476-records/p3/a.scrml`, PA-verified on f92d1a8fb).

Diagnosis from the S476 design pass (`/home/bmacs/scrmlMaster/scrml-support/docs/deep-dives/derived-cell-with-grants-2026-11-08.md` — READ IT, it has the probe set), PA-located-verify: `compiler/self-host-v2/print.scrml` `fieldCtor` (~:3142) picks `rt.seeded` whenever the field has a `wcap`, regardless of mode; `analyze.scrml` `fieldOf` builds `wcap` from the cell's own grants, from `subFieldEdits` over its struct fields, and from element struct fields (`subFieldEdits` lists every struct field whose grants admit `Replace`). The s473 state-children fix did the analogous thing for graphs.

## Scope — the shape-2 half ONLY
- A locked cell whose initializer reads cells, and whose OWN type carries no write grant (no grant tokens on its outermost tape, no per-position tuple lifecycle on the cell itself), is DERIVED: `rt.derived`, tracks its inputs. Grants on element types / struct fields are inert for it (a derived cell is never written). Add a Core invariant "Derived ⇒ no wcap" for this case.
- OUT OF SCOPE (owner questions Q1/Q2 pending): a locked cell with an OWN grant on its outermost tape (`<xs:int[write]=(@src…)/>`, `<xs:int[append]=([@k])/>`). Leave its current behaviour EXACTLY as it is; do not refuse it, do not change its emit. Also out of scope: the use-site case (Q3, a component attribute `rows:Row[]` given `(@src)`) — leave it.
- If you find that separating the two cases forces a decision the brief doesn't cover, STOP and report (⚑).

## Verification
1. Tests in `compiler/self-host-v2/slice-m4/derived-no-inner-wcap-s476.test.js`: red on base, green after — both repros (run time: after N bumps the derived value tracks), element-struct grant, struct `let` field, nested element tapes, the DD's "not triggered" shapes (stay derived), and a PIN that the own-grant shapes are UNCHANGED (still emit what they emit today). Run time checks, not just emit greps.
2. Measured direction-of-change: this is SEMANTICS-CHANGED (seeded → derived). Run the bootstrap emit sweep head vs base over the corpus (the S475 lanes used a parity sweep: "sweep head vs main N files, 0 newly refused/accepted/changed" — find the script under `scripts/` or `compiler/self-host-v2/`; if none, compile every `.scrml` under `samples/`, `examples/`, `conformance/cases/`, `compiler/self-host-v2/` acceptance fixtures with `bun scripts/scrml-boot.ts compile` on both and diff outputs). Report the file count and every file whose emit changed; each change must be a seeded→derived of the shape in scope.
3. `bun scripts/bootstrap-conformance.ts --json` before/after: no PASS→FAIL, no new CRASH. Write the two repros as conformance cases if the case format makes that straightforward (else list them as owed).
4. R26: `~/projects/lotto-analyzer/analyzer.scrml` (bryan's app, read-only; copy to `~/.cache/scrml/s476-boot-derived-no-inner-wcap/`) — compile on base and after; report which cells changed seeded→derived, and that the derived `Sim` now tracks. `node --check` the emitted .js. DO NOT mark DONE without this.
5. Gap: flip `g-boot-derived-cell-inner-grant-seeded-s476` (filed on branch `s476-records`, not yet on main — if it isn't on main when you finish, say so and the PA will flip it) — or leave a note for the PA.
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
