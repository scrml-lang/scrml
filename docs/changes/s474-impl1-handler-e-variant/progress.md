# progress — s474-impl1-handler-e-variant (append-only)

## 1. Startup (main 34ebef81d)
pwd/toplevel/clean/merge-base OK; bun install; pretest OK.

## 2. Phase 1 — reproduce: NOT REPRODUCED on main `34ebef81d`

Reproducer (two files, flogence shape): `.tmp/repro/lib.scrml` (`<db src="./app.db" tables="item">`,
`export function listItems() { return ?{…}.all() }`), `.tmp/repro/viewapp/view.scrml`
(`<program db="../app.db">`, `import { listItems } from '../lib.scrml'`, local `fetchLocal()` with `?{}`,
`load()` with `@x = listItems() !{ | _ e :> { … e.variant … } }` and the same on `fetchLocal()`).

| source | main `34ebef81d` | `dbc037e18^1` (before #1658) | `dbc037e18` (#1658 merged) |
|---|---|---|---|
| repro, `e.variant` on imported + local | exit 0 | E-TYPE-031 ×2 ("cannot be resolved here") | exit 0 |
| repro, `e.message` on imported + local | E-TYPE-004 ×2 | E-TYPE-031 ×2 | — |
| flogence `view.scrml` as committed now (scratch copy) | exit 0 | — | — |
| flogence `view.scrml` now + `e.variant` re-added on both arms | exit 0 | — | — |
| flogence `view.scrml` pre-`7e23647` (3 arms, `e.message`) | E-TYPE-004 ×2 + E-TYPE-031 (shim arm, :59) | — | — |
| same, `e.message` → `e.variant` | E-TYPE-031 ×1 (shim arm `fetchShim()`, :59) | E-TYPE-031 ×3 | E-TYPE-031 ×1 (shim) |

flogence measured at their `7e23647` (2026-10-29 09:18 -0600); scrml's fix `4f4314dab` ("type _ e :> on a
client call to a plain server function by its failure set", flogence S60 report — this same report) is
2026-10-29 14:50 -0600, merged as #1658; run-time half #1664 (transport routing). So the report was REAL
and is already FIXED. Compile-half tests already exist: `compiler/tests/unit/whole-error-binder-server-call-s473.test.js`.

Residual: the flogence probe's THIRD arm, `fetchShim() !{ _ e :> … e.variant … }`, still E-TYPE-031. `fetchShim`
is a client-placed function that only returns `listArcs()`; it is not server-placed and not `!`, so the call
cannot fail: SPEC §19.4.3 (S451 ruling 3) makes that `!{}` E-ERROR-013 (Nominal on impl#1,
`g-impl1-handler-on-non-failable-s451`). impl#1's fail-closed E-TYPE-031 there is a wrong-code divergence of
an already-filed gap, not an `e.variant` gap. (Also: `return listArcs()` inside client `fetchShim` is an
unhandled client→server call — §19.9.10 E-ERROR-002 — impl#1 accepts it: `g-impl1-client-server-call-not-failable-s451`.)

## 3. Tests + run-time proof
NEW `compiler/tests/unit/handler-e-variant-imported-sql-callee-s474.test.js` (6): compile-clean flogence shape
(`e.variant` imported, `e is .Transport` local, `.Transport :>` imported); `e.message` E-TYPE-004 ×2; the shim pin
(E-TYPE-031); RUN TIME with a REAL failing query (table dropped under the compiled server, answered by the real
route handlers + the build server's fixed-500 error handler): every arm runs with `Transport`; the stub value is
`{type:"ServerCallError", variant:"Transport", data:{t:{variant:"ServerFault", data:{status:500}}}}`; no server text.
Red/green: `dbc037e18^1` 0/6; `dbc037e18` 4/6 (run-time pair red — #1664 not in); main 6/6.
Real served build (`scrml build .tmp/e2e` → `_server.js` on :38474): route 200 with rows; after `DROP TABLE item`,
`HTTP/1.1 500`, `text/plain`, body `Internal Server Error` (no SQL text) — the response the test's fetch mirrors.

Corpus delta: no compiler source changed → identical compiler, delta 0 by construction (not re-run).

## 4. Sibling finding (NOT fixed — out of the reproduced scope; surfaced to PA)
flogence's `listArcs` / `fetchLocal` (`return ?{…}.all()` in a function NOT declared `!`) are themselves
E-ERROR-002 under §19.8.3 ("an unhandled `?{}` SHALL be a compile error") — impl#1 gap
`g-impl1-sql-unhandled-outside-failable-s451`. The SPEC's own fix (§19.8.3 item 3) is
`function listArcs()! -> SqlError { … }`. Probed on main: with `! -> SqlError` on the imported AND the local
callee, `_ e :> … e.variant …` is E-TYPE-031 ×2 ("the handled call's error enum cannot be resolved here")
(`.tmp/bang/`). §18.6.1 bullet 1 types the binder as the declared error enum (`SqlError`), and for a client
call bullet 3 adds `Transport`. Root: `resolveErrorEnumThroughAliases` → `resolveFailableErrorType` deliberately
gives the compiler-provided names (`Error`/`SqlError`/`ServerCallError`, `COMPILER_ERROR_TYPE_NAMES`) NO
variant set (type-system.ts ~:1636 comment: "turning them on is newly-rejecting beyond S466's scope"), so
`wholeBinderCalleeEnum` returns null for `! -> SqlError`. So the moment flogence moves to the SPEC-correct
shape, `e.variant` breaks again.
