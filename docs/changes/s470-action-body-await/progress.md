# progress — s470-action-body-await (SECURITY, impl#1, S435 security exception)

- 2026-10-24 start: worktree verified, base == origin/main 4058bd052 (includes #1547), branch
  `s470-action-body-await`, bun install done.

## Governing text

SPEC §13.8 "The rule": a waiting value SHALL stand only (i) at a suspension point of an action position,
where the compiler awaits it, or (ii) as a `(not to T)` cell initializer. "Everywhere else a waiting value
SHALL be a compile error." The action positions (event handler, function body, lifecycle element body,
engine `effect=` / `<onTransition>`, body-top statement list) are legal — impl#1 must await there. Where
impl#1's emitter has no await path it refuses instead (brief: "REFUSE rather than invent new async
machinery").

## Measured matrix — BEFORE (origin/main 4058bd052)

Probe tooling (scratch, `~/.cache/scrml/s470/await/`): `bin/gen.mjs` writes the q-shapes (header: server
`isOk`, async-coloured client helper `allowed(q) { return isOk(q) }`, a wrong-password button);
`bin/probe.sh` compiles each and runs `bin/unawaited.mjs` over the client JS — every call of an
`async function` declared in the file (or reached through `_scrml_cap.KEY`, the runtime-meta capability
object) that is not the operand of an `await`. p-shapes are the lane-2 reproducers (l2c/miss a*, l2b
meta2/m*/n09). `UNAWAITED` = the emitted line(s).

| probe | position / shape | exit | unawaited call emitted |
|---|---|---|---|
| q01 | module-init `${ @msg = isOk(@pw) }` (exact cell write) | 0 | none (post-pass async IIFE) |
| q02 | cell decl `<v> = isOk(@pw)` (exact) | 0 | the `_scrml_init_set` RESET thunk only (initial write awaited) |
| q48 | cell decl `<v> = isOk(@pw) ? "a" : "b"` | 0 | **YES** (initial write + reset thunk) |
| q03 | module-init bare `${ isOk(@pw) }` | 0 | yes — fire-and-forget, value discarded |
| q06 | module-init `ok = isOk(@pw)` (assign) | 1 | refused E-VALUE-SERVER-CALL (#1547 r2) |
| a05 | module-init `{ ok = isOk(@pw) }` block | 0 | **YES** |
| a13 | module-init `if ((ok = isOk(@pw)))` | 0 | **YES** |
| a14 | module-init `console.log(ok = isOk(@pw))` | 0 | **YES** |
| a15 | module-init `@c && (ok = isOk(@pw))` | 0 | **YES** |
| a16 | module-init ternary assignment | 0 | **YES** |
| a18 | module-init `Object.assign(box,{v:isOk(@pw)})` | 0 | **YES** |
| a19 | module-init `arr.push(isOk(@pw))` | 0 | **YES** |
| a25 | module-init `for (ok = isOk(@pw); …)` | 0 | **YES** |
| a36 | module-init `if (isOk(@pw)) { ok = true }` | 0 | **YES** |
| q34 | module-init `if (allowed(@pw)) { ok = true }` (helper) | 0 | **YES** |
| q36 | module-init `@msg = allowed(@pw)` (exact, helper) | 0 | none (post-pass lifts helpers too) |
| q39 / q40 | module-init `if (@c) { @msg = isOk() }` / `@c && (@msg = isOk())` | 0 | none (post-pass) |
| q49 / q50 / q56 | module-init lambda bodies (`setTimeout(() => …)`, `xs.forEach(x => …)`) | 0 | **YES** |
| q55 | `<div>${ if (isOk(@pw)) {…} }</div>` (non-rendering block in markup) | 0 | **YES** |
| q12 / m08 | `<onMount>${ if (isOk(@pw)) … }</>` / `@msg = isOk("x") ? …` (a plain element; its `${}` runs at module init) | 0 | **YES** |
| q21 | `<onUnmount>${ @msg = isOk(@pw) ? … }</>` | 0 | **YES** |
| q14 | `<timeout delay=10>${ @msg = isOk(@pw) ? … }</>` | 0 | **YES** |
| q04 | `<request>${ @msg = isOk(@pw) }</>` (exact) | 0 | none (settle machine awaits) |
| q43 | `<request>${ @msg = allowed(@pw) }</>` (exact, helper) | 0 | none |
| q05 / n09 | `<request>${ @msg = isOk(@pw) ? "a" : "b" }</>` | 0 | **YES** |
| q15 | `<request>${ if (isOk(@pw)) {…} }</>` | 0 | **YES** |
| q33 | `<request>${ @msg = allowed(@pw) ? … }</>` | 0 | **YES** |
| q19 / m02 | `<timer>` body test / ternary | 0 | **YES** |
| q20 / m03 | `<poll>` body ternary | 0 | **YES** |
| q35 | `<timer>` body helper ternary | 0 | **YES** |
| q37 | `<poll>${ @msg = isOk(@pw) }</>` (exact) | 0 | none (post-pass) |
| q44 | `<timer>${ isOk(@pw) }</>` bare | 0 | yes — fire-and-forget |
| q52 | `<timer>` body lambda | 0 | **YES** |
| q54 | `<timer>${ @msg = isOk(@pw); if (@msg) {…} }` | 0 | none — but the write is DETACHED: the `if` reads the stale cell (see gaps) |
| q23 / meta2 | runtime `^{ @msg = isOk(@pw) ? … }` | 0 | **YES** (`_scrml_cap.isOk(…)`) |
| q24 | runtime `^{ if (isOk(@pw)) {…} }` | 0 | **YES** |
| q25 / m11 | engine state-child `effect=${ @msg = isOk(@pw) ? … }` | 0 | **YES** (fire_hooks, sync) |
| q31 | state-child `effect=${ if (isOk(@pw)) … }` | 0 | **YES** |
| q27 / m12 | engine `<onTransition>` body ternary | 0 | **YES** |
| q28 | `<onTransition>` body `if (isOk(@pw))` | 0 | **YES** |
| q61 | `<onTransition if=${isOk(@pw)}>` guard | 0 | **YES** |
| q38 | `<onTransition>${ @msg = isOk(@pw) }` (exact) | 0 | none (post-pass) |
| q60 | engine message arm `.Go :> { @msg = isOk(@pw) ? … ; .Active }` | 0 | **YES** |
| q26 | engine OPENER `effect=` ternary (server fn) | 0 | none (async IIFE, s441) |
| q47 | engine OPENER `effect=` `if (allowed(@pw))` (helper) | 0 | **YES** (opener path awaits server fns only) |
| q10 | `when @pw changes { @msg = isOk(@pw) ? … }` | 0 | none (async when body) |
| q45 | `when @pw changes { if (allowed(@pw)) … }` (helper) | 0 | **YES** (when path awaits server fns only) |
| q13 / q46 | `on mount { if (isOk/allowed(@pw)) … }` | 0 | none (colorAsyncStatements) |
| q07 / q16 / q17 / q42 | client function bodies (server + helper) | 0 | none — awaited (confirmed) |
| q08 / q09 / q18 / q41 | event handlers (block, ternary, lambda, helper) | 0 | none — awaited (confirmed) |
| q29 / q30 | `<onTimeout>` / `<onIdle>` with a `${}` body | 0 | none — the body is not emitted at all (they carry no body; only `after=` is an expression slot) |
| q11 / q22 | `<onchange>` / `<effect>` elements | 1 | not elements impl#1 accepts (E-STRUCTURAL-ELEMENT-MISPLACED / E-MARKUP-001) |
| mf/page | module-init `@msg = isOk(@pw)` where `isOk` is IMPORTED from another `.scrml` (exact) | 0 | **YES** — `_scrml_reactive_set("msg", isOk(…))`: the lift does not cover imported async fns |

## Log


- Design (one AST walk, the #1547 one — no new scanner, no new async machinery):
  `codegen/render-waiting-calls.ts` gains a SYNCHRONOUS-ACTION-BODY judgement (`syncStmt`), reached
  from (a) every module-init statement (a `${ }` statement that does not render — replaces the S470
  round-2 partial rule, which judged only an assignment's RHS / a declaration's initializer), (b) a
  `<request>` / `<timer>` / `<poll>` body (were skipped as "action"), (c) a `^{ }` body (was skipped),
  (d) the engine's synchronous bodies read through engine-body-reader's ONE cached parse
  (`readEngineBody`, same owner/slot/file as the type system): state-child `effect=`, `<onTransition>`
  body and `if=` guard, message arms, computed `after=` delays. The waiting predicate is the existing
  one (`waits` = `waitingFnPredicateOfFile` ∪ `serverPlacedFnNamesAnywhere` ∪ `computeClientAsyncSets`).
  Two shapes stay accepted because the EMITTER already handles them: (1) a whole cell write of one call
  `@cell = f(args)` (also under `!{}`) where `f` is a function THIS FILE declares that is server-placed or
  client-async (= what emit-client's reactive-set lift matches: fnNameMap stub / `clientAsyncFactsOf`),
  not an engine var, args not waiting; (2) a bare call statement (value discarded) with no waiting
  argument / receiver; plus a lambda written as a statement (never called). Sites carry
  `kind: "action"`; index.ts reports them as E-VALUE-SERVER-CALL with an action-position message
  ("impl#1 runs this code synchronously and inserts no `await` here … Fix: … event handler / function,
  or write its result straight into a cell as the whole statement"). A cell DECLARATION's initializer
  and a plain decl's initializer keep the render (value-position) message.
- Await fix where an async host exists (brief: "make it await via the existing path"): a
  `when … changes` body and an engine opener `effect=` awaited a server call but not an async-coloured
  client helper (q45 / q47). Both now thread the file's `clientAsyncFactsOf(ctx).asyncFnNames` into the
  lowering ctx as `clientAsyncFnNames` (emit-expr `emitCall`'s existing client-peer await) and the
  when-body text injector predicate. Gated on `ctx.routeMap` like the server names (synthetic-ctx unit
  tests have none — timeout.test.js caught it).
- Found by execution: the lift does NOT cover an IMPORTED async function (mf/page: `@msg = isOk(@pw)`
  with `isOk` imported emitted `_scrml_reactive_set("msg", isOk(…))` — a Promise in the cell, at module
  init and in a `<request>` body). The exemption is limited to functions the file declares, so those are
  now refused (unit test "the lift exemption is limited…").
- Tests updated: render-waiting-call-refused-s470 — `<request>` ACCEPTED entry `@pw = isOk("x") ? "a" :
  "b"` (a Promise test — exactly the bug) → the whole-write form `@pw = isOk("x")`; the `^{ const r =
  isOk("x") }` ACCEPTED entry removed (a declaration holding a pending Promise; now refused, covered in
  the new file). New `compiler/tests/unit/action-body-await-s470.test.js` (64 tests: 35 refused positions,
  23 accepted, 3 emitted-await checks, 3 import-lift checks).
- Pack: security-failable-pack family `f9` (SIDE fullstack, 26 shapes + 4 imported-function shapes added later = 30). Measured with classify.js on an
  extracted base tree (`git archive 4058bd052 compiler` + stdlib): **26/26 FAIL** (wrong → LOGGED IN);
  branch: 24 PASS-REFUSED, `when body tests an async helper` PASS, `engine opener effect= tests an async
  helper` PASS-DENY (boot-only effect: runs before the click, so both passwords read "rejected" — fail
  closed, honest). EXPECTED_SHAPE_COUNT 1923 → 1949, pinned, README updated.
- Full failable pack on branch: PASS=724 PASS-REFUSED=1189 PASS-500=2 PASS-DENY=16 UNJUDGED=18 **FAIL=0**
  (= #1547's final 723/1165/2/15/18/0 + f9's 1/24/0/1). No other shape moved.
- R26 (examples, samples, stdlib, benchmarks, compiler/tests/conformance — 1013 files; one in-process
  compile per file; base = extracted 4058bd052 tree, branch = this worktree, same corpus files):
  **newly-rejected 0, already-failing files gaining E-VALUE-SERVER-CALL 0, newly-clean 0.** The only
  diffs are base-harness artefacts, verified: stdlib files read E-ASYNC-NOT-IN-SCRML when the base's
  stdlib was a symlink (path outside the tree → not stdlib), and stdlib/compiler/* read E-IMPORT-008 on
  base (no scrml.toml at the extracted root → `import:host` disabled). Re-run with a copied stdlib: no
  other diff. E-VALUE-SERVER-CALL occurs in 21 files on both sides.
- SPEC §34 E-VALUE-SERVER-CALL row: impl#1-emission note extended (impl#1-provisional) with the action
  positions, the two accepted shapes, the emission site, and the when/opener await. NOTE for the PA: the
  row's normative text says "Not this code: … every §6.15 action position"; impl#1 now reports
  E-VALUE-SERVER-CALL at action positions it cannot await (as #1547 r2 already did for a module-scope
  assignment). Naming fork below.

## Measured matrix — AFTER (this branch)

Every **YES** row of the before-matrix now either refuses (E-VALUE-SERVER-CALL, exit 1) or is awaited:

- REFUSED (exit 1): a05 a13 a14 a15 a16 a18 a19 a25 a36 q34 (module init), q48 (cell declaration
  testing the call), q49 q50 q56 (module-init lambdas), q55 (non-rendering `${}` in markup), q12 / m08
  (`<onMount>` tag), q21 (`<onUnmount>`), q14 (`<timeout>`), q05 / n09 / q15 / q33 (`<request>`),
  q19 / m02 / q35 / q52 (`<timer>`), q20 / m03 (`<poll>`), q23 / meta2 / q24 (runtime `^{}`), q25 / m11 /
  q31 (state-child `effect=`), q27 / m12 / q28 (`<onTransition>` body), q61 (`<onTransition if=>`),
  q60 (message arm), mf/page (imported server fn written into a cell at module init / in `<request>`).
- NOW AWAITED (exit 0, no un-awaited call): q45 (`when` body, helper), q47 (opener `effect=`, helper),
  and (found while checking) a `when` body / opener `effect=` calling an IMPORTED server function
  (mf3 — un-awaited on base, `await isOk(…)` now).
- UNCHANGED, accepted: q01 q02 q04 q36 q37 q38 q39 q43 q53 q57–q59 (whole cell writes the emitter's lift
  awaits), q03 / q44 (bare fire-and-forget call), all function bodies / handlers / `on mount` (already
  awaited — confirmed by probe, not assumed).
- Over-refusal (LOW, accepted fail-closed): q40 `@c && (@msg = isOk(@pw))` — the lift does await a
  reactive set in expression position, but the walk accepts only the WHOLE-statement write.
- Still emitted un-awaited, by design of this lane (see gaps): q02's `_scrml_init_set` reset thunk;
  q03 / q44 bare calls (value discarded); q54's detached write read later in the same body.

## Gates (final tree)

- pre-commit (`test-sharded` unit + integration + conformance): 46152 pass, 0 fail (baseline at start:
  42537 pass / 0 fail on a hook run that skipped the bootstrap slices; the counts differ by the slices
  the hook adds when codegen is touched).
- CI job commands, run locally (`.github/workflows/ci.yml`): types-gate OK (after a ReadonlySet fix) ·
  `bun test compiler/tests/*.test.js` 2239/0 · snippet-gate 0 fail · claim-gate 0 fail ·
  corpus-compile-floor --check PASS (0 baselined) · gen-md-shim current · conflict-marker PASS ·
  regen-spec-index --check OK · delta-lint PASS · ci-shards needs OK · s34-census --check-new (base
  4058bd052) PASS (1 changed row, well-formed) · bootstrap-conformance current · bootstrap-severity
  current · lsp + commands 774/0 · todomvc compile + `node --check` OK · browser-baseline --check PASS
  (8 asserted) · lint-no-default-arm 0 · slice m1 100/0, m2 612/0, m1 lowered 100/0, m3 60/0, m4
  2484/0, codec 166/0 · e2e-render-map 259/0 · host-global-scan --check 0 violations (the 150
  not-judged / threw entries are pre-existing: the stdlib esm entries are identical on an extracted base
  tree) · facts --check STALE (WARN-only; bot-owned, not regenerated per policy).
- security-failable-pack (classify.js, 1953): PASS 725, PASS-REFUSED 1191, PASS-500 2, PASS-DENY 17,
  UNJUDGED 18, **FAIL 0** (= #1547 final + f9's 2/26/0/2). security-await-pack: unchanged (its pinned
  test file passes in the integration run).

## Candidate gaps (for the PA to file — not edited into known-gaps.md here)

- `g-sync-action-body-fire-and-forget-ordering-s470` (MED, locus emit-client reactive-set lift +
  emit-reactive-wiring `emitLifecycleNode` / emit-engine `emitHookArm` / module-init emission): the two
  shapes still accepted in a synchronous body are DETACHED, not awaited in place — a later statement of
  the same body reads the cell before the write lands (q54: `<timer>${ @msg = isOk(@pw); if (@msg) … }`
  tests the stale value — a stale TRUE from an earlier right password would open the branch), and a
  bare call's side effect is not waited for (`save(); @x = load()` races). §13.8 (i) requires the
  await at the suspension point. Path: give these bodies the `on mount` async host
  (`colorAsyncStatements` + `(async () => {…})().catch(…)`, already proven there), which would also turn
  most of this lane's refusals into awaits.
- `g-cell-init-reset-thunk-holds-promise-s470` (MED): `<v> = isOk(@pw)` awaits the initial write but
  emits the reset thunk `_scrml_init_set("v", () => _scrml_fetch_isOk_N(…))` — a `reset @v` (or form
  reset) stores a pending Promise in the cell (truthy).
- `g-host-promise-global-in-action-body-s470` (LOW): a host Promise global (`fetch(…)`) is not coloured
  by the §13.2 facts, so it is neither refused in a synchronous action body nor awaited (sibling of #1547's
  `g-host-promise-global-in-render-not-refused-s470`).
- `g-sync-callback-in-async-host-client-s470` (LOW, not measured here): a server call inside a
  SYNCHRONOUS callback nested in an async client host (`when` body / handler: `xs.sort((a, b) =>
  isOk(a) ? …)`) — the client emitter records it in `syncPeerCalls` only when a sink is threaded; the
  `when` / opener paths thread none. Worth a probe sweep.
- `<onMount>` / `<onUnmount>` TAGS: impl#1 still treats them as plain unknown elements (lane 2's
  finding); their `${ }` statements run once at module init, so this lane judges them as module-init
  statements. If they are meant to be §13.8 lifecycle elements, that is a separate impl#1 gap.
- Naming (PA / owner): the §34 E-VALUE-SERVER-CALL row's normative text says "Not this code: … every
  §6.15 action position". This lane (like #1547 r2 for a module-scope assignment) reports
  E-VALUE-SERVER-CALL at action positions impl#1 cannot await, with an action-specific message, per the
  brief ("the existing E-VALUE-SERVER-CALL machinery or a clear existing code"). Recommendation: when the
  owner next names impl#1 codes, mint a provisional `E-IMPL1-…` code for "an action body impl#1 runs
  synchronously" (precedent: E-IMPL1-FAILABLE-FN-VALUE, S469) — the language allows these positions
  (§13.8 (i)), so the honest label is an impl#1 limit, and the row's "Not this code" sentence stays true.

## Fix round 1 (adversarial review of 41255a64b, verdict FIX) — 2026-10-25

Rebased onto origin/main d455f482e (docs-only delta: known-gaps / pr-reviews). Reviewer material:
`~/.cache/scrml/review/s470-aw/` (repro/, shapes1–5.mjs, bin/run.mjs = the pack's `runShape`).

**CORRECTIONS to the round-0 text above (D1, L3)** — these statements were false; they are kept above
only as the record of what round 0 claimed:
- "a whole cell write … awaited by the emitter's reactive-set lift" was claimed for every synchronous
  host. FALSE for a runtime `^{ }`: it is lowered through the capability object
  (`_scrml_reactive_set("ok", _scrml_cap.isOk(…))`), which the lift does not match (H1). The
  exemption no longer applies there. It is now PROVEN by execution in every host where it is kept
  (below).
- "impl#1 awaits a one-call cell initializer `<v> = f()`": only its INITIAL write is awaited; its
  `_scrml_init_set` reset thunk returns the pending Promise (`g-cell-init-reset-thunk-holds-promise-s470`,
  below). The SPEC note that said so is gone with the revert of the E-VALUE-SERVER-CALL row.
- R26 "compiler/tests/conformance" holds 0 `.scrml` files — the round-0 R26 did not cover conformance at
  all. Re-run below over the top-level `conformance/` and `docs/`.

| # | sev | status | evidence |
|---|---|---|---|
| ruling | — | DONE | user-voice S470 "Mint E-IMPL1 code (Recommended)". Action-position refusals report **E-IMPL1-ACTION-NOT-AWAITED** (new §34 row modelled on E-IMPL1-FAILABLE-FN-VALUE: "impl#1-only — provisional name, owner's call", "an impl#1 limit, not a language rule", the positions, the accepted shapes, the emission site, provenance). §13.8 gains a 5-line note after the "server Promise trap" paragraph naming the code. The §34 E-VALUE-SERVER-CALL row is reverted byte-for-byte to main (its "Not this code: … every §6.15 action position" stands). Render / value positions — an interpolation, an attribute, a derived formula, a cell DECLARATION's initializer — keep E-VALUE-SERVER-CALL. Message: names the position and the fix (event handler / a `function` a handler calls / `on mount { }`, or a `<request>` into a cell); it no longer recommends the whole cell write. SPEC-INDEX regenerated; s34-census --check-new PASS. |
| — | — | NOTE | a plain `const`/`let` at module init (#1547 r1 #2, "the initializer of `ok`") and a module-scope assignment (#1547 r2 #2) are statements of a body-top statement list — action positions — so they now read E-IMPL1-ACTION-NOT-AWAITED, not E-VALUE-SERVER-CALL (R26: 3 files change code, none newly rejected). The #1547 unit tests now assert the new code. |
| H1 | HIGH | FIXED | `^{ @ok = isOk(@pw) }` (and under `if` / `for`) compiled and logged in on 41255a64b (reviewer shapes2/3: 6 FAIL). `liftedWrite` returns false while a `^{ }` body is walked (`noLift`) → refused. Proof of the KEPT exemption, by execution (`~/.cache/scrml/s470/await/lift-proof.mjs`, 12 hosts × plain / under if / under for / helper / `!{}`): request, timer, poll, state effect=, onTransition, message arm, when → PASS (wrong rejected, right logs in); timeout, `<div>` / bare module init, `<onMount>` tag, opener effect= → PASS-DENY with wrong="" (boot-only, run before the click; a pending Promise would have rendered LOGGED IN, so the write was awaited); request under if / for / `!{}` → PASS-DENY (not re-run on `deps=`; not a gate). One FAIL found there — `when` + `!{}` write (`@ok = isOk(@pw) !{ _ :> false }` lowered into a synchronous value IIFE) — now refused (asyncWaits, `whenHost`). |
| H2 | HIGH | FIXED | a LOCAL function whose body waits (const / let lambda, block lambda, `function` value, nested `function`, lambda over a helper, IIFE), declared in a state effect= / `<onTransition>` / message arm / `^{ }` / `when` body / opener effect= and called (reviewer shapes5: 44 FAIL; shapes4: 2). In the synchronous local bodies (engine bodies, `^{ }`: `localScope`) a `function` declaration or a function value whose body waits is refused where it is declared, and a waiting function read as a value (`const f = isOk`) too (`valueRefWaits`; a member's property name is not a read — S469 r2). In the two ASYNC hosts (`when` body, opener effect=) a new walk (`asyncHost` / `asyncWaits`) accepts only an own-level call of a function the host awaits (`awaitedInAsyncHost` = scheduling `_clientServerFnNames` ∪ the client async set — the two sets emit-reactive-wiring / emit-client hand those emitters) and refuses a waiting call inside any nested function (callback, lambda, `function`, IIFE), a waiting function read as a value, a member call off a namespace import (L2), and in a `when` body a `!{ }`-handled call. The `when` body is read through engine-body-reader's parse of its `bodyRaw` (owner-cached); the opener through the same cached parse emit-engine lowers. |
| sync callbacks | HIGH | FIXED | `[@pw].forEach(x => { if (isOk(x)) … })` in a `when` body / the opener (shapes1/2: 3 FAIL) — refused by the nested-function rule. Retires the round-0 candidate `g-sync-callback-in-async-host-client-s470` (it was HIGH, not LOW). |
| L1 | LOW | RECORDED | `allowed(@pw).then((v) => { @ok = v })` in a timer / `<onTransition>` is refused; it ran correctly on base. Not exempted: §13.8 makes `.then` off an awaited waiting value E-ASYNC-CALL-PROMISE-METHOD, so blessing the Promise-chain shape in the one place impl#1 happens not to await would bless a form the language refuses. Candidate `g-then-chain-in-sync-action-body-refused-s470` (LOW, over-refusal). |
| L2 | LOW | FIXED (refused) | `L.isOk(…)` (namespace import) in a `when` body: un-awaited and `L` undefined at run time. Refused by `asyncWaits` (namespace member call); reviewer shapes1 "import namespace when test" PASS-DENY → PASS-REFUSED. The `L` undefined-at-run-time half is not this lane: candidate `g-namespace-import-undefined-in-when-body-s470` (MED). |
| L3 | — | FIXED | R26 re-run (below). |
| D1 | — | FIXED | the two claims, corrected above; SPEC row reverted; the new row states only what the lift-proof run showed. |
| M1 | — | RECORDED | candidate below. |

Over-refusals found by the reviewer shapes (fail closed, recorded): a local function that only WRITES a
cell (`const f = () => { @ok = isOk(@pw) }; f()`, shapes5 "lambda write") PASS → PASS-REFUSED in state
effect= / onTransition / arm / when (the write inside a local function is lifted by the post-pass, but
the walk does not follow the lambda to its calls).

### Reviewer shapes on the new head (bin/run.mjs, same shapes)

shapes1 0 FAIL / 103 · shapes2 0 / 34 · shapes3 0 / 68 · shapes4 0 / 80 · shapes5 0 / 80 (head 41255a64b:
2, 2, 5, 2, 44 FAIL). Every class change vs the reviewer's head runs is FAIL → PASS-REFUSED, PASS-DENY →
PASS-REFUSED (onTdirect ×7, namespace-when, opener lambda write), or the "lambda write" PASS → PASS-REFUSED
over-refusal above. No PASS → FAIL.

### Pack

Family `f10` (+37): H1 ×3, H2 local functions × 6 hosts (the `^{ }` block-lambda / `function`-value
forms omitted: already E-META-001 on 41255a64b), IIFE ×2, callbacks ×3, `when` `!{}` ×1. Measured with
classify.js on an extracted 41255a64b tree: **37/37 FAIL**; this branch: **37 PASS-REFUSED**.
EXPECTED_SHAPE_COUNT 1953 → 1990, pinned, README updated (f9's refusals now read
E-IMPL1-ACTION-NOT-AWAITED; pinned classes are unchanged — the pin compares the class).

### R26 (L3) — examples, samples, stdlib, benchmarks, conformance/, docs/ (3615 files)

Base = extracted 4058bd052 compiler (= origin/main d455f482e's compiler: the delta is docs-only) + an
in-tree stdlib copy + scrml.toml; branch = this worktree; corpus files = this worktree for both.
- newly rejected: **0**; newly clean: 0 outside stdlib.
- code changes on already-refused files: 3, each E-VALUE-SERVER-CALL → E-IMPL1-ACTION-NOT-AWAITED for
  the same module-init site (a `const` initializer / object method at module init):
  docs/changes/s441-async-escape-f4-f5/review-repro/t2-const-derived/case.scrml,
  docs/changes/s441-async-escape-f4-f5/review-repro/tl-obj-method/case.scrml,
  samples/compilation-tests/gauntlet-r10-rails-blog.scrml.
- stdlib diffs in the whole-corpus run are harness artefacts (a worktree stdlib file compiled by the base
  compiler is outside its tree → not stdlib: E-ASYNC-NOT-IN-SCRML / E-NAME-COLLIDES-RESERVED-PREFIX).
  Re-run of stdlib/ with each compiler over its OWN in-tree copy: 54 files, **0 diffs**.

### Candidate gaps added by fix round 1

- `g-when-changes-stale-response-s470` (M1, MED, pre-existing, locus compiler/runtime/runtime-template.js
  `_scrml_when_changes` ~5417): an async `when` body has no stale-response guard — `@pw` right then wrong
  in quick succession: the right password's response lands last and the page ends LOGGED IN (reviewer
  bin/race.mjs). The `<request>` settle machine has a seq guard; `when` has none.
- `g-then-chain-in-sync-action-body-refused-s470` (L1, LOW, over-refusal) — above.
- `g-namespace-import-undefined-in-when-body-s470` (L2 run-time half, MED) — above.
- `g-local-fn-cell-write-refused-s470` (LOW, over-refusal) — the "lambda write" shapes above.
- RETIRED: `g-sync-callback-in-async-host-client-s470` (fixed by refusal in this round).

## Fix round 2 (re-review of f55eb8d4a, verdict FIX — one HIGH) — 2026-10-25

Reviewer material: `~/.cache/scrml/review/s470-aw2/` (repro/N1-opener-optional-call.scrml, shapes6/7).
Call-form probe (scratch `~/.cache/scrml/s470/await/callforms.mjs`, run with the pack's `runShape`, each
form × `when` body / opener `effect=`), on f55eb8d4a → this branch:

| form | when | opener |
|---|---|---|
| optional call `isOk?.(x)` written / tested | PASS-REFUSED (E-CODEGEN-INVALID-LOGIC, unrelated) → PASS-REFUSED E-IMPL1-ACTION-NOT-AWAITED | **FAIL** (N1) → PASS-REFUSED |
| optional HELPER call `allowed?.(x)` | E-CODEGEN-INVALID-LOGIC → E-IMPL1 | PASS-DENY (awaited) → PASS-REFUSED (not relied on) |
| parenthesised callee `(isOk)(x)` | PASS (awaited) | PASS-DENY (awaited) — unchanged, accepted |
| tagged template ``isOk`x` `` | PASS-REFUSED (E-IMPL1) | PASS-REFUSED — unchanged |
| `new isOk(x)` | PASS-REFUSED (E-IMPL1) | PASS-REFUSED — unchanged |
| C-style `for` head `for (…; isOk(x) && …; …)` | PASS-REFUSED (over-refusal) → **PASS** | PASS-REFUSED → PASS-DENY (emitted `await _scrml_fetch_isOk_N(…)` in the head) |
| comma `(0, isOk(x))` | PASS-REFUSED (over-refusal) | PASS-REFUSED — kept (see below) |
| plain call (control) | PASS | PASS-DENY |

- N1 (HIGH) FIXED: `asyncWaits` refuses an optional call of any waiting callee (`optional === true`) in
  both async hosts, E-IMPL1-ACTION-NOT-AWAITED "called optionally". An optional MEMBER call off a
  namespace import was already refused (namespace member rule); an optional member call of a non-import
  object calls no file function. §34 row: "an optional call (`f?.(…)`)" added to the list of what an
  async host does not await (one-line edit; SPEC-INDEX current, s34-census PASS).
- Over-refusal (C-style `for` head in `when` / opener) FIXED: the head is read from its parsed
  `cStyleParts`; the parser's SkippedExpr placeholder `iterExpr` (the same head as text) is skipped.
  Proven by execution: `when` PASS, opener (head over a cell) PASS-DENY with the `await` in the emitted head.
- Over-refusal KEPT (LOW): a comma expression `(0, isOk(x))` is carried as an unparsed
  `SequenceExpression` escape hatch — no tree to show the call is at the host's own level, so its text is
  read to refuse (fail closed). Added to `g-local-fn-cell-write-refused-s470`'s sibling list:
  `g-async-host-comma-expression-refused-s470` (LOW).
- Found while probing (pre-existing, fails closed): the opener `effect=`'s C-style `for` head loses a
  string literal's quotes — `for (let i = 0; isOk("wrong") && …)` emits `isOk(wrong)` → ReferenceError at
  boot. Candidate `g-opener-effect-for-head-string-literal-unquoted-s470` (LOW: throws, never opens).
- Pack: family `f11` (+2: opener optional call written into a cell / tested) — **2/2 FAIL on f55eb8d4a**
  (extracted tree), PASS-REFUSED here. EXPECTED_SHAPE_COUNT 1990 → 1992, pinned, README.
- Unit tests: +3 refused (optional call in the opener / `when`, optional helper), +2 accepted (`when`
  C-style for head, parenthesised callee).

## Fix round 3 (delta review of 07ebed34b, LAND-WITH-FOLLOWUPS — one re-opened shape) — 2026-10-25

- R1 (HIGH, re-opened by round 2) FIXED. `effect=${ for (let i = 0; `${isOk(@pw)}` == "true" && i < 1; i++) { … break } }`
  compiled at exit 0 on 07ebed34b and emitted `for (let i = 0; $; i++)`. Cause, measured on the TAB
  output: a C-style head is carried as TOKENIZED text whose string / template literals lose their
  delimiters (`iterable: "( let i = 0 ; ${isOk(@pw)} == true && … )"`), and its parsed `cStyleParts`
  condition is a bare `$` ident — round 2 read those parts, which are not what the opener emits.
  Opener head probe (`~/.cache/scrml/s470/await/heads/gen.mjs`, 11 kinds): a string literal loses its
  quotes (`isOk("wrong")` → `isOk(wrong)`, `/a/.test("a")` → `/a/.test(a)`), a template collapses to
  `$`; regex / object / arrow / nested parens / member / negation / cell comparison / numbers are emitted
  faithfully. Because the quote loss is invisible in the parse too, the walk cannot tell a faithful head
  from a mangled one, so: outside a `when` body a C-style head that names a waiting function is refused
  (= the f55eb8d4a behaviour; round 2's opener acceptance is withdrawn). In a `when` body (emitted from
  `bodyRaw`, reviewer-confirmed `${await …}`) a head is accepted only when its parsed parts account for
  every waiting name its text holds — a template head there is refused ("cannot read"), fail closed.
- Correction to round 2: "opener (head over a cell) PASS-DENY" — still true of the emission, but no
  longer accepted: refused again.
- Pack: family `f12` (+2, a file-level `const $ = 1` stands in for a page's jQuery) — **2/2 FAIL on
  07ebed34b**, PASS-REFUSED here. EXPECTED_SHAPE_COUNT 1992 → 1994. §34 row: the opener head added to
  the async-host list. Unit tests +3.
- Over-refusals recorded (LOW, fail closed) — `g-c-for-head-over-refusal-s470`: in the opener, every
  C-style head naming a waiting function (even a faithful one); in a `when` body, a head whose parts
  do not read (a template, a `let` init, a comma init / update, a `;` inside a string or an argument, a
  lambda in the test); a comma expression anywhere in an async host (round 2).
- Not this lane (the PA files it): the same head mangling with NO server call in a function body, a
  `<timer>` body and module init (reviewer `d/tpl3.scrml`).
