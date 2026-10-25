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
- ee375662f — gaps 2 + 3 + pack f15 + unit tests. One existing test updated:
  `g-when-handler-astpath-lowering.test.js` §6 (`@res = safeCallAsync(() => fetch("/x"))` in a `when` body, an
  un-imported `safeCallAsync`): now refused E-IMPL1-ACTION-NOT-AWAITED (`fetch` inside a nested function in a
  `when` body, which impl#1 does not await). SPEC basis: the thunk is an async-coloured function value passed to
  a non-collection function (§13.2 value-use ban). The test now accepts that fail-closed refusal.
- next — the message for a helper that reaches `fetch` names it ("`probe`, which calls the host `fetch` …
  §13.7 item 2") instead of "which the compiler emits async" (impl#1 does not).

## Measurements

### Pack family f15 (security-failable-pack, SIDE fullstack) — classify.js
| | base 6081e0685 | head |
|---|---|---|
| 17 BAD shapes (render ×7, action ×7, markup value ×3) | **17 FAIL** (wrong → LOGGED IN) | 15 PASS-REFUSED + 2 PASS (the two plain-comparison markup values now gate correctly) |
| 5 controls | 2 PASS + 3 PASS-DENY | same |
A `^{ }` shape was measured and dropped: PASS-REFUSED E-META-001 on base (no `fetch` in `^{}`, Approach C).
EXPECTED_SHAPE_COUNT 2265 → 2287; pinned; README updated.

### R26 — the whole corpus (4067 `.scrml` files: every file in the tree outside node_modules / .git)
One in-process compile per file; base = an extracted 6081e0685 tree (+ scrml.toml), head = this worktree;
corpus files = this worktree for both. Harness ~/.cache/scrml/s470/laneG/r26.mjs, r26diff.mjs.
- **newly rejected: 1** — `docs/changes/s441-audit-gap-filing/repro/fetch-inside-fn-accepted.scrml` (a gap
  REPRODUCER, not a program): `fn get(u) { fetch(u); return 1 }` then `<p>${get("x")}</p>` → E-VALUE-SERVER-CALL
  "`get`, which calls the host `fetch` … §13.7 item 2". SPEC basis: §13.7 item 2 ("a client function … async-colored
  (§13.2: it calls, directly or transitively, … a Promise-returning standard-library function)") in a render
  position. Not rewritten (it reproduces a different, ruling-gated `fn`-purity gap; its "Actual" line is now stale).
- newly clean: 3, codes changed: 13 — ALL stdlib, all harness artefacts (a worktree stdlib file compiled by the
  base compiler is outside its tree → not stdlib: E-ASYNC-NOT-IN-SCRML / E-NAME-COLLIDES-RESERVED-PREFIX, the
  #1554 note). Re-run of stdlib/ with each compiler over its OWN in-tree copy: 54 files, **0 diffs**.
- No example, sample, benchmark or conformance case changes code. `fetch` in the corpus sits in handlers and
  function bodies (action positions this check does not walk), never in a render position or a sync body.

### CI job commands (.github/workflows/ci.yml), run locally after merging origin/main (d582ae04f)
types-gate --check 0 · root `compiler/tests/*.test.js` 0 · snippet-gate 0 · claim-gate 0 · corpus-compile-floor
--check 0 · gen-md-shim --check 0 · conflict-marker-gate 0 · regen-spec-index --check 0 · delta-lint 0 · ci-shards
needs 0 · s34-census --check-new (base origin/main) PASS (1 changed row, well-formed) · facts --check 1 (WARN-only
step; FACTS.md is bot-owned, not touched) · unit + conformance 31654 pass / 0 fail · pretest · integration + lsp +
commands 10137 pass / 0 fail · todomvc compile + `node --check` 0 · browser-baseline --check 0 ·
lint-no-default-arm 0 · slice m1 / m2 / m1-lowered / m3 / m4 / codec 0 · e2e-render-map 0 · host-global-scan
--check 0 · gen-bootstrap-severity --check 0.

## Candidate gaps (for the PA to file — known-gaps.md not edited)

Measured with a scratch pack family on the base tree (~/.cache/scrml/s470/laneG/scratchpack/x1.js), SIDE fullstack:
1. **HIGH — a waiting function passed as a CALLBACK VALUE in a render position or a sync action body**:
   `<span if=${@xs.some(isOk)}>` (render) and `<timer>${ if (@xs.some(isOk)) … }` — FAIL on 6081e0685 and on this
   head (`.some` of Promises is true). The walk judges a value reference only in local bodies (`exprWaitsAll`).
   Fix direction: judge render and sync-body positions with `valueRefWaits` too, keeping SPEC's exemptions
   (a fire-and-forget scheduler argument, `typeof f`). Same for `@xs.map(fetch)`.
2. **HIGH — the host `fetch` is never coloured async in function bodies / handlers**: `function login(p) { @pw = p;
   if (fetch("/api?p=" + p)) { @msg = "LOGGED IN" } }` — FAIL on base and head (handlers / functions are not walked
   by this check; impl#1 emits `fetch(…)` un-awaited). §13.2 makes a Promise-returning standard-library function
   async-coloured, and §13.7 / §13.8 name `fetch` one. Locus: the file's async set (file-async-fns
   `computeFileAsyncFnNames`, emit-functions `computeClientAsyncSets`) — `fetch` is not a seed. Also: the brief's
   premise "an awaited fetch in a handler" is not true of impl#1 today; the handler control compiles but is
   not awaited.
3. **LOW (SPEC fork) — host Promise values SPEC does not name**: `<span if=${Promise.resolve(@pw == "secret")}>` —
   FAIL on base and head. §13.8's waiting-value definition "does not widen", so this lane did not refuse it.
   Recommendation: amend §13.8 item 3 to name host Promise constructors / statics (`Promise.resolve`,
   `Promise.all`, `new Promise`, …) and host functions documented to return a Promise.
4. **MED — `<request>${ @data = fetch(url) }</>` is refused** (E-IMPL1-ACTION-NOT-AWAITED, fail closed): the
   settle machine emitted `_scrml_cs_reactive_set("data", fetch(…))`, storing a pending Promise. SPEC §6.7.7 calls
   the body "the fetch expression", so this is a valid program impl#1 cannot run correctly. 0 corpus files.
   Fix direction: let the reactive-set lift await the host `fetch` (then add it to `lifted`).
5. LOW (over-refusal, fails closed): shadowing is scope-aware for parameters and statement-list declarations in
   the AST, but not for a body re-parsed from text (engine bodies, `when` bodies read from `bodyRaw`), a
   `for (const fetch of …)` / catch binder, or a file function whose PARAMETER is named `fetch` (the fixpoint is
   scope-blind, so the function counts as reaching the host global).
6. LOW (fail-open residual, contrived): a module-scope binding named `fetch` anywhere in the file (by name, as
   `collectTopLevelStatements`-style scope) turns the host rule off file-wide, even for a render position outside
   that binding's real scope.
7. Doc drift: `docs/changes/s441-audit-gap-filing/repro/fetch-inside-fn-accepted.scrml` now reports
   E-VALUE-SERVER-CALL (its "Actual: exit 0" line is stale); the gap it reproduces (`fn` purity, E-FN-003/004) is
   unaffected.
