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
