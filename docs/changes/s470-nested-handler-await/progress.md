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

## Merge + gates (final tree)

- Merged origin/main d6e734814 (#1559 s470-when-changes-latest-wins + bot FACTS regen; it touched emit-logic.ts's
  when-effect lowering) — clean merge, no conflict.
- types-gate: the first run reported 1 NEW TS2345 at the arm's expression lowering (`_makeExprCtx(armOpts ?? {})`
  — the `{}` member) and the baselined `_makeExprCtx({})` gone; rewritten as
  `armOpts ? _makeExprCtx(armOpts) : _makeExprCtx({})`, so the baseline is unchanged: OK, 181 diagnostics.
- CI job commands (`.github/workflows/ci.yml`), run locally on the merged tree (`~/.cache/scrml/s470/laneI/bin/ci.sh`,
  logs in `ci/`): types-gate OK · `bun test compiler/tests/*.test.js` 2239 / 0 fail · snippet-gate 0 fail ·
  claim-gate 0 fail · corpus-compile-floor --check PASS · facts --check STALE (WARN-only; bot-owned, not
  regenerated) · gen-md-shim current · bootstrap-conformance current · conflict-marker PASS · regen-spec-index
  --check OK · delta-lint PASS · ci-shards needs OK · s34-census --check-new (base origin/main) PASS (1 changed
  row) · unit + conformance 31697 / 0 fail · integration + lsp + commands 11267 / 0 fail (the pack, 3417 shapes,
  pins included) · todomvc compile + `node --check` OK · browser-baseline --check PASS (8 asserted) ·
  lint-no-default-arm 0 · slice m1 100 / m2 612 / m1-lowered 100 / m3 60 / m4 2489 / codec 166, 0 fail ·
  e2e-render-map 259 / 0 fail · host-global-scan --check 0 violations · gen-bootstrap-severity current.
- pre-commit hook (every commit): 47775 pass / 0 fail on the last code commit.

## Candidate gaps (for the PA to file — known-gaps.md not edited)

- `g-block-arm-waiting-call-refused-in-async-host-s470` (LOW, over-refusal, fails closed; locus
  emit-library-shared `collectNonAwaitableAsyncCalls` + `computeAsyncFnNames`, ast-builder `_parseHandlerExpr`): a
  `!{}` BLOCK arm of several statements / an `if` / a leave statement (`_ :> return isOk(p) ? …`) that names a
  waiting function, in an async client / library / tool function body, is refused E-SERVER-FN-IN-SYNC-CALLBACK /
  E-ASYNC-STDLIB-IN-SYNC-CALLBACK — its `handlerExpr` is the unparsed escape hatch, which the drain reads as
  un-awaitable and the colouring does not read at all. 36 shapes per side in r18 (f24 / l16 / t16). The emitter
  now lowers such a block from its parsed statements in an async host; the fix is for the colouring and the drain
  to read the same parse (all three must agree — a drain that accepts what the colouring did not colour would
  hand a SYNC host a bare call).
- `g-server-fn-arm-only-helper-not-emitted-s470` (MED, fails closed at run time; locus the server bundle's
  helper closure): a client function reached only from a server function's `!{}` arm is not emitted on the
  server — `allowed is not defined` on the failure path (s21: 12 PASS-500). The same helper called from the
  server function's body is emitted (s12 PASS).
- `g-when-body-guarded-statement-codegen-invalid-s470` (LOW, fails closed; locus emit-logic `when-effect` →
  `rewriteBlockBody`, lane E's area): ANY `!{}`-handled statement in a `when … changes` body — a SYNC callee and a
  sync arm included (`const v = local(@pw) !{ _ :> false }`) — emits a raw `!{` (E-CODEGEN-INVALID-LOGIC). The
  arm refusal this lane adds is reached first when the arm names a waiting function.
- `g-markup-guard-through-parens-unhandled-s470` (LOW, fails closed): a `!{}` written inside parentheses in a
  markup / derived position (`const <ok> = (local(@pw) !{ _ :> false })`, `${ (local(@pw) !{…}) ? … }`) is
  E-ERROR-002 (the handler is not seen), and `const <ok> = local(@pw) !{ _ :> isOk(@pw) }` is E-ERROR-002 where
  the sync-arm twin compiles.
- `g-fail-payload-waiting-call-in-async-host-arm-s470` (LOW, not measured): the new arm refusal in the `when` body /
  opener reads an arm's `handler` TEXT; a re-`fail` arm (`_ :> fail E::X(isOk(p))`) carries its payload in
  `failExpr`, which this check does not read. Probe before filing.
- impl#1 `lift` in a !{} block arm (§18.5 S469, "Nominal on impl#1"): a VALUE-position arm ending in
  `lift <expr>` now yields `<expr>` on both boundaries (fix 3); a statement-position arm's `lift` and the
  E-ARM-TAIL-VALUE check are unchanged (the S469 row's Nominal status stands; bootstrap emits it).

## Second merge (origin/main b49d7d85f — #1563 s470-typed-payload-binders, lane B)

Conflicts in the pack's shared files only (README, `failable-probe-pack.test.js`, `pinned-class.js`): both sides
kept — EXPECTED_SHAPE_COUNT = main's 3021 + r18's 737 = **3758**, R18_PINNED spread after main's new pins, an
`r18-shapes.js` row in the README table. Hook on the merge commit: 48253 pass / 0 fail (the pack with every r18
pin unchanged on lane B's type-system). Re-run on the merged tree: types-gate OK (181, unchanged), s34-census
PASS, regen-spec-index OK, delta-lint PASS, conflict-marker PASS, e2e-render-map 259 / 0, browser-baseline PASS
(8 asserted), host-global-scan 0 violations.

## Fix round 1 (review of bc905b009, verdict FIX) — 2026-10-25

Reviewer material: `~/.cache/scrml/review/s470-li/` (read-only; shapes copied to `~/.cache/scrml/s470/laneI/rev/`).
Trees measured: base `55de8639c` (`t-55d/`), round 0 `bc905b009` (`t-bc9/`), this head.

| # | sev | status | evidence |
|---|---|---|---|
| F1 | HIGH | FIXED | An EXPRESSION-position `!{}` (`(local(p) !{ _ :> isOk(p) }) ? …`, an argument, a `return` / `if` / `&&` / `!!` operand, an object / array member) is carried by the expression parser as the placeholder call `<operand>.__scrml_guard__("!{ … }")` — its arms a STRING the colouring never read, so with a SYNC outer callee `login` stayed sync, `clientAsyncBody` was false and the arm's server call was emitted un-awaited. The colouring now reads those arms (`emit-library-shared.ts guardArmTextCallees`, called from `collectCalleeIdents` and `collectFreeCalleeIdents` — the same pattern `matchArmTextCallees` uses for a match's raw arms; the arms via the statement guard's own reader `parseGuardArmsFromRaw`, each body through `armBodyTextCallees`). The enclosing function is coloured async, so round 0's `clientAsyncBody` path lowers the arm awaited and `emitNestedGuardExpr` emits `(await (async () => …)())` — no new walker. Library / tool sides had the same hole (base 41 / 9 FAIL): fixed by the same colouring. h2/002 (batched into `Promise.all` beside an awaited const — the member's init taken as TEXT, `extractInitExpr`): `scheduling.ts isControlFlowBoundary` now treats a statement holding an expression-position guard as a batch boundary (`holdsExprGuard`), so it is emitted by the statement emitter, awaited in place. Hosts that cannot be async (an event-handler block / inline value, a render `if=`, a derived cell) refuse: E-ASYNC-HANDLER-UNANALYZABLE / E-VALUE-SERVER-CALL / E-ERROR-002 (existing codes, already so on base — not E-IMPL1-ACTION-NOT-AWAITED; noted). |
| F2 | HIGH | FIXED | `decide(local(p) !{ _ :> { const g = isOk(p) ⏎ lift g } })`, `{ lift isOk(p) }`: fixed by F1 (now awaited). One more hole found on the way: `armBodyTextCallees` trusted a parse that DROPPED trailing content — `lift isOk(p)` reads as the ident `lift` — so its call was invisible; such a parse now falls to the token scan (`hasLostTrailingContent`). |
| F3 | LOW | FIXED | Only a value-position TAIL `lift` yields: `emitBlockArmValueToResult` takes a `lift` tail only when the block holds no other `lift` (`_armBlockHasLift`), and `emitArmBody`'s parsed-statement path is not taken for a block holding a `lift`. Both shapes (probes/nlv, h4/064) are refused again exactly as on base (E-CODEGEN-INVALID-LOGIC — see naming note). |

Reviewer shapes on this head: shapes2 0 FAIL / 16 (15 PASS, 1 PASS-REFUSED), shapes3 0 FAIL / 18 (5 PASS-500 = the
helper-not-emitted class), shapes2 with its disabled server / event-handler / inline families enabled (`rev/shapes6.mjs`):
0 FAIL / 43.

**Naming note (PA / owner):** the F3 refusal is base's own — the arm is left to the text lowering, which emits
`lift …;` verbatim and the emit gate reports E-CODEGEN-INVALID-LOGIC ("a compiler defect"). That keeps the
refusal byte-identical to base, but the message blames the compiler for an author error. Recommendation: refuse
by name — E-LIFT-002 for a second / nested `lift` in a value-position arm (§18.5 already names it: "`lift` in an
arm block designates that arm's value at most once on any path (E-LIFT-002)"), and an impl#1 code for a `lift` in a
statement-position arm (the bootstrap uses E-BOOTSTRAP-UNSUPPORTED; §18.5 names no code for it).

### Pack (r18 +530 = 1267 shapes)

See the README "Fix round 1" table: base 55de8639c FAIL f24 58 / l16 41 / t16 9; round 0 bc905b009 FAIL f24 70 /
l16 56; this head 0 everywhere. Every class pinned (`r18-pinned.js` regenerated from `h5` (the 737, unchanged on
this head — measured) + `nh` (the 530)). EXPECTED_SHAPE_COUNT 3758 → 4288.

Unit tests: +9 (`nested-handler-await-s470.test.js`, 30 total) — all 9 fail on bc905b009.

### R26 (fix round 1) — 3981 files, the reviewer's list (adds compiler/self-host-v2, compiler/tests fixtures, docs/website …)

Base = `git archive 55de8639c` (whole tree, `base55full/`); head = the fix-round-1 commit. Same `bin/r26.mjs`
(codes + emitted-output digest).
- code diffs: **1** — `compiler/tests/integration/bootstrap-conformance-counter/fixtures/runtime/server-stub/case.scrml`
  (a bootstrap-syntax fixture, refused on both trees by E-MARKUP-001 / E-SCOPE-001 / E-STATE-UNDECLARED) loses
  E-ASYNC-HANDLER-UNANALYZABLE: its handler `@n = count() !{ .Transport(t) :> { @seen = "failed"; lift 0; } }` is a
  value-position block arm ending in `lift`, now lowered (Fix 3, §18.5) instead of emitted as unparseable text, so
  the handler is analysable. Still refused. Justified.
- digest diffs: **2** — `conformance/cases/components/missing-required-slot-reject` (run-to-run noise on both trees,
  as before) and `compiler/self-host-v2/acceptance/arms/lift-guard-value/case.scrml` (refused on both trees, same
  codes; its in-memory client JS changes `lift "nf:" + m;` → `_scrml__scrml_result_7 = "nf:" + m;` — Fix 3; stable
  across two runs per tree).
- The two acceptance fixtures the reviewer named, `acceptance/arms/neg-lift-nested` and `neg-lift-statement-arm`:
  identical codes AND digest on both trees (impl#1 refuses their bootstrap syntax before any arm is lowered). The
  impl#1 forms of the same shapes (probes/nlv, h4/064, the pack's two F3 shapes) are refused on base, accepted on
  bc905b009, refused again here.
- 1 file throws on both (`samples/gauntlet-s19-phase4/nested-comments.scrml`, pre-existing).

### CI job commands (fix round 1 head, before the merge; `bin/ci.sh`, logs `ci/`)

types-gate OK (181, unchanged) · root tests 2239 / 0 · snippet-gate 0 fail · claim-gate 0 fail ·
corpus-compile-floor PASS · facts STALE (WARN-only, bot-owned) · gen-md-shim current · bootstrap-conformance
current · conflict-marker PASS · regen-spec-index OK · delta-lint PASS · ci-shards OK · s34-census PASS ·
unit + conformance 31808 / 0 · integration + lsp + commands 12138 / 0 (pack 4288, pins) · todomvc OK ·
browser-baseline PASS (8) · lint-no-default-arm 0 · slices m1 100 / m2 612 / m1-lowered 100 / m3 60 / m4 2489 /
codec 166, 0 fail · e2e-render-map 259 / 0 · host-global-scan 0 violations · bootstrap-severity current.

### Merge of origin/main e713ef1aa (#1566 s470-render-residue-host-promises, r19 / f25)

Conflicts only in the pack's shared files: EXPECTED_SHAPE_COUNT = main's 3094 + r18's 1267 = **4361**; both
pin imports kept. render-waiting-calls.ts / emit-library-shared.ts auto-merged. Re-checked on the merge (below).

### Candidate gaps added by fix round 1

- `g-server-boundary-statement-arm-lift-runs-as-return-s470` (LOW, pre-existing on base): on the server boundary
  (server / library / tool) a `lift` in a STATEMENT-position `!{}` block arm, and a nested `lift` in a value one, is
  lowered as `return` from the enclosing function (`wrong -> "x"`); §18.5 gives it no meaning there. Not a regression.
- Naming (above): the F3 refusal reads E-CODEGEN-INVALID-LOGIC.
- Expression-position guards in an event-handler block / inline handler are refused E-ASYNC-HANDLER-UNANALYZABLE (as
  on base), not E-IMPL1-ACTION-NOT-AWAITED as the brief suggested — fail closed under an existing code.

Re-checked on the merge 8d67480b7: pre-commit hook 48911 pass / 0 fail (pack 4361 with every r18 pin unchanged); s34-census PASS, regen-spec-index OK, types-gate OK, e2e-render-map 259 / 0, browser-baseline PASS (8), host-global-scan 0 violations.

### Merge of origin/main 10ad1cfc0 (#1568 s470-bang-catch-try-body, lane C: ast-builder / block-splitter / emit-logic, r10)

Conflicts only in the pack's README and test count: EXPECTED_SHAPE_COUNT = main's 3454 + r18's 1267 = **4721**. Hook on the merge 666525f39: 49321 pass / 0 fail (the pack with every r18 pin unchanged on lane C's parser). s34-census PASS, types-gate OK, e2e-render-map 0 fail, browser-baseline PASS (8), host-global-scan 0 violations.

## Fix round 2 (re-review of 0cd4cab0a, verdict FIX — two HIGH fail-opens) — 2026-10-26

Reviewer material: `~/.cache/scrml/review/s470-li2/` (read-only; shapes copied to `~/.cache/scrml/s470/laneI/rev2/`).

| # | sev | status | evidence |
|---|---|---|---|
| R2 | HIGH | FIXED (the reader) | The tokenizer emits a `//` / `/* */` comment as a COMMENT token whose text is the comment's body WITHOUT its opener; `parseErrorTokens` (ast-builder.js — the one `!{}` arm parser, reached by the statement guard via `buildBlock`, by `parseGuardArmsFromRaw`, and by the nested-handler pass) joined every token's text into the arm body, so `// grant()` became the code `grant()` and RAN. COMMENT tokens are now dropped there (trivia, as in every other token walk of ast-builder.js). Second half: the `!{` block the tokenizer synthesises when re-tokenizing (`tryEmitSyntheticErrorEffectBlock`) carried no start line / col, so every arm token sat on line NaN and the arm text was joined onto ONE line — the line breaks are kept now (`span.line` / `span.col`). `parseGuardArmsFromRaw("!{ _ :> {\n // grant()\n /* b() */ const g = 1\n lift g\n} }")` was `"{  grant()\n const g = 1 lift g }"`, now `"{\nconst g = 1\nlift g\n}"`. Removes R4 (a comment naming a waiting function no longer colours / refuses: reviewer s4 "VALID arm comment names isOk" ×5 PASS-REFUSED → PASS / PASS-DENY (boot-only hosts, the shape's own logic)). Audit: `parseErrorTokens` covers every `!{}` arm reader; a `match` arm's raw text keeps its comments as `//` (JS comments) — probed (`probe/m1`, a value block match arm with `// grant()` and `/* grant() */`: PASS on head and on base; the parenthesised form refused E-CODEGEN-INVALID-LOGIC on both). `armBodyTextCallees`' token scan still reads a match arm's comment text (over-colouring, fail closed — not changed). ast-builder.js is lane C's file: the edit is the 7-line filter at the top of `parseErrorTokens`. |
| R1 | HIGH | FIXED | The library / tool / client drains walk a function body's TREE; an expression-position guard's arms are a string on the placeholder call. `collectNonAwaitableAsyncCalls` and `collectAliasedAsyncCalls` (emit-library-shared.ts) now read them through `exprGuardArmBodies` (the statement guard's own readers: a braced body's parsed statements, else the arm's expression; an unreadable body as an un-awaitable escape hatch), so a waiting call in a callback / IIFE / function value / alias inside an arm is E-ASYNC-STDLIB-IN-SYNC-CALLBACK / E-SERVER-FN-IN-SYNC-CALLBACK / the alias error. The tool drain lacked the library's alias check (`const f = isOk; f(p)` — reviewer h10/006): added (emit-tool.ts `drainToolAsyncSyncCallbackLeaks`). The client alias check counted only the client async set, not server functions (a new pack shape, `alias of the async function then call`, FAILed on fullstack): it now counts them (emit-functions.ts). Reviewer h8/001,002 and h10/001,002,005,006,009,010: FAIL → PASS-REFUSED. |
| R3 | LOW | FIXED | `holdsExprGuard` (scheduling.ts) is a batch boundary only for a guard whose arms name a waiting function (read by `guardArmTextCallees`, the colouring's own reader; the waiting names are the route map's server functions, the client async set and the Promise-returning imports). probes/batch: a sync-only guard batches exactly as on base. Kept local to `holdsExprGuard` (lane J also edits scheduling.ts). |

Reviewer shapes1–10 on this head: **0 FAIL**. Against the reviewer's 0cd4cab0a runs every class change is FAIL → PASS / PASS-REFUSED,
PASS-REFUSED → PASS (R4), or PASS-REFUSED → PASS-DENY (a VALID shape in a boot-only host / a statement-position
shape whose own logic denies both passwords).

### Pack (r18 +44 = 1311 shapes)

`round2Shapes(side)`, every side: 7 R2 comment shapes (incl. the base-FAIL tail-expression one, h7/001) + 4 R1
callback shapes. FAIL counts base 55de8639c → 0cd4cab0a → head: s21 3 → 4 → 0; f24 3 → 5 → 0; l16 3 → 8 → 0; t16 8 → 8 → 0
(the per-shape table in the README). The f24 event-handler "several statements" shapes (4) moved PASS-REFUSED →
PASS — the arm text now keeps its line breaks, so the handler is analysable; executed, PASS. Pins regenerated from
`h8` (the 1267, re-run on this head) + `r2h` (the 44). EXPECTED_SHAPE_COUNT 4721 → 4765. Unit tests +7 (37) — all 7
fail on 0cd4cab0a.

### R26 (round 2) — 3981 files, base = origin/main 4cefa45c2 (whole tree)

Identical to round 1's result: 1 code diff (the bootstrap `server-stub` fixture, still refused, loses
E-ASYNC-HANDLER-UNANALYZABLE — Fix 3), 2 digest diffs (`lift-guard-value` acceptance case — Fix 3, refused on both;
`missing-required-slot-reject` — run-to-run noise), 1 file throws on both. The round-2 changes (comment filter, line
numbers, alias / drain reads) change no corpus program.

### CI job commands (round 2 head; `bin/ci.sh`, logs `ci/`)

types-gate OK (181, unchanged) · root tests 2239 / 0 · snippet-gate 0 fail · claim-gate 0 fail · corpus-compile-floor PASS · facts STALE (WARN-only, bot-owned) · gen-md-shim current · bootstrap-conformance current · conflict-marker PASS · regen-spec-index OK · delta-lint PASS · ci-shards OK · s34-census PASS · unit + conformance 31911 / 0 · integration + lsp + commands 12615 / 0 (pack 4765 with pins) · todomvc OK · browser-baseline PASS (8) · lint-no-default-arm 0 · slices m1 100 / m2 612 / m1-lowered 100 / m3 60 / m4 2489 / codec 166, 0 fail · e2e-render-map 259 / 0 · host-global-scan 0 violations · bootstrap-severity current. origin/main unchanged since the last merge (4cefa45c2).

### Candidate gaps (round 2)

- `armBodyTextCallees`' token-scan fallback still reads a `match` arm's comment text as names (over-colouring, fail closed); the `!{}` arm path no longer does.
- Lane J (s470-promise-all-batch-elements) also edits scheduling.ts: this lane's change is confined to `holdsExprGuard` + the `_guardArmWaits` predicate beside `isControlFlowBoundary`.

### Merge of origin/main 8f65bb0a1 (#1571 s470-unit-variant-tag-read, r16 / s19 f22 l14 t14 — touches emit-logic / emit-expr / emit-library)

Conflicts only in the pack's README count, the test count and pinned-class imports: EXPECTED_SHAPE_COUNT = main's 3653 + r18's 1311 = **4964**; both pin spreads kept. Hook on the merge a88386443: 49617 pass / 0 fail (every r18 pin unchanged). s34-census PASS, types-gate OK, e2e-render-map 0 fail, browser-baseline PASS (8), host-global-scan 0 violations.
