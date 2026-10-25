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
