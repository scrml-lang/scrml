# progress — s470-await-residue (SECURITY, impl#1, S435 security exception)

Lane F. Closes the two residues #1554 left: `g-cell-init-reset-thunk-holds-promise-s470` and
`g-sync-action-body-fire-and-forget-ordering-s470`.

- 2026-10-25 start: worktree verified (base == origin/main 6081e0685), bun install, pretest done.
  Scratch: `~/.cache/scrml/s470/laneF/` (base tree = `git archive 6081e0685` in `base/`, probe
  shapes in `shapes/`, runner `bin/run.mjs` = the failable pack's `runShape`).

## Governing text (SPEC §13.8, quoted)

> **The rule.** A waiting value SHALL stand only in one of two places:
> - **(i) At a suspension point of an action position, where the compiler awaits it.** The action
>   positions are the ones §13.7 lists under "What is not affected": an event-handler value, a function
>   body (client or server), a lifecycle element body (`<request>`, `<effect>`, `<onMount>`), an engine
>   `effect=` / `<onTransition>`, and a body-top statement list. A suspension point is a place where the
>   compiler can end a statement, wait, and resume with what follows (§13.2 inserts the `await` there).
>   The S450 sole-root handler write (§13.2) MAY run fire-and-forget instead, because no statement of
>   that handler follows it.
>
> **Everywhere else a waiting value SHALL be a compile error.**
>
> **impl#1 limit (not a language rule).** Where a waiting value stands at a suspension point of an
> action position (i) but impl#1's emitter has no async host for that body, impl#1 refuses it with
> **E-IMPL1-ACTION-NOT-AWAITED** (§34) rather than emit it un-awaited.

"wait, and resume with what follows": the statements after a suspension point observe the settled value.

## Measured BEFORE (base 6081e0685)

### Gap 1 — reset thunk (`shapes/reset.mjs`)

The gap entry ("a `reset @v` stores a pending Promise in the cell") is FALSE as stated: the runtime's
`_scrml_reset_apply` (S368) detects a thenable and settles it detached, so the cell never holds the
Promise (`reset then gate`: PASS). The real hole is the SAME ordering defect as gap 2: `reset(@v)`
returns before the re-run initializer lands, so the next statement reads the previous value.

| shape | base |
|---|---|
| handler `reset(@v)` then a gate on `@v` | PASS (settled detached) |
| function body `@pw = p; reset(@v); if (@v) …` with a stale TRUE | **FAIL** |
| same, helper initializer | **FAIL** |
| `default=isOk(@pw)` then `reset(@v); if (@v)`, stale TRUE | **FAIL** |
| `when` body `reset(@v); if (@v)`, stale TRUE | **FAIL** |
| `<timer>` body `reset(@v); if (@v)` | PASS (a later tick re-reads) |
| `reset(@form)` (compound child initializer waits) then a gate | PASS |

### Gap 2 — ordering (`shapes/order.mjs`)

Seeds: S = `@pw` "secret" at boot (a re-run host reads a stale TRUE on the wrong click), W = `@pw`
"wrong" + `@ok`/`@tmp` true at boot (a boot-only host reads the stale TRUE). Bodies: `write`
(`@ok = isOk(@pw); if (@ok) …`), `helperwrite` (through an async client helper), `bare`
(`stash(@pw); if (@tmp) …`, `stash` writes `@tmp`). For a boot-only host the S seed's "LOGGED IN" is
the CORRECT answer (the password at boot is right), so only W is a defect there.

FAIL on base (W unless noted): `<request>` write / helperwrite / bare · `<timeout>` write / helperwrite
· module-init write / helperwrite / bare · `<onMount>` tag write / helperwrite · `<onTransition>` write /
helperwrite / bare · message arm write / helperwrite / bare · runtime `^{ }` bare · state-child
`effect=` write / helperwrite / bare (S: wrong→rejected right→rejected — the stale FALSE, the same
defect in the fail-closed direction). `on mount { }` write / helperwrite: stale (the block's sole-write
policy left the write detached; multi-line form measured). PASS on base: `<timer>` / `<poll>` (a later
tick re-reads, the defect is per tick), `when`, opener `effect=`, handlers / function bodies.

## Log

- Emission (async hosts): `colorAsyncActionBody` (js-async-analysis.ts) — the handler-root
  colouring every event handler gets (S450: only a SOLE root write keeps the detached lift), wrapped in
  the `on mount` async IIFE. Wired into `<timer>` / `<poll>` (emitLifecycleNode), `<timeout>`
  (emitTimeoutNode), state-child `effect=` / `<onTransition>` bodies (emitHookArm; the facts object is
  built before the hook stage and passed explicitly, then installed as the active client emission).
  `on mount { }` now colours with the same handler-root policy.
- Walk (render-waiting-calls.ts, #1554's one walk — no new reader): an ORDER rule for the bodies
  that stay synchronous. A site = a whole cell WRITE `@c = f(…)` the lift accepts (not a cell
  declaration: a declaration's initializer is a value position / load), a bare WAITING call, recorded
  in the body's `OrderScope`. Each later statement of the same body is checked with `observes` (any
  call / `new` / `reset` / `?{}` / unparsed text; the written cell — any cell, for a bare call); a hit
  refuses the site (E-IMPL1-ACTION-NOT-AWAITED, ordering message, `order: true` on the site). An `if`'s
  branches are alternatives; a site inside a loop is followed by the next iteration. Scopes: ONE
  module-init order for the whole file (every non-rendering `${ }` statement, an `<onMount>` tag, a
  runtime `^{ }`; a `<request>` body's statements / a `<poll>`'s immediate tick / the opener
  `effect=` / an `on mount` block are checked as FOLLOWERS of it, since they run during init); a
  `<request>` body and each message arm have their own; render contexts (they re-run reactively) and
  the async-hosted bodies have none. A §36 SSE generator write (a subscription) is not a site.
- Reset (gap 1, measured: not a held Promise — the runtime settles it — but the same ordering hole):
  a `reset(@c)` whose target's reset value waits (`default=` if present, else the initializer; a
  compound's waiting child; path targets) is refused everywhere except the SOLE statement of an
  event-handler value (S450). One deep walk of the file AST (function bodies and handlers included)
  plus the engine / `when` / opener bodies parsed from text; text without a tree is read only to refuse.
- No runtime change (the owner's S470 ratchet allowance was not needed: shell-runtime size unchanged).

## Measured AFTER (head b2deb2c39; same probes, same runner)

- `shapes/order.mjs`: every base FAIL is now PASS-REFUSED (module init, `<request>`, `<onMount>`
  tag, message arm, runtime `^{ }`) or awaited in place — `<timeout>` / `on mount` W: PASS-DENY
  (boot-only, correct "rejected"), state-child `effect=` / `<onTransition>` S and W: PASS (wrong →
  rejected, right → LOGGED IN). No FAIL except the boot-only S rows whose "LOGGED IN" is the correct
  boot answer (the page starts on the right password).
- `shapes/reset.mjs`: every base FAIL → PASS-REFUSED; the sole-statement handler `reset` control
  stays PASS. (`onclick=reset(@v)` call-ref form: PASS-DENY on base AND head — it emits
  `reset(<value>)`, a ReferenceError; pre-existing, candidate gap below.)
- #1554's lift-proof (60 shapes, the kept whole-write exemption × 12 hosts × 5 forms): 0 FAIL on head;
  5 changes, all PASS / PASS-DENY → PASS-REFUSED for a write inside a one-iteration `for` in a
  synchronous body (the loop rule; LOW over-refusal).
- Pack family **f15** (fullstack, 23): base 6081e0685 **19/19 FAIL**, 4 VALID PASS; head 0 FAIL
  (13 PASS-REFUSED, 4 PASS awaited, 2 PASS-DENY boot-only awaited, 4 VALID PASS), pinned.
  EXPECTED_SHAPE_COUNT 2265 → 2288, README. Full integration + conformance run (incl. both packs):
  11975 pass / 0 fail.

## R26 — 3618 files (examples, samples, stdlib, benchmarks, conformance/, docs/, compiler/samples)

Base = `git archive 6081e0685` (compiler + stdlib + scrml.toml), head = this worktree; corpus files =
this worktree for both. One in-process compile per file.
- newly rejected: **1** — `docs/changes/s441-cell-assign-server-call-awaited/repro/other-contexts.scrml`
  (`<init> : number = double(3)` … `function resetThen() { reset(@init); @seen = "reset:" + @init }`):
  exactly the defect (the read after the reset sees the pre-reset value). Justified.
- already-failing files gaining a code: 0. Newly clean: 0 outside stdlib.
- stdlib diffs in the whole-corpus run are the known harness artefact (a worktree stdlib file compiled
  by the base compiler is outside its tree). Re-run of `stdlib/` with each compiler over its OWN copy:
  54 files, **0 diffs**.
- Found and fixed on the way (an earlier head): an `@a = gen()` §36 SSE subscription followed by
  another write was refused (GITI-025 unit test) → generator writes are not sites; two independent
  `<request>` loads (benchmarks/per-route-roles admin / dispatch) were refused → a `<request>` body is
  its own order and its settle-machine load is not a module-init site; statements inside a rendering
  `for … lift` (samples/file-manager-r11, gauntlet-r11-task-dashboard) were read as module-init
  followers → render contexts carry no order.

## Gates (final tree, after merging origin/main d582ae04f)

pre-commit (unit + integration + conformance, sharded): 46652 pass / 0 fail. CI job commands
(.github/workflows/ci.yml, run locally): types-gate OK (181, unchanged) · root tests · snippet-gate ·
claim-gate · corpus-compile-floor --check · gen-md-shim --check · conflict-marker · regen-spec-index
--check · delta-lint · ci-shards needs · s34-census --check-new (base origin/main: 1 changed row,
well-formed, PASS) · bootstrap-conformance · bootstrap-severity · lsp + commands · todomvc compile +
`node --check` · browser-baseline --check · lint-no-default-arm · slices m1 / m2 / m1-lowered / m3 /
m4 / codec · e2e-render-map · host-global-scan --check: all exit 0. facts --check STALE (WARN-only,
bot-owned; not regenerated per policy).

## Candidate gaps (for the PA — not edited into known-gaps.md)

- RESOLVES `g-sync-action-body-fire-and-forget-ordering-s470` and `g-cell-init-reset-thunk-holds-promise-s470`
  (the latter's premise corrected: the cell never holds the Promise; the hole was ordering).
- `g-impl1-onmount-one-line-statement-dropped-s470` (MED, pre-existing, silent): `${ on mount { @ok =
  isOk(@pw); if (@ok) { … } else { … } } }` on ONE line drops the `if` from the emitted block (base and
  head); the multi-line form keeps it.
- `g-impl1-callref-reset-handler-unbound-s470` (LOW, pre-existing, throws): `onclick=reset(@v)` (the
  call-ref form) emits `reset(_scrml_reactive_get("v"))` — `reset` is not defined at run time; the
  `${ reset(@v) }` form works.
- `g-reset-settle-no-stale-guard-s470` (MED, not measured): `_scrml_reset_apply` settles a waiting
  reset detached with no sequence guard — a write to the cell after the reset (or a second reset) can
  be overwritten by the late settle. Sibling of `g-when-changes-stale-response-s470`; the accepted
  sole-handler reset is exposed.
- `g-async-action-body-stale-response-s470` (MED, not measured): the newly async `<timer>` / `<poll>`
  ticks, `effect=` / `<onTransition>` bodies have no latest-wins guard either (an earlier tick's slow
  response lands after a later one's).
- `g-cross-body-detached-ordering-s470` (LOW): ordering is enforced WITHIN a body; across bodies it is
  not — a message arm's (accepted, last-statement) write lands after the transition's hooks ran; an
  async-hosted `<onTransition>` body no longer blocks the transition, so a sibling hook of the same
  transition reads the pre-call value.
- `g-request-body-trailing-statements-run-once-s470` (MED, pre-existing semantics): a `<request>`
  body's statements after its first whole write run ONCE at module init, not per load; now refused
  when they observe the load, still run once otherwise.
- `g-impl1-async-host-bodies-still-refuse-s470` (LOW, over-refusal): the `<timer>` / `<poll>` /
  `<timeout>` / `effect=` / `<onTransition>` bodies now await every async call in place, but #1554's
  walk still refuses every waiting shape there except the two it accepted (e.g. `if (isOk(@pw))` in a
  tick). Widening needs those bodies read like `asyncHost` (the accounting invariant).
- Over-refusals recorded (LOW, fail closed): a `reset` of a waiting cell as the LAST statement of a
  function body; a site in a one-iteration loop; a bare waiting call followed by any cell mention;
  `@a = loadA(); @b = loadB()` at module init (the second write is a call).

## Fix round 1 (review of 817aadc0e, verdict FIX) — 2026-10-25

Reviewer material (read-only): `~/.cache/scrml/review/s470-lf/`. Measurement tree for "before":
`git archive 817aadc0e` in `~/.cache/scrml/s470/laneF/h817/`.

| # | sev | status | evidence |
|---|---|---|---|
| F1 | HIGH | FIXED | `observes()` matched only the written cell's name. A mention of a DERIVED cell (`const <d>`, or a derived engine) now observes when its closure in the compiler's dependency graph reaches the cell — index.ts walks Stage 7's DG (`safeDepGraph`: a derived node's `reads` / `calls` / `awaits` / `engine-derived-reads` edges, through function nodes) and hands `derivedReach` to the walk; a derived name with no DG node reaches everything (fail closed). Shapes: module init, derived of derived, derived through a helper, a ternary, a `<request>` body (incl. its first-write load), a message arm, an `<onMount>` tag — FAIL on 817aadc0e, PASS-REFUSED now. |
| F2 | HIGH | FIXED | the waiting-reset cells now include writes in the statement lists impl#1 parses from text and lowers registering `_scrml_init_set`: an engine opener `effect=` (emit-engine `emitEngineOpenerEffect` keeps `insideFunctionBody` false) and, fail closed, a `when` body — the same cached `readEngineBody` parses the walk judges. Reviewer reset-opener: 2 FAIL → PASS-REFUSED. |
| F3 | MED | FIXED | the opener `effect=` and a `<poll>`'s immediate first tick are emitted after every module-init statement: both are now LATE followers, checked against the whole module-init order at the end of the walk (`finishModuleOrder`). The other "written before the write" reviewer shapes (`<onMount>` tag, `on mount`, `<request>`, `^{ }` before the write) read the DECLARED value before any write in emission order too (verified in the emitted JS: the read precedes the write) — not ordering defects; still FAIL in the reviewer's harness by its stale-TRUE seed, not in the pack. |
| F4 | MED | FIXED | the sites still pending at a message arm's end are followed by the engine's `effect=` / `<onTransition>` bodies and guards (the transition fires them): refused when one observes. |
| F5 | MED | FIXED | latest wins for the async engine hook hosts: each async hook arm gets a module-scope run counter (`let __scrml_engine_…_fire_hooks_run_N = 0`), the run takes `++counter`, and EVERY resume point is `_scrml_live(await …)` — a synchronous check at the resume, throwing a run-local sentinel caught at the run's end (no runtime change). A guarded host awaits a sole write too (so it is covered). emit-client's reactive-set lift recognises `_scrml_live(await stub(…))` and keeps the guard in its `!{}` in-place relocation (before, the guarded write stored the error envelope in the cell for a moment). `<timer>` / `<poll>` / `<timeout>` are not guarded (each tick re-reads; a slow tick must not starve the next). Race (`bin/race.mjs`, clicks right(slow 60ms), idle, wrong): base "rejected", 817aadc0e "LOGGED IN", head "rejected" for `<onTransition>`, `effect=`, a guarded write, a sole write; right alone still logs in. `compiler/tests/integration/await-residue-race-s470.test.js`: 4 FAIL on 817aadc0e, 8/8 pass on head. |
| F9 | LOW | FIXED (message only) | the ordering message recommends `<request>` (and a handler), no longer `on mount { }`. |

- Pack: family renamed `f15` → **`f23`** (lane family r17; lane D's r9 `f15`, #1558) and +9 shapes (F1 ×5,
  F2 ×2, F3, F4): **9/9 FAIL on 817aadc0e** (and on 6081e0685), PASS-REFUSED on head; f23 total 32
  (28 FAIL on 6081e0685, 4 VALID PASS). EXPECTED_SHAPE_COUNT 2288 → 2297 before the merge.
- Reviewer probe sets on head: esc 0 FAIL except the 4 declared-value shapes (F3 row), esc2 0,
  reset-opener 0, reset-opener2 0, host 0, reset 0 (identical classes to the reviewer's head run),
  med: only its boot-correct "right seed" shape; my order / reset / lift-proof: no change except the
  boot-only S rows (correct boot answer).
- Test changed: `cell-assign-server-call-awaited.test.js` s441 F7 resets an opener-written cell from
  `function doReset() { reset(@m) }` — now refused (F2 + the function-body rule, recorded over-refusal);
  the test resets from the sole handler statement `onclick=${ reset(@m) }`, which keeps its intent
  (the async reset thunk resolves).
- R26 (3618): vs 817aadc0e **0 diffs**; vs base the same single justified file
  (other-contexts.scrml); stdlib own-copy 0 diffs.
- SPEC §34 row: the derived closure, the late followers, the arm → hooks order, latest wins, the
  opener / `when` reset registration. s34-census --check-new PASS.
- No runtime change (ratchet untouched).
