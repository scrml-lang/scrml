# Lane s476-boot-page — the bootstrap supports `<page>` (§40)

change-id: `s476-boot-page` · agent: scrml-js-codegen-engineer · S476 (bryan, theRog)

## Goal
The bootstrap compiler (`compiler/self-host-v2/`) refuses every `<page>` element by name (E-BOOTSTRAP-UNSUPPORTED, "`<page>` is a scrml structural element (§40) … not in the bootstrap"). Build `<page>` inside `<program>` per SPEC §40 so the 25 `<page>`-root conformance cases (program-wrapped twins since s475-twin-page-wrap, RULED S475 "A twin case whose root is `<page>` is program-wrapped") stop grading UNSUPPORTED on the `<page>` refusal.

Gap: `g-bootstrap-page-element-unsupported-s475` (MED) in `docs/known-gaps.md` — read the entry; it lists the 25 cases, the 11 that name only `<page>`, and the other refusals the remaining 14 also hit (`renders` on an enum variant §19.2, `?.` §42.3.6, a value-used block arm, an untyped index read). Those other refusals are OUT of scope unless trivially adjacent; list which ones each case still hits after your change.

## Locus (PA-located-verify)
`compiler/self-host-v2/analyze.scrml` — `structuralOwner` (`"page" :> "§40"`) is where the refusal is named. The work is likely across parse/analyze/core/print (routing, per-page output, the `default-logic` body mode §40.8, documentary attrs). Survey first.

## Read first (normative)
- SPEC §40 in full (grep `^## 40\.` in `compiler/SPEC.md`, then read with offset/limit), especially §40.8 program shape / `default-logic` body mode, the `<page>` rows, auth= interplay (§40.1 / `<program auth=>`), routing.
- §4.15 registry row for `<page>`, §20 navigation (route params), §12 route inference as needed.
- How impl#1 (`compiler/src/`) models `<page>` is a reference for BEHAVIOUR only (read-only — do not edit impl#1). SPEC wins where they differ.

## Scope rule
Build the smallest COMPLETE slice that SPEC defines for a `<page>` inside `<program>`: multiple pages, each a route, with the page body in its §40.8 mode, emitted so the program serves each page. If a piece of §40 (e.g. per-page auth, route params) cannot be finished in this lane, refuse that piece by name (INTERIM, capable form named) — never silently drop it. If SPEC is silent on a shape you need, record it as an owner question (⚑) and refuse it; do not invent semantics.

## Verification
1. Tests in `compiler/self-host-v2/slice-m4/` (new file `page-s476.test.js`): red on base, green after. Cover: single page, two pages with different routes, page body declarations, a page body that the SPEC rejects (bare prose → its SPEC code), `<page>` outside `<program>` (SPEC code).
2. `bun scripts/bootstrap-conformance.ts --json` before and after: report PASS/FAIL/CRASH/UNSUPPORTED deltas and, per the 25 cases, what each now grades. Zero new CRASH. Zero PASS→FAIL.
3. R26: compile a real multi-page program end to end with `bun scripts/scrml-boot.ts compile <file> -o <out>` and serve/inspect it (pick from `examples/` or `samples/` something using `<page>`; also build one under `~/.cache/scrml/s476-boot-page/`). Run `node --check` on every emitted .js. DO NOT mark DONE without this empirical pass.
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
