# progress — s470-nested-handler-await (SECURITY, impl#1, S435 security exception)

- 2026-10-25 start: worktree verified (base == origin/main 29fcaac8a, #1558), bun install + pretest done.
  Scratch: `~/.cache/scrml/s470/laneI/` (base tree `base/` = `git archive 29fcaac8a compiler stdlib`,
  `basefull/` = the same commit with the whole corpus; drivers in `bin/`).

## Governing text

SPEC §13.8 "The rule" (quoted):

> **The rule.** A waiting value SHALL stand only in one of two places:
>
> - **(i) At a suspension point of an action position, where the compiler awaits it.** The action positions are
>   the ones §13.7 lists under "What is not affected": an event-handler value, a function body (client or server), a
>   lifecycle element body (`<request>`, `<effect>`, `<onMount>`), an engine `effect=` / `<onTransition>`, and a
>   body-top statement list. A suspension point is a place where the compiler can end a statement, wait, and resume
>   with what follows (§13.2 inserts the `await` there). […]
> - **(ii) As the initializer of a cell DECLARED `(not to T)`** (§13.9). […]
>
> **Everywhere else a waiting value SHALL be a compile error.**

and the impl#1 note under it:

> **impl#1 limit (not a language rule).** Where a waiting value stands at a suspension point of an action position
> (i) but impl#1's emitter has no async host for that body, impl#1 refuses it with **E-IMPL1-ACTION-NOT-AWAITED**
> (§34) rather than emit it un-awaited.

§19.4.3: an arm of a `!{}` handler in a value position "SHALL … Yield a value of the call's success type: the arm is
an expression, or a block that […] *(S469)* yields it with `lift <value>;` (§18.5)". §18.5 (RULED S469): "A block arm
in a VALUE position — a `match` or `!{}` whose result is used (§18.9, §19.4.3) — yields its value with **`lift
<expr>;`**" (Nominal on impl#1). §18.6.1: `_ err :>` binds the whole error value; it matches like the wildcard.

A `!{}` arm is code that runs in the guarded statement's host: a waiting call in it is at a suspension point of
that host when the host is async (awaited there), and E-IMPL1-ACTION-NOT-AWAITED / E-VALUE-SERVER-CALL otherwise.

## Root cause

`emit-logic.ts emitArmBody` lowered a CLIENT arm body in an EMPTY context: an expression arm through
`emitExprField(…, _makeExprCtx({}))`, a block arm through `rewriteBlockBody` (text, no async facts), a block holding
a nested `!{}` through `_emitNestedGuardedArmBody(inner, { boundary: "client" })`. None carried the host's async
facts, so `check(p) !{ _ :> check("x") !{ _ :> false } }` emitted the inner guard's IIFE as
`(() => { let r = _scrml_fetch_check_5("x"); … })()` — no `await`, a pending Promise as the arm's value, truthy:
a wrong password logged in. The SERVER branch already lowered arms in the guarded statement's own options (S465).

Two more holes measured on the same shapes:
- a `when … changes` body and the engine opener `effect=` (#1554's async hosts): their walk
  (`render-waiting-calls.ts asyncWaits`) counted an arm's parsed `handlerExpr` call as an own-level awaited call,
  but the arm is lowered by the text lowering, which does not await it.
- a value-position block arm `{ …; lift r }` whose block holds a nested `!{}` was read through
  `_emitNestedGuardedArmBody`, which emitted the `lift` as a MARKUP lift (`_scrml_lift(() => textNode(r))`) inside
  an event handler, so the guarded value stayed the error envelope (truthy). (In a function body the same arm
  failed codegen — `lift r;` emitted as text, E-CODEGEN-INVALID-LOGIC: fails closed.)

## Fix

1. `emitArmBody` (client): when the host is an ASYNC client body (`opts.clientAsyncBody === true`, the gate
   emit-expr's own client await uses), the arm is lowered in the guarded statement's options (`armOpts`: same
   facts, its own `declaredNames` copy, no `~` slot, not an expression-position guard). An expression arm goes
   through `_makeExprCtx(armOpts)` (a nested handler: `emitNestedGuardExpr` reads `ctx.logicOpts`, so its guard
   auto-awaits and its IIFE is `(await (async () => …)())`); a block holding a nested guard is re-parsed with
   `armOpts`; a block that names a waiting function (`_armTextNamesAwaitedCallee` — the one asyncness rule,
   `isAsyncCalleeName` over `asyncNameFactsOf`) is lowered from its parsed statements (`armBlockStatementsDetailed`
   + `emitLogicBody`, the reader the server arm and the value-block arm already use). A SYNC host keeps the old
   lowering, where the non-awaitable-call drain refuses the call (the R1 test pins it).
2. `render-waiting-calls.ts asyncWaits`: in the async hosts (`when` body, opener `effect=`) a waiting name in any
   `!{}` arm's TEXT is refused, E-IMPL1-ACTION-NOT-AWAITED ("in a `!{ }` handler arm (impl#1 does not await an arm's
   calls in this body)"), before the walk could count the arm's parsed call as awaited.
3. `emitBlockArmValueToResult`: a VALUE-position block arm whose last statement is `lift <expr>` yields `<expr>`
   (§18.5 / §19.4.3, S469). Only an expression operand; a markup `lift` keeps its lowering.

## Log

- c1 (`fix … await in place`): fix 1 (gated on `clientAsyncBody` after the first hook run caught
  `async-name-provider.test.js` R1: a SYNC host had been handed `await`). R2's emission regex updated: in an
  async host the block arm is now lowered structurally (`xs.sort((p, q) => _scrml_helper_5(p))`), still BARE in
  the synchronous comparator, and the diagnostic still fires — the pairing the test exists for is kept.
- c2: fix 2 + fix 3, unit tests `compiler/tests/unit/nested-handler-await-s470.test.js` (21 tests; **18 fail on
  base 29fcaac8a**, the 3 that pass on base are controls: a VALID sync arm, a `<request>` refusal, library mode),
  pack family r18 (s21 / f24 / l16 / t16).
- Shape fix while measuring: `.Denied(r) :> { const r = … }` redeclared `r` (E-CODEGEN-INVALID-LOGIC on the
  server, E-ASYNC-HANDLER-UNANALYZABLE in a handler) — the block locals are named `got` / `same` instead.

- c3: SPEC §34 E-IMPL1-ACTION-NOT-AWAITED row — one clause added to the async-host list ("in either host a
  waiting function named in a `!{ }` handler ARM"), plus a note that an arm in an async client function body /
  event handler is awaited in place. SPEC-INDEX current (`regen-spec-index --check` OK); `s34-census --check-new
  --base 29fcaac8a` PASS (1 changed row, well-formed).

## R26 — the whole corpus (3618 files)

`bin/r26.mjs` (one in-process compile per file; diagnostic codes with severity + a sha256 digest of every
emitted output, tree path normalised), 6 shards per tree. Base = `basefull/` (`git archive 29fcaac8a` of
benchmarks, compiler — incl. `compiler/samples/mcp-v0-fixture` —, conformance, docs, examples, samples, stdlib,
scrml.toml; each tree compiles its OWN stdlib copy); head = this worktree. File list = every `.scrml` under those
roots (no dist / node_modules) — 3618, identical to the lane-C reviewer's list.

- diagnostic-code diffs: **0**. Newly rejected: 0. Newly clean: 0.
- emitted-JS digest diffs: **1** — `conformance/cases/components/missing-required-slot-reject/case.scrml`
  (an E-COMPONENT-010 file): harness noise — its digest differs run to run on EACH tree (two runs per tree, four
  different digests). No other program's emitted JS changed.
- 1 file throws on both trees (`samples/gauntlet-s19-phase4/nested-comments.scrml`, "Maximum call stack size
  exceeded") — pre-existing.

So no corpus program writes a waiting call in a `!{}` arm of an async host, a value block arm ending in `lift`,
or such an arm in a `when` body / opener `effect=`: the fix changes no existing program's output.

## Shapes — executed, base 29fcaac8a → head (pack `runShape`, classify classes)

Driver: `~/.cache/scrml/s470/laneI/bin/drive.mjs` (`runShape` of each tree's own pack.js over `shapesFor(side)`),
results `b4-<side>.tsv` (base) / `h4-<side>.tsv` (head); per-shape diff `bin/diff.mjs b4 h4 --list`.

| side (family, shapes) | base | head |
|---|---|---|
| server (s21, 81) | 69 PASS · 12 PASS-500 | identical |
| library (l16, 81) | 45 PASS · 36 PASS-REFUSED | identical |
| tool (t16, 81) | 45 PASS · 36 PASS-REFUSED | identical |
| fullstack (f24, 494) | **48 FAIL** · 56 PASS · 2 PASS-DENY · 388 PASS-REFUSED | **0 FAIL** · 82 PASS · 412 PASS-REFUSED |

Fullstack moves: FAIL → PASS 22 (function body 18: nested handler / async helper / a block writing an async
helper, × `check` / `local` outer × `_` / `_ e` / `.Denied(r)`; event handler 4: a value block arm `{ const got =
check(x) !{ _ :> false }; lift got }`), FAIL → PASS-REFUSED 26 (`when` body 6: `local` outer, an arm writing a
server call / a nested handler statement / an arm writing an async helper × `_` / `.Denied(r)`; opener `effect=` 20:
every value arm and the write arms), PASS-REFUSED → PASS 4 (event handler, a block of several statements ending in
`lift` — refused E-ASYNC-HANDLER-UNANALYZABLE on base), PASS-DENY → PASS-REFUSED 2 (opener `effect=`, a nested
handler statement: boot-only, so it denied both passwords; now refused like its siblings). No PASS → anything worse.

Why server / library / tool did not FAIL on base: `emitArmBody`'s server branch (S465) lowers the arm in the
guarded statement's own options, and library / tool async functions are lowered at the server boundary
(`emitLibraryFnMember`). They are kept as pinned regression floors.

Measured hosts, every one: function body (client / server / library / tool), event handler, `when` body,
`<timer>`, `<request>`, module init, state-child `effect=`, opener `effect=`, `<onTransition>`, `^{ }`, an `if=`
gate (render), a derived cell. The synchronous hosts were already refused on base (#1554's `syncParts` walks a
guarded statement's arms) and stay refused; the render / derived positions are refused (E-ERROR-002 /
E-VALUE-SERVER-CALL).
