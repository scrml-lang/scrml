# progress — s470-render-position-server-call-refused

- 2026-10-24 start: worktree verified (base == origin/main 915b6775f), bun install + pretest done.

## Which code — E-VALUE-SERVER-CALL, not a new impl#1 code

SPEC §13.7 already names the render positions. The governing sentences, quoted:

> **The rule — one test: would this position have to wait?** A **value position** (§6.15: an initializer, a derived
> formula, or a render expression, which includes a markup `${ … }` interpolation and a markup attribute value
> expression) SHALL NOT contain an expression whose value arrives only after the program waits. Each of the following
> there SHALL be a compile error, **E-VALUE-SERVER-CALL**: 1. A server call … 2. A call to a client function that
> reaches a server call … 3. A `?{}` query written directly in the position … 4. A call to a Promise-returning
> standard-library function …   (§13.7)

and §13.8's table row:

> | A value position: a cell initializer without the `(not to T)` marker, a derived formula, a markup `${ … }`
> interpolation, an attribute value (§6.15) | It produces a value now, at construction, on every recompute or on every
> render. There is no statement boundary at which to wait. | **E-VALUE-SERVER-CALL** (§13.7) |

§13.9.3 adds: "a waiting value in a markup interpolation or attribute value SHALL remain E-VALUE-SERVER-CALL" and
"A derived cell SHALL NOT be a pending cell (E-VALUE-SERVER-CALL)".

So the render positions are INSIDE E-VALUE-SERVER-CALL. Per the brief, that code is used and no
`E-IMPL1-RENDER-WAITING-CALL` is minted. impl#1 already emits E-VALUE-SERVER-CALL at one site
(type-system.ts `boundaryHandlesCall`, a server call rendered inside an `<errorBoundary>`, S468), so the code
exists in impl#1; this lane widens where impl#1 emits it to every render position. The §34 row (which says
"Nominal / not yet emitted") is amended to record the impl#1 partial implementation.

## Enumeration (BEFORE the fix) — every render position, measured

Probe: `~/.cache/scrml-agent-tmp/s470/enum.mjs` (scratch; the pack's `runShape`, SIDE fullstack — happy-dom page,
in-process server). `helper` = `allowed(@pw)` where `function allowed(q) { return isOk(q) }` (an async-coloured
client helper); `direct` = `isOk(@pw)` (a server function). Base = origin/main 915b6775f.

| position | helper | direct |
|---|---|---|
| markup `${…}` interpolation (in an element) | PASS (awaited, S317 peer set) | **FAIL** |
| `${…}` interpolation, a template literal in it | PASS | **FAIL** |
| a lambda inside an interpolation (`[1].map(x => …)`) | PASS | **FAIL** |
| markup held by an expression (`c ? <span>${…}</span> : ""`) | **FAIL** | **FAIL** |
| `if=${…}` | **FAIL** | **FAIL** |
| `if=call(…)` (unbraced call-ref) | **FAIL** | **FAIL** |
| `show=${…}` | **FAIL** | **FAIL** |
| `else-if=${…}` | PASS-DENY (instrument cannot judge) | PASS-DENY |
| `class=${…}` / quoted `title="${…}"` | PASS-DENY (not judged by #out text; the attribute is a render effect) | PASS-DENY |
| derived cell `const <ok> = …` | **FAIL** | **FAIL** |
| derived cell / interpolation `= match call(…) {…}` | PASS-DENY (Promise has no arm) | PASS-DENY |
| value-form `${ if (call(…)) { lift … } }` | **FAIL** | **FAIL** |
| `${ for (… of (call(…) ? …)) { lift … } }` | **FAIL** | **FAIL** |
| `<each in=…>` row interpolation | **FAIL** | **FAIL** |
| `<each … if=${…}>` | **FAIL** | **FAIL** |
| `<each in=${…}>` | refused (E-SCOPE-001, probe artefact) | same |
| `<match on=${…}>` / a `<match>` arm interpolation | PASS-DENY | PASS-DENY |
| engine `derived=call(…) ? .A : .B` (non-failable) | **FAIL** | **FAIL** |
| engine `derived=match check(@pw) {…}` (failable) | refused E-ERROR-002 (kept) | — |
| component prop `<Gate ok=${…}/>` | refused (E-SCOPE-001, probe artefact) | same |
| plain cell initializer `<ok2> = call(…)` | PASS-DENY (evaluated once; NOT a render position) | PASS-DENY |

The emitters behind those positions are many (emit-html logic slots + emit-event-wiring logic bindings, the
if=/show= mount toggles + if-gate-condition, emit-each in=/if=/rows, emit-match on=/arms (arm-body-reader),
emit-engine derived= + `:`-shorthand state bodies (arm-body-reader), emit-lift value-form if/for + lifted markup,
emit-reactive-wiring derived cells, attribute bindings incl. quoted-template attributes). Patching each emitter is
the failure mode `markup-autoawait-all-emitters` recorded. The fix does NOT go emitter by emitter.

## Design — ONE check at ONE place

- Place: `codegen/index.ts`, right after the file's async set is stashed and next to the
  E-ASYNC-FN-ESCAPES-AS-VALUE judgement (same set, same refusal sink `recordRefusedLowering`).
- Predicate: the existing colouring. A render expression waits iff a function whose body were that expression
  would be coloured async by the same facts: its callee identifiers (the colouring's own structural callee walk,
  `collectCalleeIdents` in emit-library-shared.ts — member calls are NOT callees, the S469 r2 lesson) intersect
  the file's async set (`asyncFnNamesOfFile`: server functions + by-body async + async imports incl. `scrml:`
  Promise exports), or it holds a `?{}` (`bodyHasForeignOrSql`). Not a second classifier.
- Fail closed: a member call off a namespace import of a scrml module (`auth.verifyPassword(…)`; the same rule
  `waitingBindingsOfFile` uses); an escape hatch whose text names an async function (`mentionedNames`, the
  compiler's tokenizer — read only to refuse); an escape hatch with no text; raw text the reader cannot parse
  (`<each in=…>` / `<match on=…>` raw) that names an async function.
- Positions: an AST walk (new module `codegen/render-waiting-calls.ts`) that classifies a logic block's
  render-ness with emit-html's OWN predicates (exported, not copied): `DEFAULT_LOGIC_MODE_TAGS`,
  `stmtContainsRenderableLogic`, `stmtContainsLiftExpr`. Action positions skipped: function bodies, event-handler
  and `bind:` attributes, `<request>` bodies, `when … changes` / message bodies, `on mount` bare-exprs, engine
  `effect=` / `<onTransition>` / message arms. Unknown node kinds in a render context are walked generically
  (every expression tree in them judged) — over-refusal, never a miss.

## Log

- 2026-10-24 impl: `codegen/render-waiting-calls.ts` + the call in codegen/index.ts. Refinements found by
  execution while landing:
  - the "is this a waiting function" predicate is now SHARED with the F4 binding judge
    (`file-async-fns.ts waitingFnPredicateOfFile`, extracted from `waitingBindingsOfFile`, behaviour unchanged):
    a sync helper placed on the server only by caller-context propagation is NOT waiting (the
    `channel-onclient-inferred-server` "shared pure helper" case would otherwise be refused).
  - `serverPlacedFnNamesAnywhere` (file-async-fns.ts): the file set is built by `collectTopLevelStatements`
    (follows `children` only), so a server fn declared in an `if=`/`else` chain branch was invisible — its
    render-position call escaped in the chain form and was refused in the lone-`if=` form
    (g-if-chain-branch-cell-never-wired ROUTING PARITY test showed it). Read the same two facts
    (`isServer`, route map server boundary, minus propagated-only) over the whole tree.
  - a sole value-form `match` / `if` in a `${ }` renders (emit-html `isValueFormControlFlowStmt`, exported).
  - `on=${…}` / `if=${…}` heads carried as raw text keep their `${ }`: unwrapped before the one parse.
  - api.js collectErrors: one E-VALUE-SERVER-CALL per site (the TS `<errorBoundary>` report and the CG report
    of the same line).
- Tests updated (behaviour pins of the now-refused construct, or incidental scaffolding):
  - server-fn-markup-interpolation (GITI-005 §1/§4) and bug-5-const-interpolation §6 and
    lift-target-mount-template (`${serverFn()}` one-shot display ×2): now pin E-VALUE-SERVER-CALL.
  - scaffolding moved from `<p>${serverFn()}</p>` to a handler: server-client-boundary (GITI-003),
    s466-parseerror-import-only, giti-009-import-rewrite, stdlib-type-import-server-load-s462,
    g-if-chain-branch-cell-never-wired; fixture a5/multipage-multirole/routes/loads.scrml (`for (… of
    loadDrivers())` → a cell loaded from a handler).
  - stdlib-client-registry: the fixture used `click=${ … }`, which is NOT an event attribute (a reactive
    attribute binding, evaluated at render: emitted `setAttribute("click", …)` inside an effect) — so its call
    DID run at render. Now `onclick=` as the comment intends.
  - failable pack: KNOWN_FAIL emptied (5 entries); PINNED_CLASS re-measured with classify.js --json f1/ f2/:
    exactly 6 changes (the 5 FAIL → PASS-REFUSED, and `f2/async helper, interpolation` PASS → PASS-REFUSED).
  - conformance: `server-fn/value-server-call-interp-neg` XPASS → xfail removed; new
    `server-fn/value-server-call-init-neg` (cell initializer, still not refused by impl#1) pins the carried
    `g-impl1-value-server-call-s451`. docs/bootstrap-conformance.md regenerated (--write).
- SPEC §34 E-VALUE-SERVER-CALL row: records the impl#1 partial emission (impl#1-provisional) + provenance.
  `s34-census --check-new`: PASS.

## Gap status for the PA to file (do not edit known-gaps.md here)

- `g-markup-gate-tests-server-call-promise` (HIGH) — CLOSED by refusal (E-VALUE-SERVER-CALL at every render position).
- `g-derived-cell-rhs-server-call-renders-promise` — CLOSED by refusal.
- `g-render-match-async-subject-unawaited-s469` — CLOSED by refusal.
- `g-impl1-value-server-call-s451` (carried) — NARROWED: impl#1 now emits E-VALUE-SERVER-CALL at every render
  position; the divergence left is a cell initializer (`<n> = f()`, which impl#1 evaluates once and awaits).
  Pinned by `conformance/cases/server-fn/value-server-call-init-neg`.
- NEW candidate `g-async-set-misses-fns-in-if-chain-branches-s470` (MED, locus `codegen/collect.ts
  collectTopLevelStatements` → `file-async-fns.ts computeFileAsyncFnNames` / `serverFnNamesOfFile`): the file's
  async set does not see a function declared in an `if=`/`else` chain branch (or any non-`children` container),
  so a call of it is not coloured async / not awaited elsewhere (handlers). The render refusal works around it
  (`serverPlacedFnNamesAnywhere`); the colouring itself is unchanged.
- NEW candidate `g-request-in-sibling-page-widens-role-chunk-s470` (needs verification, possibly SECURITY/auth,
  locus reachability / chunk planner): measured on the a5 multipage fixture — adding
  `<request id="driversLoad" deps=[]>${ @drivers = loadDrivers() }</>` to routes/loads.scrml made the HOME page's
  Driver `initial` chunk carry 2 `_scrml_chunk_mount(…, "a")` anchors instead of 1 (the Admin-gated `<a
  href="/admin">` inside `<auth role="Admin">` reached the Driver chunk). Reproduce with
  ~/.cache-style scratch: compile the three route files with `emitPerRoute: true` and count anchors per role.
- NEW candidate `g-host-promise-global-in-render-not-refused-s470` (LOW): a host Promise global (`fetch(…)`) written
  directly in a render position is not coloured by the §13.2 facts (no stdlib import), so it is not refused.
  §13.7 item 4 names it. Not decided by the existing facts → out of this lane's "reuse the predicate" method.
