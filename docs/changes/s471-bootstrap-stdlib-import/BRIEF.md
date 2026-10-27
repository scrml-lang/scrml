# Dispatch — change-id `s471-bootstrap-stdlib-import` (bootstrap / impl#2, `compiler/self-host-v2/`)

This is bootstrap work: the native compiler written in scrml, in `compiler/self-host-v2/`. It is the operator's priority now. The operator wants to try the bootstrap on real programs, and the first wall is the stdlib.

## The symptom (PA-verified by execution on main `a8bac7248`, 2026-10-27)
```scrml
<program>
${ import { slug } from "scrml:format"; }
let <title:string="Hello World"/>
<p>${slug(@title)}</p>
</program>
```
`bun scripts/scrml-boot.ts compile <file> --format line` gives `4:6: error [E-SCOPE-001]: \`slug\` is not declared`. The `scrml:` import is dropped without a diagnostic, and the use fails as an undeclared name. This is the worst outcome: a misleading error rather than a named refusal. The same program importing `./lib.scrml` (`export fn helper() -> string`) compiles and runs, so local scrml-module imports already work. Only `scrml:*` stdlib specifiers are missing.

## The goal
A program compiled with `scrml-boot` can `import { … } from "scrml:<module>"`, and the imported names work on the client and the server. Resolve the stdlib the way the bootstrap already resolves a local `.scrml` module, so that every `stdlib/<module>/` whose source the bootstrap can compile becomes importable by construction. Do this rather than writing one special case per module. Spec: SPEC §41 (Import System — read the `scrml:` capability/value-import rules IN FULL; `grep -n '^## 41\|^### 41' compiler/SPEC.md`), §21 (Module and Import System), §41.17 (the `scrml:compiler` family, which is deferred and stays refused).

Work it in this order and report per step:
1. **Fail closed first.** An import the bootstrap cannot resolve must be a NAMED refusal at the import (E-BOOTSTRAP-UNSUPPORTED naming the module, or the SPEC's unknown-module code if one exists). It must never be a silent drop. Land this as its own commit; it is valuable even if nothing else lands.
2. **Survey.** For each `stdlib/<module>/`, record in progress.md whether it is pure scrml, uses host shims (`compiler/runtime/stdlib/<name>.js`, `_{}` / `import:host` / `^{}`), or server-only (`Bun.*`, SQL). Note what the bootstrap would need to compile it. This is a table, not an essay.
3. **Build the resolution:** `scrml:<name>` → the stdlib module's source, compiled through the bootstrap's existing module path. Start with the pure-scrml modules (`format`, `math`, `data`, `regex`, `time` are likely candidates, but verify). Modules that need host shims or server-only reach come after, using whatever mechanism the bootstrap already has for host code. If none exists, refuse those modules by name and report what is missing. Do not invent a new host bridge without stopping to report first.
4. **Prove it end to end:** add acceptance cases that compile AND run (`acceptance/`, mirror the existing layout), at least one program per supported module that calls an imported function and checks its output.
5. Re-run `bun scripts/bootstrap-conformance.ts --write` and report the PASS / UNSUPPORTED movement. Write the regenerated `docs/bootstrap-conformance.md` in your branch.

## Authoring scrml — anti-pattern briefing (MANDATORY)
You will write scrml source. Read BOTH before any code, and re-read before each feature: `/home/bmacs/scrmlMaster/scrml-support/docs/gauntlets/BRIEFING-ANTI-PATTERNS.md` and `docs/articles/llm-kickstarter-v2-2026-05-04.md`. Also read `compiler/self-host-v2/progress.md` (the bootstrap's own conventions log) and match the surrounding code's idiom exactly. The bootstrap speaks the RULED language (§66, `;` termination, explicit tape grants). Note "tape", not array.

Out of scope (other lanes running concurrently): impl#1 compiler source under `compiler/src/` (two security lanes), `compiler/SPEC.md` / `compiler/SPEC-INDEX.md` (if your work needs a SPEC sentence, put the proposed text in progress.md for the PA). Do not edit stdlib module SOURCE semantics. If a stdlib module must change to compile on the bootstrap, stop and report the minimal change.

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
Read `.claude/maps/primary.map.md` first and follow its Task-Shape Routing (the bootstrap / self-host-v2 maps). Map stamp: commit `3d17013f8` (2026-10-26). HEAD is `a8bac7248`, 15 commits past the map; no post-map landing touches `compiler/self-host-v2/`. Treat map content as a hypothesis and verify it against source. Report whether the map was load-bearing.

## Method — CONSTRAIN TO THE PROVEN PATH
Reuse the bootstrap's existing module resolution and compile path. A `scrml:` module is just another scrml module with a fixed location. Do not write a regex over source text in a post-parse stage. Where the existing path cannot decide, refuse by name (fail closed). Never fail open.

## Gates before reporting DONE (the hook is not CI)
- `bun test compiler/tests/{unit,integration,conformance} --bail` (the pre-commit gate)
- The CI `slices` job, exactly: `bun scripts/lint-no-default-arm.js && bun test ./compiler/self-host-v2/slice-m1/ && bun test ./compiler/self-host-v2/slice-m2/ && SLICE_CORE=lowered bun test ./compiler/self-host-v2/slice-m1/ && bun test ./compiler/self-host-v2/slice-m3/ && bun test ./compiler/self-host-v2/slice-m4/ && bun test ./compiler/self-host-v2/slice-codec/`, plus the acceptance tests.
- `bun run types:check` (a BLOCKING CI step)
- `bun scripts/bootstrap-conformance.ts --write` (the before/after numbers)
- Do NOT edit `docs/known-gaps.md` or `docs/FACTS.md`. Put gap updates and new gaps (id, sev, locus, symptom) in progress.md.

## Final report (tiny)
WORKTREE_PATH · branch · FINAL_SHA · files touched · per-step outcome · stdlib survey table (module → importable / refused + why) · gates (pass/fail counts) · bootstrap-conformance before/after · open questions · map load-bearing?
