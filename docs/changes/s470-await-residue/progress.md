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
