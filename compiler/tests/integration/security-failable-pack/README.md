# security-failable-pack

The wrong-password probe corpus of the §19.4.3 failable class (E-ERROR-002, a `match` on a failable
result), kept as a permanent impl#1 gate. Built S468 fix round 1 (branch `s468-failable-alias-and-match`)
from the adversarial review of the frozen head `7ecae57eb`, so the class has an executable floor the way
the §13.2 await class has `../security-await-pack`.

Every shape is a login page: `check(p)! -> AuthErr` fails `.Denied` on a wrong password, and `login(p)`
reaches `check` through some position — a `match` subject (direct, through an operator, through an alias,
through a returned function), a callback, a parameter default, an event-handler attribute, a server
function. If the compiler accepts an unhandled failable result, or lowers a `match` that compares the
error object as a plain value (or reads a plain enum value as `.Ok`), the wrong password logs in.

| file | what |
|---|---|
| `shapes/<family>.js` | the shapes, copied verbatim from the reviewer's scratch dir (`n1`–`n8` client, `s1`–`s2` server) and the fix-round dev's (`n9`, `n10`); S469 added `n11` (a failable `match` in every event-handler value form × container: top level, `<each>` row, component body, `if=` subtree) and `n12` (the `!` function imported; multi-file shapes — `pack.js` loads the imported modules' client chunks). 260 shapes (S469 fix round 2: n11 grew to 56 — the call-form argument and nested containers; n12 to 16 — `export *`; n13 — a handler through a `const` alias, 5; 265 shapes; S469 n14 — a failable call inside a template-literal interpolation, 10; 275 shapes; S469 n15 — an object shorthand or an exported `const` alias, 7; 282 shapes; S469 n16 — a labeled block in a function-expression body, or a `${…}` in a quoted attribute value, 19; 301 shapes; S469 n17 — a `}` in a comment or regular expression of a quoted-attribute interpolation, or a line terminator in a quoted template attribute, 10; 311 shapes; round 4 — an Annex B HTML-like comment in the interpolation, 4 more; 315 shapes; S469 s469-engine-effect-failable n18 — a failable call in an engine `effect=` / `<onTransition>` body or guard / message arm / `<onTimeout>` delay / `:`-shorthand body and a `<match>` arm, 45; 360 shapes; review of 6e0770356 — a handled call in a text-lowered slot (guard / delay / `derived=` / structural `if=` / `on=`) and a quoted guard, 14 more; 374 shapes; review of 5a88c3030 — `<each>` `if=` / `in=`, a `const` alias declared after the engine, and an unlexable slot, 14 more; 388 shapes; S469 n19 — an `if=` authorization guard on an `<each>` nested in another `<each>`'s row or in lifted markup, plain and handled-failable × 5 containers, 10; 398 shapes; review of 67bbca342 — a lifted `<each if=r.ok>` reading the stale loop item (id / index keys × `r.ok` / `(r.ok)`), 4, and an `else` sibling where no if= chain is built (nested / lifted `<each if=>`, markup `if=` in a row / in lifted markup), 4; 406 shapes; S469 n20 — an `if=` authorization guard on a `<match>` inside an `<each>` row (1 / 2 / 3 deep, under a row element, a component, an engine arm) or an `<each>`'s `<empty>` body, plain and call-ref, 14, and a guard reading the row / an outer row (id / index keys × `r.ok` / `(r.ok)`), 8; 428 shapes; S469 round 2 n21 — a markup `if=` guard on a NESTED element or a MULTI-root item root in an `<each>` row, revoked after the row is built (plain / call-ref × nested 1–2 deep, each in each, ×3, component, errorBoundary, multi-root head / tail), 16, and a row / outer-row / multi-root guard reading the row (id / index keys × `r.ok` / `(r.ok)`), 12; 456 shapes; S469 n22 — a STALE EFFECT of removed content (an arm in a removed row, the `<each>` rows of a torn-down arm, a row-scoped `<match if=…>` teardown, the rows of an `<each>` nested in a removed row) granting after the revoke, 9; 465 shapes; S469 round 2 — a top-level `<match>` / `<engine>` first dispatched by a write from inside a row build (the owner taken from the writer), 2; 467 shapes; S469 n23 — a markup `if=` guard in LIFTED markup (plain / call-ref / quoted / a cell read inside a called function, bare and in `&&` × a `for … lift` sole root / nested 1–2 deep / multi-root head / tail / lift in lift, a `for` over a literal, an `if … lift` root / nested, a bare `lift` root / nested, a function returning markup, a ternary markup value, a lift in an `<each>` in a `<match>` arm, a component in a row — gated, or with the gate in its body —, an `<each>` that is the lifted root), 85, a value-indexed `@pw == r.k` sole root / nested, 2, its ROW side (the same-key row's key revoked; sole root / nested × id / index keys), 4, and a row guard (nested / multi-root × id / index keys × `r.ok` / `(r.ok)`), 8; round 3 — a guard reading a LOCAL of the lift body (a while counter `>` / `!=`, a counter over `@items`, an accumulator, a flag set after the lift × plain group / `if … lift` arm / row), 13; round 4 — a local closure (over a flag, over a counter) and a mutated local array / object × the same three contexts, 12; S469 s469-softnav-build-guard n26 — SIDE `nav`: a soft navigation from a live build A into build B's page whose `#wrong` carries the same delegated handler id as A's privileged `#right` (via `navigate()` / a boosted link / popstate / an unstamped page / a delegated submit), 5, and round 2 (review F1) an ungated chunk served under a matching page, 1; S469 s469-engine-in-row n25 — an `<engine>` used as a GATE inside an `<each>` row (row root id / index keys, multi-root, nested element, `if=` element, an arm that reads the password, a `<match>` arm in the row with and without an `<each>`, the row of an `<each>` in a `<match>` arm, a nested `<each>` row, an `<empty>` in a row / at top level), 12 — PASS-DENY on `c9f8cd25b` (the engine was dropped), PASS-REFUSED after (E-COMPONENT-ENGINE-SCOPE; the top-level `<empty>` E-CG-003); 609 shapes; S469 s469-impl1-arm-commas n24 (client, 119) and s3 (server, 24) — a `match` arm list that impl#1's arm readers mis-split: a regex literal in an arm body (r2), a literal alternation (r3), a negative later alternate (r4), a `|`-led arm (r5, r6 — incl. a `|`-led first arm before two or more literal arms), a bare handled-call statement arm (r6), an engine `derived=match` and a server-function match lowered from text (r7), a PAYLOAD variant (`{ variant, data }`) compared by name in that text lowering (r8) — each a deny-list whose dropped arm or alternate logged the wrong password in, × newline / comma / mixed arm lists; 758 shapes; S469 s469-lift-gate-staleness n23 +28 — a cell read two calls deep or through a file-level `const` closure (× 8 positions × 2), a run-once group's / an arm's indirect gate beside a body local, 2, the value-indexed row side written IN PLACE (sole root / nested × id / index keys), 4, an item-derived local / a local closure over the row item in a row (× id / index keys), 4, a group local read in a row, 1, and an open gate in a function body (refused), 1; 786 shapes; round 2 (review of b57d697a9) +10 — a local or parameter holding a value computed by a call that reads the cell (`let ok = granted()`, destructured, negated, ternary, assigned later, in an arm / a plain loop / a component body, a function parameter — refused), main 8 FAIL, and an inner-loop local in a re-runnable region of a keyed row, 1; 797 shapes; round 3 (review of b192c63de) +4 — the same inner loop among a FRAGMENT row roots (group head, beside a sibling root, beside a gated root, in an arm with a sibling), revoked and reordered; 801 shapes; S469 s469-keyed-row-if-gate n28 — a control-flow `if` STATEMENT gating content in a keyed `for … lift` row: 14 positions (among the row's roots — sole, beside a sibling root, if / else, else if, nested, around a nested loop, an early `continue` — and inside a row element — plain, if / else, nested, around a nested loop, two deep, in one root of a multi-root row, between sibling elements) × 7 revokes (a cell; a cell then a reorder in a later timer turn; a reorder then the cell; a same-key replace; an in-place field write; an in-place write then a reorder; a cell then a remove + re-add), 98 — main 84 FAIL (the 14 PASS are the remove + re-add control: a re-added row is built fresh), branch 0 FAIL — and a `match` STATEMENT in the row (on a cell; on the row's field, same-key replace / in-place), 3 — PASS-DENY on main only because its lifts escaped the row (outside `#out`, or duplicated: `LOGGED INLOGGED IN` after the revoke — the instrument reads `#out` exactly), PASS on the branch; round 2 (review of b84c3f6de, HIGH-1) — a CLOSED gate inside #1529's nested-loop region of a keyed row (at the region body's root / nested in an element of it) × the inner list emptied / replaced / the row replaced under its key / emptied + refilled, each then revoked in a later run, 8 — main 4 FAIL (the body-root gate: its element was orphaned and stayed), branch 0; 910 shapes; S469 s469-structural-else-guard n27 — the privileged branch is the `else` / `else-if=` of an `if=` chain on `<engine>` / `<match>` / `<each>` (in markup, nested, an `<each>` row, a component body, lifted markup) or an `<each>`'s `<empty>`, or sits behind an `if=` on a host that does not gate (`<empty>`, `<errorBoundary>`, `<render>`, a compound-state wrapper), 43 — 41 FAIL on `b0cffc6a4`, all PASS-REFUSED after (E-CTRL-001 / E-CTRL-002 / E-GATE-UNSUPPORTED-HOST); 953 shapes; round 2 (review of `456158a63`) n27 +61 — the opener spellings the round-1 word scan disagreed with the markup tokenizer about (`else=""` / `"true"` / `${true}` / `(true)`, a bare `if` word, `data-x=if else`, `title="x"else`, `${ // it's }` and `/"/` in an engine `effect=`, `on=(@mode)else`) × markup / row / component body, a bare `<engine if>`, `if=` / `show=` on an engine state-child and a `<match>` arm, a gated component-body `<slot>` — 61 FAIL on `456158a63`, all PASS-REFUSED after; 1014 shapes; round 3 (review of `412b77b8b`) n27 +275 — an unquoted operator value (`data-z=a/`, `title=a/b`, `1+2`, `a?b:c`, `a&&b`, `a==b`, `a,`, `a;`) before an `else` / `else-if=` / `if=` on `<engine>` / `<match>` / `<each>` / `<b>` × markup / row / component body, the gate before it, the same on a `<match>` arm and an engine state-child, and case-variant gate names (`IF=`, `If=`, `ELSE`, `Else`, `ELSE-IF=`) on every element kind — 197 FAIL on `412b77b8b`, all PASS-REFUSED after; 1289 shapes; round 4 (review of `20fadd7b4`) n27 +142 — a value the tokenizer drops (`tabindex=-1`, `x=+1`, `x=.5`, `x=~1`, `x=)`, `x=]`) before an `else` / `else-if=` / `if=` on `<engine>` / `<match>` / `<each>` / `<b>` × markup / an `<each>` row, the same on a `<match>` arm and an engine state-child, 70 `key=` operator segments before a gate, and three order-independent `<each key=… in=…>` openers (legal and gated: PASS) — 109 FAIL on `20fadd7b4`, 0 after (138 PASS-REFUSED, 4 PASS); 1431 shapes; round 5 (review of `88d71e8ba`) n27 +26 — a stray `=` after an engine sigil value (`initial=.Active = if=…`, `= else`, `:if=`, `initial=-.Active`), `x=.A= if=` and a reserved-word value `x= else` on every element × markup / row, and an orphaned `=` on a `<match>` arm opener — 13 FAIL + 3 PASS-DENY (the arm opener rendered as text) on `88d71e8ba`, all PASS-REFUSED after; 1457 shapes; round 6 (review of `9be2cecf9`) n27 +6 — a whitespace (state) opener `< span if=…>` / `show=` / `IF=` / a dropped value before the gate, whose children rendered ungated (pre-existing, same on base) — all PASS-REFUSED; 1920 shapes; S470 s470-render-position-server-call-refused fix round 2 f8 — a server call reaching a gate through `<engine if=…>`, a module-init `if` assignment, or a module-scope member assignment, 3 — FAIL on `110dada2e`, PASS-REFUSED after (E-VALUE-SERVER-CALL); 1923 shapes; S470 s470-action-body-await f13 (f9 on the lane branch) — a server call (or an async-coloured client helper) tested in an ACTION body impl#1 lowered synchronously: module-init statements (a block, an `if` / `for` head, a call argument, `&&` / ternary, `Object.assign` / `push`, a lambda, a cell write, a cell declaration), an `<onMount>` tag, `<request>` / `<timer>` / `<poll>` / `<timeout>` bodies, a runtime `^{ }`, an engine state-child `effect=`, an `<onTransition>` body and guard, a message arm (24 — FAIL on `4058bd052`, PASS-REFUSED after, E-VALUE-SERVER-CALL), and a helper in a `when … changes` body / an engine opener `effect=` (2 — FAIL on `4058bd052`, now awaited: PASS / PASS-DENY, the boot-only effect runs before any click), and the server function IMPORTED from another file — a whole cell write at module init / in a `<request>` (the emitter's lift does not cover an import: refused) and a `when` / opener-`effect=` test (now awaited) (4 — FAIL on `4058bd052`); 1953 shapes; fix round 1 (review of `41255a64b`) f10 — a whole cell write inside a runtime `^{ }` (plain / under `if` / under `for`: lowered through `_scrml_cap.*`, which the reactive-set lift does not await), a LOCAL function whose body waits (a `const` lambda, a block lambda, a `function` value, a nested `function`, a lambda over a helper) declared in a state-child `effect=` / an `<onTransition>` / a message arm / a `^{ }` / a `when` body / the opener `effect=` and its result tested, an IIFE and a `forEach` callback over the call in a `when` body / the opener, and a `!{ }`-handled write in a `when` body (37 — FAIL on `41255a64b`, PASS-REFUSED after, E-IMPL1-ACTION-NOT-AWAITED); f13's refusals now read E-IMPL1-ACTION-NOT-AWAITED too (ruling S470 "Mint E-IMPL1 code"); 1990 shapes; fix round 2 (re-review of `f55eb8d4a`) f11 — an OPTIONAL call `isOk?.(…)` in the engine opener `effect=`, written into a cell / tested (emitted `_scrml_fetch_isOk_N?.(…)` with no `await`) (2 — FAIL on `f55eb8d4a`, PASS-REFUSED after); 1992 shapes; fix round 3 (delta review of `07ebed34b`) f12 — a C-style `for` head in the opener `effect=` holding a server call inside a template literal, emitted `for (let i = 0; $; i++)` (a file-level `const $` stands in for a page global) (2 — FAIL on `07ebed34b`, PASS-REFUSED after); 1994 shapes; fix round 4 (delta review of `37fa2154f`) f14 — a server call inside a callback inside a template-literal interpolation in a `when` body, alone (R3) and beside a decoy own-level call in a C-style `for` head (R2) (2 — FAIL on `37fa2154f`, PASS-REFUSED after by the accounting invariant)); S470 s470-render-residue-host-promises r19 (`r19-shapes.js`, family f25; the first round was f16, now its `G0` shapes) — the host `fetch` (SPEC §13.7 item 4) in a render position (`if=`, an interpolation, a derived cell, `globalThis.` / `window.fetch`, a helper that returns it, markup held in a `const` initializer) or in a synchronous action body (module init, `<timer>` / `<poll>` / `<request>` bodies, a `when` body, the engine opener `effect=`), and markup held as a VALUE whose unquoted attribute `${…}` was read as a bare `$` (a server call unseen, a plain condition dropped — a file-level `$` standing in for jQuery) (17 — FAIL on `6081e0685`, PASS-REFUSED / PASS after), plus 5 controls that must keep compiling (a fetch in a handler / `on mount` / a bare timer statement, the author's own `function fetch`, a local `fetch`); fix round 1 +51 — F1 a helper reaching `fetch` through the global object, F2 `fetch` used as a value (alias, destructure, `globalThis["fetch"]`, tape element, object member, returned, argument, `const` lambda), F3 a binding that IS the host `fetch` or a block-scoped `const fetch`, F4 a waiting function passed as a callback value (`@xs.some(isOkW)`), F5 `fetch` in a function body / handler / `on mount` / `when` / server function never awaited (status-reading shapes) — every one FAIL on `618bb573b` but one (refused there), PASS-REFUSED / PASS-DENY after, plus 11 VALID controls; two G0 shapes are BY_DESIGN_LOGS_IN now that `when` / opener `effect=` await `fetch`; +73 shapes). Data only; each family declares its `SIDE`. | Plus S469 s469-server-return-match-await (457 shapes): s4–s10 server, f1–f7 fullstack, l1–l5 library, t1–t5 tool — a failable `match` subject awaited in every position, `fail` payloads keyed per enum in every emission mode, one resolver for a callee's error enum, and the `_ e` whole-error binder allow-list.
| `r8-shapes.js` … `r15-shapes.js` | S470: `r8` (s11 / f9 / l6 / t6, 269 shapes) — the `_ e :>` whole-error binder allow-list escapes (s470-whole-error-binder-escapes); `r11` (s14 / f17 / l9 / t9, 121 shapes) — s470-typed-payload-binders (ruling "(B) Type the binders"): a member read other than `.variant` off an ENUM-typed value (a typed parameter / local / cell / struct field, a constructor, a call's result, a tape element, an imported enum) and a payload binder of a declared enum field (`match` and `!{}` arms, every binder spelling) — FAIL on `91c1c9ca4`, PASS-REFUSED after (E-TYPE-004); the r7 `VALID` controls re-stated without r7's `getReasonT` helper (a now-refused read); fullstack F4 (a `!{}` in a nested `<match>` in a `<match>` arm, falsely refused E-TYPE-031 before). The 18 escape-3 `KNOWN_FAIL` entries of r8 are PASS-REFUSED by the same rule. `r12` (s15 / f18 / l10 / t10, 91 shapes) — fix round 1: enum facts from the TYPE (aliases seen through; unit-variant / ternary / local returns; imported functions and consts; ternary / `lin` / destructuring / tape methods and callbacks / value `match` / closure results; `@x.advance` exempt on engine cells only, `.V.history` only in the restore form), FAIL on `7453d57ff`, PASS-REFUSED after; r7 declares `getReasonT` only for the shape that calls it (PIN-COV). `r13` (s16 / f19 / l11 / t11, 99 shapes) — fix round 2: an imported alias of an imported alias, `E | not` / bare-`return` / pass-through returns, recursive and cyclic returns (FAIL on `baef28219`, PASS-REFUSED after), and the review's fp2 programs as VALID controls. `r14` (f20 / l12 / t12, 16 shapes) — fix round 3: a function cycle inferred in any order, a struct field of an imported enum / alias / alias of an alias, an 80-file alias chain refused fail closed (FAIL on `73d4e2e2d`); the r11 VALID controls now call their `f`. `r15` (s18 / f21 / l13 / t13, 15 shapes) — fix round 4: an imported function inferred through its module's local helper or a cycle there, a 34 / 40-deep ternary and a 40-long `||` chain (FAIL on `3620e8670`). |
| `r21-shapes.js` | S470 s470-promise-all-batch-elements (s24 / f27 / l19 / t19, 107 shapes) — `g-promise-all-batch-puts-unawaited-call-under-sync-operator`: a client function's §13.2 `Promise.all` batch used each declaration's whole initializer as an element, so a server call under `?` / `!` / `&&` / `\|\|` / `??` / a comparison / an array or object literal / a call argument / a member or index read, an async-coloured helper under an operator, and an expression-position `!{}` were never awaited (f27, 26 BAD × `#out` text / a markup `if=` gate — FAIL on `ffbcf4432`, PASS after but the two h2/002 `!{}` shapes, KNOWN_FAIL on the sequential `!{}` lowering), plus 11 controls on every side (bare independent calls that must keep batching; operator results that ARE the Promise, right by accident on base). The BAD shapes are fullstack only: no other side batches. `r21-pinned.js` pins every shape's class. |
| `pack.js` | compile → client: happy-dom, click `#wrong` / `#right`, read `#out`; server: POST the `login` route; nav (n26): compile builds A and B separately, mount A, soft-navigate into B's page, click `#wrong`, read `#out` (`#right` = A's own control on a fresh document; the id-collision precondition is asserted, else UNJUDGED) → classify |
| `known-fail.js` | `KNOWN_FAIL` (shapes that log in on a wrong password today, each naming its gap), `UNJUDGED`, `BY_DESIGN_LOGS_IN` |
| `failable-probe-pack.test.js` | the gate: one test per shape |
| `classify.js` | the table, for refreshing `known-fail.js` or grading a branch (not a test) |

## Classes

`PASS` (correct) · `PASS-REFUSED` (compile error: fail closed; the detail carries the codes) · `PASS-500`
(server: the route fails at run time) · `PASS-DENY` (the wrong password does not log in and neither does
the right one: fail closed, a correctness defect or a probe whose callee is plain by design) ·
`UNJUDGED` (no `#wrong` button / no `login` route) · `FAIL` (the wrong password logs in).

Sides: `client` (happy-dom, no server), `server` (POST the `login` route), `nav` (a soft navigation
across builds), and `fullstack` (S469) — a client shape whose `fetch` is answered in-process by the
compiled `app.server.js` (`mod.fetch`, with the CSRF double-submit pair), so a client function calling a
SERVER function is judged end to end.

## What turns it red

- a shape not in `KNOWN_FAIL` / `BY_DESIGN_LOGS_IN` logs in on a wrong password;
- a `KNOWN_FAIL` shape stops doing so (it was fixed: delete the entry);
- a shape not in `UNJUDGED` comes out `UNJUDGED`, or an `UNJUDGED` one starts being judged;
- the corpus stops holding exactly 3561 shapes (`EXPECTED_SHAPE_COUNT`); a list entry names no shape. Plus S469 s469-server-return-match-await (457 shapes): s4–s10 server, f1–f7 fullstack, l1–l5 library, t1–t5 tool — a failable `match` subject awaited in every position, `fail` payloads keyed per enum in every emission mode, one resolver for a callee's error enum, and the `_ e` whole-error binder allow-list.

It deliberately does NOT pin each shape's class: a shape moving from `PASS-REFUSED` to `PASS` is a
compiler improvement, not a regression.

`BY_DESIGN_LOGS_IN` names three reviewer probes whose own logic logs in on `"wrong"` (written to probe
ACCEPTANCE of a widened `match` subject). They are refused today; a compiler that correctly accepted
them would show `LOGGED IN`, which is right, so the floor is not asserted for them.

## Measured (S468 fix round 1)

| tree | PASS | PASS-REFUSED | PASS-500 | PASS-DENY | UNJUDGED | FAIL |
|---|---|---|---|---|---|---|
| base `5c43c3b8e` | 28 | 84 | 1 | 10 | 2 | 63 |
| frozen review head `7ecae57eb` | 53 | 69 | 1 | 13 | 5 | 47 |
| fix round 1 | 33 | 120 | 1 | 8 | 2 | 24 |

No shape that is not `FAIL` on base is `FAIL` after the fix round.

## Measured (S469, fix round 1 agent 2 — 226 shapes)

| tree | PASS | PASS-REFUSED | PASS-500 | PASS-DENY | UNJUDGED | FAIL |
|---|---|---|---|---|---|---|
| `181012c20` (imported failable fixed, handler / server-statement not) | 45 | 132 | 1 | 8 | 2 | 38 |
| after (handler-attribute `match` + server statement `match`) | 60 | 134 | 1 | 8 | 2 | 21 |

The 21 are the `VALUE` class (`g-failable-function-used-as-value-unchecked-s468`, ruling owed).

## Measured (S469 fix round 2 — 265 shapes)

| tree | PASS | PASS-REFUSED | PASS-500 | PASS-DENY | UNJUDGED | FAIL |
|---|---|---|---|---|---|---|
| after F4 (E-IMPL1-FAILABLE-FN-VALUE) + H2 + H3 + the `const`-alias handler check | 75 | 181 | 0 | 7 | 2 | **0** |

`KNOWN_FAIL` is empty: bryan ruled F4 (ruling:user-voice-scrml.md S469 "Split + audit") and impl#1 refuses a
failable function read as a value outside callee position except a `const` alias by name — the 21 `VALUE`
shapes are PASS-REFUSED. n13's call-ref and reference shapes were accepted on `00363bc75` with the error
dropped (PASS-DENY there — this instrument observes a login, not a dropped error); they are refused now. `n11` showed
the handler hole was wider than `n3/handler direct`: every one-statement handler value form logged in at top
level, in an `<each>` row, in a component body and under `if=`; each now discriminates the error or is refused
(a component body's one-statement value and a block-bodied arrow: E-ERROR-002).

## Measured (S469, n19 — nested `<each if=…>`)

| tree | n19 PASS | n19 FAIL |
|---|---|---|
| base `ea871fdfe` | 0 | **10** — the nested list rendered LOGGED IN before any password and after a wrong one |
| after (`g-nested-each-if-guard-dropped-s469`) | 10 | 0 |
| main `55dc84f69`, 18 shapes (+ F1 stale lifted item, + F4 `else`) | 0 | **18** |
| after the review-of-67bbca342 round (F1 + F4) | 14 (+ 4 PASS-REFUSED, E-CTRL-001) | 0 |

Not a failable defect: the guard was dropped whatever it held. It lives here because the pack is the
wrong-password floor, and the handled-failable form is the shape an adopter writes.

## Measured (S469, n20 — `<match if=…>` in an `<each>` row)

| tree | n20 PASS | n20 FAIL |
|---|---|---|
| main `7ede5c5c1` | 0 | **22** — the row's arm rendered LOGGED IN before any password and after a wrong one |
| after (`g-structural-if-inside-each-row-template-fails-open`, the `<match>` half) | 22 | 0 |

The `<empty>`-body shapes also failed for a second reason on main: a `<match>` there got the
module-scope dispatcher while emit-each called it in the item-scoped form, so it rendered nothing at
boot and, after a scrutinee change, rendered ungated.

## Measured (S469 round 2, n21 — a nested / multi-root row `if=`)

| tree | n21 PASS | n21 FAIL |
|---|---|---|
| main `7b1838470` | 0 | **28** — the guard was evaluated once at row creation, so revoking it left LOGGED IN |
| after (`g-each-nested-peritem-if-not-reactive`, `g-each-peritem-if-multiroot-deferred`) | 28 | 0 |

An `<empty>`-body nested `if=` was measured too and is not in the family: it already passed on main (the
each render fn rebuilds the `<empty>` body), so it is not a probe of the defect.

## Measured (S469, n22 — a stale effect of removed content)

| tree | n22 PASS | n22 FAIL |
|---|---|---|
| main `29b6320ad` | 0 | **9** — an effect created inside a removed row / torn-down arm kept running and granted on the next write |
| after (`g-row-and-arm-effect-scopes-never-disposed-s469`, the owner-scope tree) | 9 | 0 |

Round 2 (F1, the over-disposal direction) added 2 shapes — a top-level `<match>` / `<engine>` whose first
dispatch is fired by a row's template during the boot render. PASS on main `29b6320ad`; **FAIL** on round 1
`ffbe1cf2b` (the arm was filed under the writing row, so removing the row killed its wiring and the guard
text stayed "LOGGED IN" after the revoke); PASS after (an in-document mount takes its STRUCTURAL owner).

Not a failable defect either: the page's own `grant` is plain. The probe is that content the revoke REMOVED
must not act again; every shape grants only through an effect the revoke should have disposed.

## Measured (S469, n23 — a markup `if=` in lifted markup)

| tree | n23 PASS | n23 FAIL |
|---|---|---|
| main `29b6320ad` | 0 | **62** of the first 62 (measured before the round-2 shapes) — 59 kept LOGGED IN in `#out` after the guard was revoked (a `style.display` toggle; for a call-ref `if=allowed(@pw)` or a quoted `if="allowed(@pw)"` no gate at all — the value was written as an `if` attribute); the 3 lifted-`<each>`-root shapes crashed the harness (`ReferenceError: y is not defined` — the `<each>` was built as a literal element). The 4 value-indexed ROW-side shapes stayed open after the row was revoked even on the structural swap's first cut: the value bucket was registered once under the create-time `r.k` |
| round 1 `f2226103b` (99 shapes) | 84 (+ 1 PASS-REFUSED) | **14** — every `if=granted()` / `if=(granted() && true)` outside a reconciled row: the gate subscribed only to the `@name` tokens in the attribute text, so a cell read inside the called function was never a dependency |
| round 2 `060495fe2` (112 shapes) | 104 (+ 1 PASS-REFUSED) | **8** — the round-3 body-local shapes in a plain group and a row: the gate's own effect re-read the local's FINAL value |
| after round 3 (112 shapes; body locals snapshot at render) | 111 (+ 1 PASS-REFUSED) | 0 |
| round 3 `e7c7f7a28` (124 shapes) | 117 (+ 1 PASS-REFUSED, 2 PASS-DENY) | **4** — a local closure (flag / counter) in a plain group and a row: the snapshot skipped callees, and a closure reads its locals by reference |
| after round 4 (124 shapes; a gate with any unclassified name is read inline) | 123 (+ 1 PASS-REFUSED) | 0 |
| after round 5 (124 shapes; main's evaluation placement, swap instead of display) | 87 (+ 1 PASS-REFUSED) | **36**, all in `KNOWN_FAIL` — positions stale on main (a cell read only in a called function, a value-indexed row field, a body local in a keyed row): `g-lift-gate-placement-inherits-main-staleness-s469` |
| after round 2 (99 shapes; every gate a tracking effect) | 98 (+ 1 PASS-REFUSED: a quoted `if=` on a lifted `<each>` root is E-CG-003, the `<each>` reader's refusal) | 0 |

The pack reads `#out`'s `textContent`, which includes a `display: none` element — so a display toggle is a
FAIL here exactly as the SPEC means it (§17.1: the element is absent while the condition is false).

## Measured (S469 s469-server-return-match-await — s4 server, f1 fullstack; 81 shapes)

A `match` whose SUBJECT (or an arm value) is an async call — a `!` function, a server function, a member
read off one — at every expression position, and the payload binders of its arms
(`g-server-return-match-failable-subject-unawaited-s469`).

| family | tree | PASS | PASS-REFUSED | PASS-500 | PASS-DENY | FAIL |
|---|---|---|---|---|---|---|
| s4 (48) | base `b35babcc2` (#1524) | 14 | 17 | 3 | 1 | **13** |
| s4 (48) | after | 33 | 15 | 0 | 0 | 0 |
| f1 (33) | base `b35babcc2` | 5 | 6 | 0 | 1 | **21** |
| f1 (33) | after | 23 | 8 | 0 | 0 | **2** (KNOWN_FAIL, render time) |

The value IIFE lowered its subject in a context with no async fact, so `return match check(k) { … else :>
"ok" }` evaluated `check(k)` unawaited — a Promise, whose tag reads `.Ok` — and a denied input ran `else`.
The client's expression bridge dropped the facts the same way (`v = match …`, an argument, an operand, a
cell write). Every match lowering now lowers its subject in ONE context (`matchSubjectCtx`); arm values
carry the same facts and the declaration path's arm await. The server pass now publishes the file's
variant field registry, so a `fail` payload is field-keyed (§51.3.2 / §57.8) and `.Denied(r)` /
`.Denied(reason: r)` bind it; a binder §18.7 rules out is E-TYPE-021 / E-TYPE-022 / E-TYPE-027. The two
remaining FAILs are a RENDER-time match on a server call (a markup interpolation, a derived cell) — no
function body to await in, the class of `g-markup-gate-tests-server-call-promise`; filed
`g-render-match-async-subject-unawaited-s469`.

## Measured (S469 s469-server-return-match-await round 2 — s5 server, f2 fullstack; 54 shapes)

The review of `bc33320a7` (round 1) found two regressions and one in-scope miss; each is a family here.

| family | base `b35babcc2` FAIL | round 1 `bc33320a7` FAIL | round 2 FAIL |
|---|---|---|---|
| s5 (17) | 3 | 3 | 0 |
| f2 (37) | 13 | 17 | 3 (KNOWN_FAIL: an ASYNC helper in `if=` / a derived cell — the existing render-time class) |

- **The payload shape across files** (HIGH 1, regression): round 1 keyed a `fail` payload only in the
  file that declares the enum, and bound an importer's single positional binder to the whole `.data`
  — a keyed object, so `x == "bad"` was false and a denied input logged in (server `return match`,
  `!{}` on both boundaries). Now every `fail` keys by the declaring enum (`getEnumVariantFieldSchema`,
  local or imported) and every reader binds by the handled call's DECLARED error enum (TS stamps a
  failable match subject and, new, a `!{}` node — an imported callee's enum resolved in its exporting
  file); with no visible field list a positional binder is E-TYPE-027, never a guess. The "producer
  imports the enum" shapes stay PASS-500: the producer's server bundle imports a `types.server.js`
  that is never written (`g-server-js-imports-module-without-server-file-s467`).
- **A member call in a match arm** (HIGH 2, regression): `q.includes("ecre")` in an arm was read as a
  call of `server function includes` (a `\bname\s*\(` scan), so a sync helper was coloured async and
  `if=` / derived guards read a Promise. Arm callees are now read from the parsed arm tree; that also
  fixed the base-side instances (`return match` / `const v = match` arms: FAIL on base).
- **A nested `match` as an arm value** (HIGH 3): its subject went through the client's text lowering,
  unawaited; it is now lowered structurally through `matchSubjectCtx`.

`pinned-class.js` pins the class of every s4 / f1 / s5 / f2 shape.

## Measured (S469 s469-server-return-match-await round 3 — s6 / f3 / l1 / t1; 42 shapes)

One shape list (`r3-shapes.js`) on four sides, two of them new: `library` (compiled `--mode library`, the
emitted `app.js` imported and its `login` called) and `tool` (a `<program kind="tool">` run as
`bun app.js <p>`). FAIL counts, base `b35babcc2` → round 2 `b3712d7b3` → round 3:

| family | base | round 2 | round 3 |
|---|---|---|---|
| s6 (server, 12) | 6 | 2 | 0 |
| f3 (fullstack, 12) | 10 | 4 | 0 |
| l1 (library, 9) | 3 | 6 | 0 |
| t1 (tool, 9) | 1 | 2 | 0 |

Round 2's regressions were single-file: library / tool mode never installed the per-file variant
registry, so a `fail` wrote the bare value while the (TS-stamped) reader read `data.<field>`; and the
§19 short-form arm bound its synthesized `e` to the whole `.data`. Now the producer's payload shape is
decided once, from the TS-resolved enum (`__failVariantFields`), in every mode, and the short form
projects its one field. Also fixed: `?` across two enums with a same-named variant of different fields
(E-ERROR-010) and a server call in a template literal inside a match-arm value. A bundle that imports
a never-written `<x>.server.js` is UNJUDGED (with the gap id), not pinned PASS-500.

## Measured (S469 s469-server-return-match-await round 4 — s7 / f4 / l2 / t2; 32 shapes)

`r4-shapes.js` on four sides. FAIL counts, base `b35babcc2` → round 3 `048dba21a` → round 4:

| family | base | round 3 | round 4 |
|---|---|---|---|
| s7 (server, 9) | 1 | 6 | 0 |
| f4 (fullstack, 9) | 4 | 7 | 0 |
| l2 (library, 7) | 1 | 4 | 0 |
| t2 (tool, 7) | 1 | 6 | 0 |

`?` into an enum whose same-named variant has different fields is refused (E-ERROR-010) through a type
alias on either side and for a cross-file callee (one resolver for a failable callee's error enum);
the same field names in another order are accepted (payloads are keyed by name). A tagged template's
server call in a client arm value is awaited; a short-form arm reading its implicit `e` inside a
template is refused when there is no single field to bind. The library / tool loaders report a module
that cannot load as UNJUDGED (with the gap id), and the tool runner judges stdout before the exit code.

## Measured (S469 s469-server-return-match-await round 5 — s8 / f5 / l3 / t3 and s9 / f6 / l4 / t4; 100 shapes)

`r5-shapes.js` (the whole-error binder `_ e :>`, ruling "SPEC: whole error + refuse") and `r6-shapes.js`
(the review of `cf01c66b8`) on four sides. FAIL counts, base `b35babcc2` → round 4 `cf01c66b8` → round 5:

| family | base | round 4 | round 5 |
|---|---|---|---|
| s8 (server, 7) | 3 | 2 | 0 |
| f5 (fullstack, 7) | 3 | 2 | 0 |
| l3 (library, 7) | 3 | 2 | 0 |
| t3 (tool, 7) | 0 | 0 | 0 |
| s9 (server, 18) | 4 | 15 | 0 |
| f6 (fullstack, 18) | 8 | 15 | 0 |
| l4 (library, 18) | 2 | 9 | 0 |
| t4 (tool, 18) | 3 | 14 | 0 |

`_ e :>` binds the whole error: a payload-field read off it is E-TYPE-004, a comparison with a primitive
E-EQ-001, and `e is not` over a unit variant is correct. `?` compares error enums by identity (never by
name) and each re-raised field by name AND type; a callee whose enum cannot be resolved (an alias in a
third file) is refused rather than guessed. The short form's "arm reads `e`" walk fails closed on any node
it does not model (an object shorthand, a nested `match` arm). The t3 valid shapes are refused on every
tree (a tool function's `return match` takes the async IIFE header; `g-impl1-async-match-positions-refused-s469`).

## Measured (S469 s469-server-return-match-await round 6 — s10 / f7 / l5 / t5; 148 shapes)

`r7-shapes.js` (the review of `716ee804e`) on four sides. FAIL counts, base `b35babcc2` → round 5
`716ee804e` → round 6:

| family | base | round 5 | round 6 |
|---|---|---|---|
| s10 (server, 37) | 15 | 23 | 0 |
| f7 (fullstack, 37) | 14 | 23 | 0 |
| l5 (library, 37) | 11 | 17 | 0 |
| t5 (tool, 37) | 15 | 22 | 0 |

The whole-error binder `_ e :>` is checked by an ALLOW-list that fails closed (`match e` over its
variants, `is`, `e.variant`, a variant constructor / local function typed with the same enum, `log`);
every payload read, comparison, container, alias and cell write is refused. `match e` binds by the
handled call's identity-resolved enum (never a same-named local enum) and works with no local enum.
`?` compares canonical field types. 10 cross-file shapes are UNJUDGED (the bundle / module cannot load:
`g-server-js-imports-module-without-server-file-s467`, `g-library-tool-cross-file-import-source-path-s469`);
their single-file-loadable twins PASS. s8 / l3 "held in a local then passed on" is now PASS-REFUSED (a
local alias is not an allowed use).

## Measured (S470 s470-bang-catch-try-body — n29 / s13 / f16 / l8 / t8; 312 + 28 + 20 shapes)

`r10-shapes.js` (gap `g-impl1-bang-catch-try-body-cut-at-first-brace-s470`) on five sides: the statement
form `!{ tryBody } catch T [as b] { handler }`. The try body held a nested `!{}`, a block, an object
literal, a template / string / comment with a brace, a nested `match` or a nested catch; the handled
call wrote its result into a field read after the form, so a dropped handler logged a wrong password in.

| family | base `d582ae04f` | head |
|---|---|---|
| n29 (client, 77) | 29 FAIL, 4 PASS, 17 PASS-REFUSED, 27 PASS-DENY | 77 PASS-REFUSED |
| s13 (server, 54) | 17 FAIL, 14 PASS-REFUSED, 23 PASS-DENY | 54 PASS-REFUSED |
| f16 (fullstack, 57) | 17 FAIL, 17 PASS-REFUSED, 23 PASS-DENY | 57 PASS-REFUSED |
| l8 (library, 62) | 16 FAIL, 30 PASS-REFUSED, 16 PASS-DENY | 62 PASS-REFUSED |
| t8 (tool, 62) | 21 FAIL, 4 PASS, 14 PASS-REFUSED, 23 PASS-DENY | 62 PASS-REFUSED |

On base the try body was cut at its first `}` (the handled call lost its handler, the catch arms were
dropped), the form written after a statement was glued to it as a postfix handler (the body dropped),
and the catch could never handle a scrml failure anyway (a failable call RETURNS its error). **S470
ruling: the form is refused** — E-TRY-NOT-IN-SCRML, SPEC §19.1 "There is NO try/catch". It is detected
from the block splitter's record of where it read the try body and each `catch` arm
(`errorEffectExtent`), so it is found after a statement, nested, with braces in strings / comments, in a
handler, at module init, on every side. 293 shapes carry E-TRY-NOT-IN-SCRML; the other 19 hold the form
where impl#1 keeps the code as TEXT (an `onclick={…}` block, an engine `effect=`) or hit the splitter's
template-literal limit (a lone `` `}` ``: E-CTX-001) and are refused by that reader instead — still
fail closed. A shape that compiles is a detection miss.


**Round 3 (review of `3e52bcc45`) — groups 14–16, 28 shapes, every one FAIL on `3e52bcc45`:**
- 14 (F1, client / fullstack / library): `! { … }`, `! { … } catch …`, `! ( … )`, `!` + newline + `{`,
  `!` + comment + `{` after a declaration. The collector merged the `!` line into the declaration and
  the expression reader dropped it (the server and tool sides already refused it). Now a `!` on a later
  line after a value starts its own statement (JS ASI: `a !b` is no expression); a gapped `! {` is
  refused at the `!` (E-ERROR-014, or E-TRY-NOT-IN-SCRML when a `catch` follows); `! ( … )` is refused
  since round 4 (E-STMT-UNEXPECTED-TOKEN, below).
- 15 (F6, every side): a `!{ arms }` attached to no expression (a braceless `if` body, the first
  statement of a block) emitted `try { } catch (e) { arms }`: E-ERROR-014 now.
- 16 (F4, client / fullstack / library): the form in a for-of head, consumed as text: E-TRY-NOT-IN-SCRML
  now (every statement-form block a body's token run holds is refused, whichever reader reached it).

**Round 4 (re-review of `d102fa286`, R1) — group 17, 20 shapes:** a MISSING OPERATOR before a `!` on
the next line (`const ok = isMember⏎  !banned`, `!(banned)`, the value in an `if`, after a `return`).
SPEC §7.2.2 rule 4: a newline is whitespace, so it reads `isMember !banned` — no expression. On
`d102fa286` the `!` line became its own no-op statement on every side (FAIL); on origin/main the client /
library / fullstack sides swallowed and dropped it (FAIL) while server / tool refused it. PA ruling: a
`!`-led statement after a value-ending line with no `;` is refused (E-STMT-UNEXPECTED-TOKEN, `! ( … )`
included) — so group 14's `! ( … )` shapes are PASS-REFUSED now too. A `!`-led statement after a `;` or
at a block start, and a next-line postfix `!{ … }`, are unaffected.

Head: 360 PASS-REFUSED (360 shapes).

## Measured (S470 s470-async-colouring-scope — s12 / f15 / l7 / t7; 415 shapes)

`r9-shapes.js` on four sides (`g-impl1-async-colouring-ignores-local-shadow-s469`). Async colouring
(§13.2) read callees by NAME: a helper calling a LOCAL `check` (a `const` / `let` / bare-assignment
arrow, a function expression, a parameter, a nested `function`, a block-scoped local, a lambda
parameter) beside an async file-scope `check` was coloured async. Two directions: SHADOW shapes (the
helper must be sync) and DUAL shapes (the call names the async function — a shadow in a sibling block /
a nested function / a lambda / a sibling top-level function, a use before the shadow, a closure, an
alias, a parameter handed the async function — the helper must stay async; every DUAL helper tests the
call's result itself, so a helper wrongly made sync logs the wrong password in). Base `6081e0685` →
head, class transitions:

| family | base FAIL | head FAIL | PASS-REFUSED → PASS | PASS-REFUSED → PASS-DENY | unchanged |
|---|---|---|---|---|---|
| s12 (server, 42) | 0 | 0 | 0 | 0 | 42 |
| f15 (fullstack, 221) | 0 | 0 | 32 | 10 | 179 |
| l7 (library, 76) | 0 | 0 | 10 | 0 | 66 |
| t7 (tool, 76) | **1** | 0 | 10 | 0 | 65 |

The over-colouring was fail-CLOSED after #1547 / #1554: a shadowing helper was refused in a render
position (E-VALUE-SERVER-CALL), in a parameter default (E-PARAM-DEFAULT-AWAIT) and in a synchronously
emitted action body (`<request>`, E-IMPL1-ACTION-NOT-AWAITED) — those are the 52 PASS-REFUSED → PASS and
the 10 → PASS-DENY (the `<request>` probe denies the right password too, its VALID control included: it
measures the refusal, not the run). Every DUAL helper in a render position or a `<request>` body is still
refused, and in a `when … changes` body (an async host) still awaited. The one FAIL on base is a tool-mode fail-OPEN of the same root in the other
direction: every tool function body shared ONE `declaredNames` set, so a `const check` in one function
made a later function's call of the async `check` read as that local and emitted it without `await`
(`t7/dual shadow in a sibling top-level function, direct`). No shape moved toward FAIL. Instrument check
(a mutation reading `check` / `verify2` as bound everywhere — a by-name "fix"): 18 / 16 / 18 DUAL shapes
FAIL on f15 / l7 / t7. The server side does not FAIL under that mutation (its in-process peer awaits do
not read this colouring), so s12 pins its classes only. Still refused, by consumers this lane did not
change (fail closed): a lambda calling a parameter / local named like a server function
(E-SERVER-FN-IN-SYNC-CALLBACK / E-ASYNC-STDLIB-IN-SYNC-CALLBACK — the sync-callback drain reads names),
a function value in a tape / object (E-VALUE-FUNCTION-STORED), a `for` / destructured binder
(E-ASYNC-FN-ESCAPES-AS-VALUE — the escape check reads names). `r9-pinned.js` pins every shape's class.

## Running

```sh
TMPDIR=$HOME/.cache/<scratch> bun test compiler/tests/integration/security-failable-pack/
TMPDIR=$HOME/.cache/<scratch> bun compiler/tests/integration/security-failable-pack/classify.js [--json] [filter]
```

~15 s for 388 shapes on a loaded dev machine, so it rides the pre-commit `integration` set.

## Measured (S469 s469-engine-effect-failable — n18, 45 shapes)

| tree | PASS | PASS-REFUSED | PASS-500 | PASS-DENY | UNJUDGED | FAIL |
|---|---|---|---|---|---|---|
| base `b75ad70f7` | 3 | 14 | 0 | 9 | 0 | **19** |
| after | 11 | 31 | 0 | 3 | 0 | **0** |

The 14 shapes added for the review of 6e0770356 (text-lowered slots and a quoted guard): on main
`d10936fdb`, 11 FAIL (the handled guard in `to=` / `from=` / engine-direct / `once` form, the quoted
`if="false"`, `derived=` paren and bare, `<engine if=>`, `<match if=>`, `<match on=>` paren and
interpolated), 1 PASS-REFUSED, 1 PASS-DENY, and `derived match` throws at run time (it crashes the
harness on main). After: 13 PASS-REFUSED, 1 PASS-DENY (`delay handled`: the timer is lost, see
`g-ontimeout-after-brace-loses-timer-s469`), **0 FAIL**. Whole pack: 374 shapes, 0 FAIL.

Every body the compiler kept as raw text in an `<engine>` (a state-child / opener `effect=`, an
`<onTransition>` body and `if=` guard, a `(state × message)` arm, a computed `<onTimeout after=>`,
a `:`-shorthand state body) or a `<match>` (an arm body, bare or `:`-shorthand, and the handlers in
it) is bounded by acorn (`interpolation-extent.ts`, the one reader shared with the template-interpolation slicer), parsed once (`engine-body-reader.ts`,
`arm-body-reader.ts`), walked by the failable check and lowered from the same nodes. The handled
forms (`check(p) !{…}`, a `match` on the call) went from refused or silently wrong to PASS.

## Measured (S469, n26 — a soft navigation across a build boundary)

| tree | n26 PASS | n26 FAIL |
|---|---|---|
| base `cd040ea25` (main `0ff6c93aa` + test-only #1511) | 0 | **5** — B's page swapped in, no hard navigation, the wrong click LOGGED IN (A's `grant()` ran on B's colliding id) |
| s469-softnav-build-guard | 5 | 0 — every entry point hard-navigates before applying B's page (`data-scrml-build`, SPEC §20.8.2 step 0) |
| round 1 head `095c96407` + shape 6 (review F1) | 5 | **1** — `ungated chunk under a matching page`: the chunk never refused, so the soft nav completed with it |
| round 2 (every nav-loaded chunk must advance the admit count) | 6 | 0 — "build unverified" → hard navigation |

Shape 6 is judged `accepted` (pack.js `nav.judge`): its floor is "a chunk that never admitted its build never joins the page", so a soft navigation that completes with it is the FAIL whatever `#out` reads.

`g-soft-nav-cross-build-handler-id-collision-s469`. The `nav` side is the login restated for a deploy:
"wrong" is B's harmless button, "right" is A's own privileged control.

## Measured (S469, n27 — a gated branch on an element that never read the gate)

| tree | n27 PASS-REFUSED | n27 FAIL |
|---|---|---|
| base `b0cffc6a4` | 2 (an `<engine else>` in lifted markup — the lift backstop) | **41** — the `else` / `else-if=` of a structural element and the `if=` on `<empty>` / `<errorBoundary>` / `<render>` / a compound-state wrapper were dropped; LOGGED IN on the wrong password |
| s469-structural-else-guard round 1 `456158a63` (+61 round-2 shapes) | 43 | **61** — every round-2 spelling / position: the word scan misread the opener |
| s469-structural-else-guard round 2 `412b77b8b` (+275 round-3 shapes) | 179 (+3 PASS) | **197** — the reader's own refusal (E-ATTR-UNQUOTED-OPERATOR) was dropped on the structural openers, so the gate after an operator value vanished; case-variant names were not gates anywhere |
| s469-structural-else-guard round 3 `20fadd7b4` (+142 round-4 shapes) | 411 (+1 PASS) | **109** — a dropped value's E-ATTR-001 was not forwarded, so the gate became the previous attribute's value; the slot cap failed open |
| s469-structural-else-guard round 4 `88d71e8ba` (+26 round-5 shapes) | 525 (+6 PASS, 3 PASS-DENY) | **13** — an orphaned `=` + value was skipped silently by the attribute parser, the gate inside it lost |
| s469-structural-else-guard round 5 | 543 (+4 PASS) | 0 — no attribute token is ever silently skipped (E-ATTR-001); the sigil exemption exact |

`g-structural-element-if-chain-and-show-composition-nominal`, `g-if-on-structural-element-silently-ignored`.

## Measured (S470 s470-promise-all-batch-elements — r21, s24 / f27 / l19 / t19; 107 shapes)

`g-promise-all-batch-puts-unawaited-call-under-sync-operator`. A decl joins the client `Promise.all` batch
only when its element is a bare call (the whole initializer, call-free arguments) or holds no call at all;
an independent decl with a call anywhere else ends the batch and is emitted in place, every call awaited.

| family | base `ffbcf4432` | after |
|---|---|---|
| f27 BAD (52: 26 × `#out` / `if=` gate) | **52 FAIL** | 50 PASS, **2 FAIL** (KNOWN_FAIL: h2/002, the sequential `!{}` lowering) |
| f27 controls (22) | 22 PASS | 22 PASS |
| s24 / l19 / t19 controls (11 each) | 33 PASS | 33 PASS |

The BAD shapes were measured on the server / library / tool sides too and PASS on base (no batch there;
the server side's `!{}` shape PASS-500), so they are fullstack only.
