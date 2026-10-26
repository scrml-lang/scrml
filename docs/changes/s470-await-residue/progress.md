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
| F5 | MED | FIXED | latest wins for the async engine hook hosts: each async hook arm gets a module-scope run counter (`let __scrml_engine_…_fire_hooks_run_N = 0`), the run takes `++counter`, and EVERY resume point is `_scrml_hook_live(await …)` — a synchronous check at the resume, throwing a run-local sentinel caught at the run's end (no runtime change). A guarded host awaits a sole write too (so it is covered). emit-client's reactive-set lift recognises `_scrml_hook_live(await stub(…))` and keeps the guard in its `!{}` in-place relocation (before, the guarded write stored the error envelope in the cell for a moment). `<timer>` / `<poll>` / `<timeout>` are not guarded (each tick re-reads; a slow tick must not starve the next). Race (`bin/race.mjs`, clicks right(slow 60ms), idle, wrong): base "rejected", 817aadc0e "LOGGED IN", head "rejected" for `<onTransition>`, `effect=`, a guarded write, a sole write; right alone still logs in. `compiler/tests/integration/await-residue-race-s470.test.js`: 4 FAIL on 817aadc0e, 8/8 pass on head. |
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
- Merged origin/main 646378d6f (incl. #1558 s470-async-colouring-scope: r9-shapes.js s12 / f15 / l7 /
  t7, +415). Both families kept; EXPECTED_SHAPE_COUNT = 2712 (the pack's own count test passes on the
  merged tree: 2680 + f23's 32). Pre-commit on the merge: 47132 pass / 0 fail (full pack included).
- R26 after the merge (merged head vs an extracted origin/main 646378d6f): the same single justified
  file (other-contexts.scrml); the rest are the stdlib harness artefact.
- CI job commands on the merged tree: all exit 0 except facts --check (STALE, WARN-only, bot-owned) and
  one lsp/commands run (`dev-watches-copied-client-helper` hit its 20s timeout under machine load;
  re-run alone and the whole lsp + commands set: 774 / 0).
- Merged origin/main again (d6e734814: lane E #1560 when-changes latest-wins — its when gate is named `_scrml_live`, so this lane's hook guard is renamed `_scrml_hook_live`; then 05422ddc7: #1563). EXPECTED_SHAPE_COUNT = 3053 (main 3021 + f23 32; the count test passes). Pre-commit on the final merge: 47610 / 0. R26 vs an extracted d6e734814: the same single justified file. CI job commands on the final tree: all exit 0 except facts --check (STALE, WARN-only).

## Fix round 2 (re-review of 4ae8261f7, verdict FIX) — 2026-10-25

Reviewer material (read-only): `~/.cache/scrml/review/s470-lf2/fx/`. "Before" tree: `git archive 4ae8261f7`
in `~/.cache/scrml/s470/laneF/h4ae/`.

| # | sev | status | evidence |
|---|---|---|---|
| F13 | HIGH (regression) | FIXED (refused) | In the bodies this lane awaits in place (`<timer>` / `<poll>` / `<timeout>`, state-child `effect=`, `<onTransition>`, `on mount { }`), `@ok = check(@pw) !{ …block arms… }` goes through the in-place `!{ }` relocation, where a fall-through arm leaves the error envelope (truthy) as the value written into the cell — `g-handled-error-arm-failure-writes-envelope-into-cell` (open; a handler function body has it on base). `handledFallThrough` refuses such a write there (an arm whose handler is a block / empty), E-IMPL1-ACTION-NOT-AWAITED with an envelope message naming the gap; value arms (`:> false`) stay accepted. Reviewer bang / bang2: every 4ae8261f7 FAIL in those hosts → PASS-REFUSED; "onTransition no-fallthrough return arms" stays PASS; "handler fn body exhaustive" is the base gap, unchanged (not this lane). The sole-write `onTransition bang … derived gate` shape (PASS on base and 4ae8261f7) is now refused too — fail closed: its failure path writes the envelope into the cell. |
| F14 | HIGH | FIXED (refused) | a message arm returns its next state at once, so every un-waited site in it (a lifted write, a bare waiting call) is refused immediately (`OrderScope.refuseAll`), whatever follows — the reviewer's f4 rows (a `when @phase changes`, a chained engine's hook, the sending handler, a conditional target, a render): 5/5 PASS-REFUSED. **Corpus impact: none** (R26 head vs pre-change head: 0 diffs). |
| F18 | MED (over-refusal) | FIXED | a cell's reset value waits only when the write that REGISTERS it waits (emit-logic `_emitInitThunkSidecar`): a declaration's `default=` / initializer; for an undeclared cell, its writes outside a function body (module init, lifecycle bodies, opener `effect=`, `when` — fail closed if any of them waits). `function refresh() { @items = load(@pw) }` + `function clear() { reset(@items) }` with `<items> = []` compiles again (ov-clear / ov-clear2). The message names what is re-run: "the initializer of `@x`", "the `default=` of `@x`", or "the write `@x = …` that registers the reset value of the undeclared cell `@x`". The s441 F7 test stays changed: its `@m` is UNDECLARED and registered by the opener's waiting write, so a function-body reset of it is still a waiting reset. |
| engines ×2 | — | CHECKED | an engine cannot be instantiated twice: inside a component body it is E-COMPONENT-ENGINE-SCOPE (§51.0.K, "Engines are singletons"; measured), so the per-arm module-scope run counter is per instance. |

- Pack f23 +10 (F13 ×5 — FAIL on 4ae8261f7, PASS / PASS-DENY on 6081e0685; F14 ×3 — FAIL on 4ae8261f7;
  2 VALID F18 — PASS on 6081e0685, PASS-REFUSED on 4ae8261f7, PASS now), pinned; f23 = 42; count 3063.
- Unit: await-residue-fr1-s470 +16 (F13 refused / accepted × 4 hosts, F14 ×3, F18 ×5); the round-0 / 1
  arm-ACCEPTED tests moved to REFUSED (F14); the reset-message regex covers the new wording.
- Pre-commit (code commit 8e18fdcda): 47626 / 0.
- Merged origin/main 55de8639c (docs-only: #1564 / #1565). EXPECTED_SHAPE_COUNT 3063 (count test passes). R26 vs an extracted origin/main 55de8639c: the same single justified file (other-contexts.scrml); the rest the stdlib harness artefact. CI job commands on the final tree: all exit 0 except facts --check (STALE, WARN-only, bot-owned).
- Merged origin/main again (ffbcf4432: #1566 s470-render-residue-host-promises — conflicts in RenderWaitingFacts / index.ts resolved by keeping both additions: `derivedReach` and the host-promise names; its f25 / r19 families kept). EXPECTED_SHAPE_COUNT = 3094 + f23 42 = 3136 (count test passes). Pre-commit on the merge: 47755 / 0. R26 vs an extracted origin/main ffbcf4432: the same single justified file. CI job commands on the final tree: all exit 0 except facts --check (STALE, WARN-only).

## Fix round 3 (re-review of 4abccb31d, verdict FIX — F13 through a helper) — STOPPED at step 1 (SPEC check)

The PA's decision was to fix the root gap `g-handled-error-arm-failure-writes-envelope-into-cell` in this lane:
if SPEC says a cell write of a handled call whose arm yields no value leaves the target unwritten, implement that;
if SPEC is silent or says otherwise, stop and report. SPEC §19.4.3 says otherwise: it makes that shape a COMPILE
ERROR, not a no-write.

SPEC §19.4.3 (quoted):

> **Handling in a value position — every arm yields a value or leaves (S451 ruling 1a).** A `!{}` handler or a
> `match` on a failable result is in a **value position** when its result is used: the initializer of a `let` /
> `const` / `lin` or state declaration (`let r = f() !{ … }`, `<x> = f() !{ … }`), the right-hand side of an
> assignment (`@x = f() !{ … }`, `x = f() !{ … }`), …
>
> In a value position, every arm SHALL do one of two things:
> 1. **Yield a value** of the call's success type: the arm is an expression, or a block that … yields it with
>    `lift <value>;` (§18.5). …
> 2. **Leave**: the arm ends in `return` or `fail` on every path through it …
>
> An arm that does neither — it ends in a write (`@phase = .Missing`), a declaration, a call whose result is not a
> value of the success type (`log(m)`), or a block … with no `lift` … — **falls through**, and in a value position
> that SHALL be a compile error: **E-ERROR-012** …
>
> In a statement position an arm MAY fall through: the handler's result is not read …

§19.4.4 restates it: "A `!{}` handler or a `match` on a failable result in a value position (§19.4.3) SHALL have
every arm either yield a value of the call's success type or leave … An arm that falls through there SHALL be a
compile error (**E-ERROR-012**)." The section notes that E-ERROR-012 is **"Nominal / not yet emitted by impl#1
(frozen; `g-impl1-value-position-arm-fallthrough-s451`)"**, and gives the corpus measured at S451: 19 value-position
handlers with fall-through arms in 13 files, all under `conformance/cases/`.

So `@x = f() !{ | e :> { … } }` with a no-value arm is not a program whose failure leaves `@x` unchanged. It is
E-ERROR-012. "Run the arm and don't write the target" would make impl#1 accept a program the language refuses,
which would be a new divergence. Not built; no code was changed in this round.

## Fix round 3, part 2 — E-ERROR-012 emitted (ruling S470 "Emit E-ERROR-012 (Recommended)", user-voice e2e4c7a)

- Built under the S435 security exception. Governing text: SPEC §19.4.3 / §19.4.4, quoted in the part-1 section above.
- **`!{ }` half.** `compiler/src/codegen/emit-logic.ts`, the guarded-expr lowering, where `guardValueUsed` already
  decides the value position (a binding, a cell write, a `return` / `yield`, an assignment, an expression-position
  guard). Every side shares it (client, server, library, tool), and every host lowers through it (handler, function
  body, helper, engine hooks, `<timer>`, the opener, `when`). Each arm is judged by `arm-structure.ts`
  `valueArmFallsThrough`, with impl#1's one arm reading (`armBlockStatementsDetailed`, `_blockTailIsValueExpr`; the
  same predicates the value lowering uses):
  - an expression arm yields; a write, a declaration or an empty arm falls through;
  - a block yields when its tail is an expression, a `lift`, or a handled call;
  - a block (or a `fail` arm) leaves when its tail is `return` / `fail` / `break` / `continue`, or an `if` / `else`
    whose branches all leave;
  - a block the reader cannot read stays `refuseUnreadableValueArm`'s.
  - Limit: impl#1 does not type an arm's value, so a `log(m)` tail is taken as a value. SPEC also counts that as
    falling through ("a call whose result is not a value of the success type"). Recorded, not judged here.
- **`match` half.** `arm-structure.ts` `failableMatchFallThroughs` covers a `match` stamped `__matchSubjectFailable`
  that is a declaration's value or sits inside an expression. Its inline arms (`result`) and block arms (`body`) are
  judged by the same rule. A `match` statement is a statement position.
- **F13 syntactic refusal removed.** `render-waiting-calls.ts` `handledFallThrough`, its `envelope` site flag and
  the index.ts message are gone, and the SPEC §34 E-IMPL1 row sentence about it is removed. E-ERROR-012 covers every
  shape it refused. Value-tail block arms it over-refused now compile and are correct by execution
  (`shapes/e12.mjs`: value tail, `return` tail in a helper, value arms × handler / onTransition / timer / helper).
  No part of it was kept.
- **Conformance migrated (8 cases).** Each case still tests what it tested.
  - The binding is unused, so it was dropped (statement position): `error/fail-bare-variant-reaches-handler`,
    `error/fail-imported-builtin-name-enum-ok`, `error/propagate-reaches-handler`,
    `control-flow/s437-braceless-else-in-failable-arm`, and `error/failable-handler-lift{,-success,-timeout}`
    (`handleMissing` / `handleSlow`).
  - The binding / cell is read after, so each arm now leaves with `return`: `error/failable-handler-lift*`
    `handleOk`, `error/propagate-success-unwrap`, `parse-variant/happy-{payload,unit}-variant` (`@result =
    parseVariant(…) !{ …@parseError writes… }`).
  - No `expected.json` changed. Every assertion is on the success path, or on the arm's writes, which still run.
  - The SPEC's other three listed cases (`handler-exhaustive-neg`, `handler-wildcard-escape`,
    `handler-non-exhaustive`) emit no E-ERROR-012 on today's text.
- **Probes on head (all shapes refused at compile time).**
  - Reviewer's atk.mjs: 19/19 PASS-REFUSED, E-ERROR-012 on every F13 row. Its "value arm … (control)" rows are
    refused only because the shared header declares the fall-through helper `chk`.
  - hh.mjs: 1/1 refused. bang.mjs: 6/6. bang2.mjs: 6/7, with the no-fall-through control staying PASS.
  - The twins that fail on main are refused: handler fn bang, handler-calls-helper, opener bang.
- **Pack f23 +5 (E12, pinned).**
  - On 4abccb31d: 5/5 FAIL.
  - On main ffbcf4432: the handler / handler-calls-helper / opener shapes FAIL; the helper-in-onTransition / timer
    shapes are PASS-DENY / PASS.
  - Head: 5/5 PASS-REFUSED (E-ERROR-012). f23 = 47; count 3501.
- **R26 with digests (3618 files).** Head against an extracted HEAD-before-change (7007745a1); every emitted
  artifact hashed, path-normalized.
  - newly rejected: **0**. No file outside `conformance/cases/` is newly refused, and the migrated cases compile
    clean.
  - Two already-refused files gain E-ERROR-012:
    - `samples/compilation-tests/error-004-in-logic.scrml`: a `!{}` after `let data = not`. SPEC calls this
      E-ERROR-013's shape, which is not emitted.
    - `samples/login.scrml`: the legacy `| AuthError e -> {…}` arm parses to a garbage handler.
  - Emitted output changed for no compiling file: 3561 identical. The one digest difference
    (`conformance/cases/components/missing-required-slot-reject`, refused) is nondeterministic on both compilers:
    two runs of each gave four different digests.
  - stdlib (own copy): 0 diffs.
- **SPEC.**
  - §19.4.3's provenance and both E-ERROR-012 rows (the §19 table and §34): "Nominal / not yet emitted by impl#1"
    is replaced by the emitted note (the emission sites, the arm rule and its `log(m)` limit, the migration).
  - The §34 E-IMPL1 row loses the F13 sentence.
  - SPEC-INDEX regenerated; s34-census PASS (3 changed rows, well-formed).
- **Candidate gap resolutions (PA files them).** `g-handled-error-arm-failure-writes-envelope-into-cell` and
  `g-impl1-value-position-arm-fallthrough-s451` → RESOLVED by E-ERROR-012, except the `log(m)` (untyped arm value)
  residue.
- **Test fixtures that relied on value-position fall-through (migrated; each still tests what it tested).**
  The full unit + integration + conformance run with E-ERROR-012 on gave 66 failures, all from fixtures that bind
  or write a handled result whose arms only write. Each fixture was migrated mechanically: the binding dropped where
  unread, or each arm given a leave / a value.
  - Arms end with `return`: `error-handler-const-bind-r25-bug-49` (the bound form is its subject),
    `r24-bug-31-if-as-expression-result-binding`, `error-handler-arm-body-emission`, `error-arm-reactive`,
    `nested-error-handler-no-invalid-js`.
  - Arms end with a value: `whole-error-binder-{escapes-s470,allowlist-s469}` (`… false`),
    `e-error-002-value-form-followups-s469` H_OK (`; false` — the expected `err/2` is unchanged, because a falsy
    value and the old envelope both read as `!= true`), `failable-arm-template-literal-lowering` (block tail `n`),
    `request-tag-and-server-fn-reactive` (the arm ends in the cell it wrote),
    browser `handler-server-assign-order-s446` (`; 0`), `e-error-002-handler-forms` N5 (a non-simple-param arrow body
    is an expression-position handler; its arm yields `1`).
  - Binding dropped (statement position): `s462-handler-runtime-helpers-shipped` (guard-arm-*),
    `s465-await-arm-bodies` handlerStmt, `s465-await-arm-r2` cforHandler / switch.
  - Expectations changed because they encoded the old behaviour:
    - `bang-arm-block-value-s468` "a block that ends in a write …" now asserts E-ERROR-012 (it pinned the fall-through
      emission).
    - `s465-await-arm-bodies` "an empty braced `!{ _ :> {} }` …" now asserts E-ERROR-012 (an empty block falls through
      in a value position, which proves it is not the object value `{}`).
- **Pack: shared shape helpers migrated, not edited per shape.**
  - The `B` helper of `r7-shapes.js`, `r8-shapes.js` and `r11-shapes.js` (a bound `const v = wrap(p) !{ _ e :> { … } }`
    read as `v == true`) now ends its block arm in `false`. The outcome the shapes judge is unchanged: before, `v` was
    the envelope, which is also not `== true`.
  - Their 23 VALID shapes compile again.
  - Six pins changed, all IMPROVEMENTS (re-pinned with a comment):
    - `f9/VALID ctor match` and `f9/VALID Q1 primitive sibling of enum field`: PASS-REFUSED → PASS.
    - `l6/VALID ctor match` and `l6/VALID Q1 …`: PASS-REFUSED → PASS.
    - `l5/VALID logged` and `l6/VALID log(e)`: PASS-500 → PASS.
- Unit: new `e-error-012-value-arm-fallthrough-s470.test.js` (23). It covers a fall-through write / block / empty /
  declaration / loop / one-leaving-`if`; `let` / `const` / `return` positions; a helper from `<onTransition>` and from
  `<timer>`; an `<onTransition>` body; the opener; a handler attribute; a server function; library mode; yielding /
  leaving / `fail` arms and statement position ACCEPTED; and the `match` half.
- Full run after migration: unit + integration + conformance **42432 pass / 0 fail**. snippet-gate 113 / 0.
- **Merged origin/main 8f65bb0a1** (#1571 s470-unit-variant-tag-read, r16 +199): EXPECTED_SHAPE_COUNT 3653 + f23 47
  = **3700**. The pack's own count test passes, and the full pre-commit run with the whole pack passed: 48438 / 0.
- **R26 with digests, the whole lane against an extracted origin/main 8f65bb0a1 (3618 files, every artifact hashed).**
  - Code changes:
    - `docs/changes/s441-…/repro/other-contexts.scrml` newly E-IMPL1 (the round-0 justified reset).
    - `samples/compilation-tests/error-004-in-logic.scrml` and `samples/login.scrml` (both already refused) gain
      E-ERROR-012.
  - Emission changes:
    - `conformance/cases/engine/s437-braceless-else-in-effect-bodies`: hook-body re-indentation only (diffed: the
      async-host pass re-prints the body; no `async`, no `await`) plus the content-hashed build id.
    - Two refused files differ from run to run on BOTH compilers.
  - Everything else is identical (3558).
- `docs/bootstrap-conformance.md` regenerated: the migrated cases turn one bootstrap FAIL (E-ERROR-012, which the
  bootstrap already emits) into a PASS.
- **CI job commands on the final tree:** all exit 0, except facts --check (STALE, WARN-only, bot-owned).
  bootstrap-conformance was stale until the regeneration above.
