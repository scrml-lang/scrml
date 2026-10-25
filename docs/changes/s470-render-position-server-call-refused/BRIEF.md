# Dispatch — change-id `s470-render-position-server-call-refused` (security, impl#1, HIGH)

impl#1 fixes are authorized for SECURITY (S435 policy). This one is RULED by bryan.

## The ruling (verbatim, scrml-support/user-voice-scrml.md S469 2026-10-24, item 1)
> **A server/async call in a render position** (`<span if=${allowed(@pw)}>` with an async `allowed`, `${match check(@pw) {…}}` in markup, a derived cell `const <ok> = check(@pw)`):
> "Refuse in impl#1 (Recommended)"
> impl#1 refuses this with a compile error under a new impl#1-provisional code. It fails closed now, under the "Refuse them in impl#1" precedent. The bootstrap gets the real async render path later. This closes the `g-markup-gate-tests-server-call-promise` class as one rule.

## The class (gap ids): `g-markup-gate-tests-server-call-promise` (HIGH) + `g-derived-cell-rhs-server-call-renders-promise` (the ruling now covers it)
A render position re-evaluates SYNCHRONOUSLY (an interpolation's effect, an `if=` / `show=` gate, a derived cell's recompute, §6.6.3), so a server call or an async-coloured helper there yields a Promise, which is truthy, and the gate opens: "LOGGED IN" with a wrong password. The security probe pack pins these as KNOWN_FAIL (find the pack with `grep -rln EXPECTED_SHAPE_COUNT compiler/tests`; the families are `f1/render: markup interpolation`, `f1/render: derived cell`, `f2/async helper, if= …`, `… bare if=`, `… derived cell`; there are 5 KNOWN_FAIL at main). After your change every one of them is a compile error, so it flips from KNOWN_FAIL to PASS (refused).

## What "render position" means
Every position that is re-evaluated by a synchronous reactive effect: markup `${…}` interpolation, `if=` / `show=` / any attribute value, `<each in=…>`, `<match on=…>` / a `${match …}` in markup, a derived cell's initializer (`const <x> = …`), an engine `derived=`. NOT a render position: an event-handler body, a `function` body, `<request>`, a `when … changes` body. Those are action positions and already await by construction.

Enumerate first. List every markup/derived emitter that lowers an expression into a synchronous effect (the open thread `markup-autoawait-all-emitters` says the last attempt found three and missed others). Record the enumeration in progress.md before writing the fix.

## The method
- ONE check, at ONE place, that asks the existing async colouring. `computeAsyncFnNames` and the S465–S469 waiting-function facts (`codegen/fn-valued-bindings.ts`, the server-callee map, imported async facts) already decide "this call waits". Reuse that predicate. Do NOT write a second "is this async?" classifier, and do NOT scan expression TEXT for call names (S469 round 2 shipped that bug: `q.includes(…)` coloured async because the file had `server function includes`). Read calls from the parsed expression tree.
- A call whose waiting-ness the existing facts cannot decide (unresolvable callee, a value the tree holds unparsed) → REFUSE (fail closed), with the same code.
- An existing E-VALUE-SERVER-CALL (§13.7) covers the value positions it covers. Find out whether the render positions are really outside it before minting anything. If E-VALUE-SERVER-CALL already names render positions in SPEC §13.7 / §13.8 (read those sections IN FULL via offset/limit and QUOTE the governing sentence in progress.md), use that code and say so.
- Otherwise use the provisional impl#1 code **`E-IMPL1-RENDER-WAITING-CALL`** (Error). Its message must say: the language allows a waiting value here only once the async render path exists (§13.8 / §13.9 pending cells), impl#1 cannot render it, and the fix today is to move the call into a handler or `function` that writes a cell, then render the cell. Add the §34 row labelled impl#1-provisional, and run s34-census. The code NAME is provisional; bryan may rename it.
- An engine `derived=match check(@pw)` is already refused (E-ERROR-002). Keep that as it is.

Runtime size ratchet: the browser runtime sits 1 byte under its ceiling. This is a compile-time refusal and should add ZERO runtime bytes. If anything you do grows `dist/scrml-runtime.js`, stop and report; raising the ceiling needs a ruling.

Out of scope (another agent's lane, running concurrently): `type-system.ts` `auditWholeErrorBinderText` and its allow-list. Do not edit it.

Direction-of-change: newly-rejecting. Measure with the R26 corpus recompile and report every newly-refused file. Real examples/samples that render a server call are expected; LIST them, do not rewrite them.
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
