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

## Measurements (final branch)

- security-failable-pack (classify.js, 1920 shapes): base PASS=724 PASS-REFUSED=1156 PASS-500=2 PASS-DENY=15
  UNJUDGED=18 **FAIL=5** → branch PASS=723 PASS-REFUSED=1162 PASS-500=2 PASS-DENY=15 UNJUDGED=18 **FAIL=0**.
- security-await-pack (904 shapes): unchanged, FAIL=0 both (PASS=317 PASS-REFUSED=561 PASS-500=18 PASS-DENY=5 UNJUDGED=3).
- Enumeration probe (scratch, 48 shapes): every FAIL above → PASS-REFUSED E-VALUE-SERVER-CALL; plain cell
  initializer unchanged (PASS-DENY; not a render position).
- R26 (32 examples + 881 samples, base 915b6775f vs branch): 5 newly-rejected, 4 already-failing files gain the
  code, 0 newly-clean. Every one was inspected and is a genuine render-position server call:
  - NEW examples/17-schema-migrations.scrml — E-VALUE-SERVER-CALL (`${ for (let n of listNotes()) { lift … } }`)
  - NEW samples/compilation-tests/gauntlet-r10-go-contacts.scrml — `${ initDB() }` in a `< db>` body (rendered: a db body is not a default-logic root)
  - NEW samples/compilation-tests/gauntlet-r10-vue-datatable.scrml — `${ loadInitialData() }` in a `< db>` body
  - NEW samples/compilation-tests/gauntlet-s19-phase1-decls/phase1-fn-server-prefix-013.scrml — `<p>${computeKey(1, "x")}</>`
  - NEW samples/compilation-tests/gauntlet-s19-phase1-decls/phase1-function-with-sql-002.scrml — `<p>${loadUsers().length}</>`
  - +code samples/admin-panel.scrml (E-TYPE-025 already), gauntlet-r10-bun-admin.scrml, phase1-fn-prohibition-sql-004.scrml, samples/user-profile.scrml
- CI-only gates:
  - types:check OK (unchanged). s34-census --check-new PASS. regen-spec-index --check OK. snippet-gate 0 fail.
    claim-gate 0 fail. root `compiler/tests/*.test.js` 2239 pass. bootstrap-conformance --check: regenerated (--write).
  - **corpus-compile-floor --check: FAIL — 2 NEW showcase breaks**: examples/17-schema-migrations.scrml (1),
    benchmarks/per-route-roles/ (7: `for (… of loadX())` loops in admin/customer/dispatch/loads). NOT
    baselined and NOT rewritten (brief: list, do not migrate). PA decision.
  - **e2e-render-map: 1 hard fail** — "each multi-file app … emits html": benchmarks/per-route-roles/routes/admin.scrml
    no entry html (the same benchmark). Delta (warn-only): examples/17-schema-migrations.scrml#empty needs-server → fails-compile.
- Runtime: no file under compiler/runtime touched; zero runtime bytes.

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
- (DROPPED per PA: the "`<request>` in a sibling page widens a role chunk" observation is a pre-existing
  cross-file node-id collision in reachability/component-4.ts, not this change; the PA files it. Note the fix
  round's benchmark rewrite adds `<request>` elements to benchmarks/per-route-roles, which that bug may touch.)
- NEW candidate `g-host-promise-global-in-render-not-refused-s470` (LOW): a host Promise global (`fetch(…)`) written
  directly in a render position is not coloured by the §13.2 facts (no stdlib import), so it is not refused.
  §13.7 item 4 names it. Not decided by the existing facts → out of this lane's "reuse the predicate" method.

## Fix round (S239 review of d4e9c2545) — 2026-10-24

Rulings (bryan, S470): (1) uniform refusal kept; (2) rewrite per-route-roles + example 17 in this PR.
Probes: ~/.cache/scrml/review/s470-l2/p/. Every finding was reproduced on d4e9c2545 before acting.

| # | sev | status | evidence |
|---|---|---|---|
| 1 | HIGH | FIXED (db3c97fdb) | g01 / h02 exit 0 on d4e9c2545 → E-VALUE-SERVER-CALL "`hh`, which the compiler emits async". The check now also reads the client emitter's OWN async set (`computeClientAsyncSets` over `collectFunctions`, same inputs as emit-functions.ts), which reaches chain branches. Unit tests "#1 …". |
| 2 | HIGH | FIXED (db3c97fdb) — refused under the same rule | g05b / g05 / g06 now E-VALUE-SERVER-CALL "the initializer of `ok`": a plain `const`/`let` declared in a `${ }` block (never inside a function) is a §13.7 value position ("an initializer … own value"); impl#1 emitted `const ok = _scrml_fetch_isOk_4(…)` (a Promise). No new machinery: one more statement kind in the existing walk. A function VALUE initializer (`const v = (w, p) => w(p)`) is skipped (not called by being declared; s465-await-r8 paramShadowsBinding). Cell initializers stay out (impl#1 awaits them). R26: +1 newly-rejected gauntlet sample (gauntlet-r10-rails-blog `const initialPosts = loadPosts()`). |
| 3 | MED | FIXED (db3c97fdb) | n13 / m05 / m01 refused on d4e9c2545 → clean. The engine walk now reads only what codegen renders (emit-engine `buildEngineArms`): each state child's `bodyChildren` node, children filtered by emit-variant-guard `filterRenderableChildren`; state-child attributes (`rule=`, `effect=`), `<onTransition>` / `<onTimeout>` / `<onIdle>` and an engine-level `<onTransition>` are never walked. Control: a state child's rendered `${isOk(@pw)}` is still refused (f18, unit test). |
| 5 | MED | FIXED (db3c97fdb) | f14 / n25 refused → clean: `isMetaKind` nodes are skipped in both the node and statement walks. |
| 7 | LOW | FIXED (db3c97fdb) | d01 reported 1 (the CG `isOk` site dropped, same line) → 2. api.js key is file + line + column. |
| 8 | LOW | FIXED (db3c97fdb) | f06 / f19 reported 2 (one with a 1:6 span from the re-parse) → 1, at the element / state child (`withSpan`). |
| 11 | LOW | FIXED (db3c97fdb) | a `parseMatchArms` throw now reads `armsRaw` to refuse (`textNames`) instead of yielding no arms. No reproducer (the reader did not throw on any probe). |
| 2-pre | — | n/a | see #2 (g05b closed by refusal; `g-markup-gate-tests-server-call-promise` may be reported CLOSED: g05b no longer compiles). |
| 4 | — | FILED | m12: an engine `<onTransition>` body `@msg = isOk(@pw) ? … : …` is emitted synchronously (not awaited) — an action position whose emitter does not await. Not this lane (action positions are out of the render rule). Candidate `g-engine-hook-body-server-call-not-awaited-s470` (MED, locus emit-engine onTransition / effect= body lowering). |
| 6 | — | FILED | q04: markup held in a `const` initializer (`${ const m = <span if=${isOk(@pw)}>IN</span> }` then `${ m }`) is never walked (still compiles on this branch); q05 the reviewer's `($)` condition-loss on the sync twin. Candidate `g-markup-in-const-initializer-unwalked-s470` (MED). |
| 9 | — | FILED | s01: the name set is scope-blind — a `server function fmt` in a chain branch and a sync `function fmt` in a component body share a name; the sync one's render call is refused (over-refusal, fails closed). Candidate `g-render-waiting-names-scope-blind-s470` (LOW). |
| 10 | — | FILED | n06: a local `const isOk = (x) => x` inside a function shadows the server `isOk`; `${f2()}` is refused because `f2` is coloured async by the colouring's own scope-blind callee walk (over-refusal, fails closed; the colouring itself, not this check). Candidate `g-async-colouring-ignores-local-shadow-s470` (LOW). |
| — | — | FILED (new, found in the sweep) | h03: a `function` declared inside a `<match>` arm body is never emitted — the arm calls a bare `hh(…)` (ReferenceError at run time; not an open gate). Candidate `g-fn-in-match-arm-body-not-emitted-s470` (MED). k02: `<engine for=… if=${isOk(@pw)}>` compiles and the `if=` is dropped (no gate emitted, no diagnostic; same on base). Candidate `g-engine-if-attr-dropped-s470` (MED/security-adjacent: an `if=` gate on an engine host is silently ignored). |

Other sweep notes: `<onMount>` / `<onUnmount>` tags (m07, m09) are refused — impl#1 treats them as plain unknown
elements and RENDERS their `${ }` (`<onMount><span data-scrml-logic>…` + `_scrml_render_value`), so by the
emitter they are render positions. If they are meant to be §13.8 lifecycle elements, that is a separate impl#1 gap.

Benchmark / example rewrite (f507a833a): per-route-roles admin (2 loops), customer (1), dispatch (2), loads (2 loops,
1 cell) and example 17 (1) load cells through `<request id=… deps=[]>${ @cell = loadX() }</>` and render the cell.
e2e-render-map baseline: only the cells this change moves are updated (per-route-roles: orphan routes/loads.scrml
cell replaced by routes/admin.scrml renders-clean; example 17 needs-server → renders-clean; phase1-fn-server-prefix-013
and phase1-function-with-sql-002 → fails-compile E-VALUE-SERVER-CALL). A full regen would also move ~40 cells other
lanes changed; not written. `generate-baseline.js --check` still lists 5 green→red cells that are equally red on base
915b6775f (pre-existing, not this change).

Gates (fix round, final tree):
- pre-commit gate `scripts/test-sharded.ts unit integration conformance`: 40273 pass, 0 fail.
- `bun scripts/corpus-compile-floor.ts --check`: PASS — every showcase program compiles clean on HEAD (0 baselined).
- `bun test compiler/tests/e2e-render-map/`: 259 pass, 0 fail.
- self-host-v2 slices (CI job commands): m1+m2+m3+m4 3256 pass 0 fail; m1 SLICE_CORE=lowered 100 pass; slice-codec 166 pass
  (cross-impl fixture: its program-body `let a = maybePt(1)` moved into a handler function — #2 refuses it).
- types:check unchanged; s34-census --check-new PASS; snippet-gate 0 fail; claim-gate 0 fail; root tests 2239 pass.
- failable pack FAIL 0 (PASS 723, PASS-REFUSED 1162); await pack FAIL 0 (unchanged).
- R26 vs 915b6775f: newly-rejected 5 (gauntlet-r10-go-contacts, gauntlet-r10-rails-blog, gauntlet-r10-vue-datatable,
  phase1-fn-server-prefix-013, phase1-function-with-sql-002 — all genuine, left refused); 4 already-failing files gain the code.
- host-global-scan --check: exit 0, 0 violations (2868 units). Not run: browser-baseline.
