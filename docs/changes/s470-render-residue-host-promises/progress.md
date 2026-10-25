# progress — s470-render-residue-host-promises

Lane G (S470, SECURITY under the S435 policy). Three escapes where a pending Promise reaches a gate unrefused:
`g-markup-in-const-initializer-unwalked-s470` (MED), `g-host-promise-global-in-render-not-refused-s470` (MED),
`g-host-promise-global-in-action-body-s470` (LOW).

- 2026-10-25 start: worktree verified (base 6081e0685 == origin/main), bun install + pretest done.
  Scratch: ~/.cache/scrml/s470/laneG/ (probes copied from ~/.cache/scrml/review/s470-l2/p/q04, q05).

## Gap 1 — markup held in a `const` initializer

Root cause, measured (AST dump of q04 on 6081e0685): the walk DOES reach the markup (`const-decl.initExpr` is a
`markup-value`, which `unseenWaits` walks as markup). What it reads is wrong: the attribute value is
`{ kind: "expr", raw: "${isOk(@pw)}", exprNode: { kind: "ident", name: "$" } }`. The markup-value reader
(ast-builder `parseExprWithMarkupValues`) pre-splits only TEXT-position `${…}` interpolations into child blocks
(`collectTextInterpSpans`, GITI-033); an attribute-position `${…}` was "left to the attribute tokenizer", which read
the `$` as the whole value. That one defect is both reviewer findings:

- q04 (`if=${isOk(@pw)}`): the check judged `$` (no server call) — compiled, exit 0.
- q05 (`if=${@pw == "s"}`, the sync twin): emitted `_scrml_ifrow_apply(…, ($))` — the condition lost. Without a
  page `$` a ReferenceError (fails closed); with jQuery or any page-level `$` the gate is always open.
  Also `title=${@pw}` → `String($ ?? "")`.

Fix (proven path): pre-split an unquoted attribute `${…}` too, as the block splitter does for `lift <tag attr=${…}>`;
`_parseLiftAttrValue`'s BLOCK_REF branch then strips the `${ }` and parses the interior (the q06 `lift` control was
already right). The walk is unchanged — it now sees the real call. After: q04 → E-VALUE-SERVER-CALL; q05/q07 emit
`_scrml_structural_eq(_scrml_cs_reactive_get("pw"), "s")` with a reactive subscription; q08 `title=` reads the cell.

## Log
- 1647975ca — gap 1 fix (ast-builder `collectTextInterpSpans` also pre-splits an unquoted attribute `${…}`).
  Pre-commit gate green.

## Gaps 2 + 3 — the host `fetch`

### Governing SPEC text (grepped, quoted)

- §13.7 (line ~11092): "A **value position** (§6.15: an initializer, a derived formula, or a render expression, which
  includes a markup `${ … }` interpolation and a markup attribute value expression) SHALL NOT contain an expression
  whose value arrives only after the program waits. Each of the following there SHALL be a compile error,
  **E-VALUE-SERVER-CALL**: … 4. **A call to a Promise-returning standard-library function** (§13.2) — `fetch`, the
  `scrml:http` functions, and every other standard-library function the compiler emits `async`. The position would
  wait for the Promise."
- §13.7 item 2: "**A call to a client function that reaches a server call** — a function that is not itself
  server-placed but is async-colored (§13.2: it calls, directly or transitively, a server function or a
  Promise-returning standard-library function)."
- §13.7 normative statements: "A value position (§6.15) SHALL NOT contain an expression the program would have to
  wait for: … or a call to a Promise-returning standard-library function (`fetch`, the `scrml:http` functions).
  Each SHALL be a compile error, E-VALUE-SERVER-CALL."
- §13.7 example: "`<about> = fetch("/about.txt")   // E-VALUE-SERVER-CALL (item 4) — `fetch` returns a Promise`".
- §13.8 (line ~11231): "**A waiting value.** … 3. **a call to a Promise-returning standard-library function**
  (`fetch`, the `scrml:http` functions, `scrml:auth` `verifyPassword` / `hashPassword`, and every other
  standard-library function the compiler emits `async`). … These are the same three forms as §13.7's items 1–4,
  and the same set §13.2's *async-colored* defines. This definition does not widen either."
- §13.8 rule: "A waiting value SHALL stand only in one of two places: **(i) At a suspension point of an action
  position, where the compiler awaits it.** … **(ii) As the initializer of a cell DECLARED `(not to T)`** …
  **Everywhere else a waiting value SHALL be a compile error.**"
- §13.2: "An **async-colored function** is one the compiler emits `async`: a server function, a Promise-returning
  standard-library function, or any function that (transitively) calls one."
- §34 E-IMPL1-ACTION-NOT-AWAITED: "A waiting value (§13.8: a call of an async-coloured function, a `?{}`, a
  Promise-returning standard-library call) stands in an ACTION position whose impl#1 emitter lowers the body with
  no async host …"

### The list — reading chosen

SPEC names exactly ONE host global as a waiting value: `fetch` (§13.7 item 4, §13.8 item 3, the §13.7 normative
statement and example, the §34 E-VALUE-SERVER-CALL row). The stdlib host layer (`stdlib/host/index.scrml`)
declares no host Promise globals (only `safeCall` / `safeCallAsync`, which are imports and already coloured).
§13.8 says the definition "does not widen". So the list is `{ fetch }` (+ its spellings through the global
object: `globalThis.fetch`, `window.fetch`, `self.fetch`). `Promise.resolve(…)` and other host Promise-returning
functions are NOT added — no SPEC text makes them a waiting value. Nothing is newly rejected without SPEC basis.

### Implementation (proven path)

- `codegen/host-promise-globals.ts`: `HOST_PROMISE_GLOBALS = {fetch}`; `fileBoundNamesOf` (module-scope
  bindings + imports — a file that binds `fetch` itself owns the name); `hostPromiseReachOf` (the colouring's
  OWN fixpoint `computeAsyncFnNames`, seeded with the host name: a file function that reaches `fetch`, §13.7
  item 2); `hostShadowedRefsOf` (ident nodes a parameter / local declaration shadows).
- `codegen/index.ts`: the existing `waits` predicate of `renderWaitingCallsOf` gains `|| _rwHostReach.has(n)`.
  So #1547's render refusal (E-VALUE-SERVER-CALL) and #1554's sync-body / async-host machinery
  (E-IMPL1-ACTION-NOT-AWAITED) see it. Not a parallel check. `fetch` is not in `lifted` / `awaitedInAsyncHost`
  (no emitter awaits it), so a whole cell write or a `when` / opener-`effect=` test of it is refused, not
  accepted.
- `render-waiting-calls.ts`: a shadowed ident is not the host global (`waitingIdent`, the callee walk);
  `hostMemberCall` for `globalThis.` / `window.` / `self.fetch`; the message names "the host `fetch`, which
  returns a Promise (§13.7 item 4)".
