# s473-impl1-transport-routing — progress (append-only)

Branch from `s473-impl1-imported-handler-arm` (#1661 @ `df1e9422c`). PR base: that branch.

Ruling (verbatim, ../scrml-support/user-voice-scrml.md, "⭐ RULED — S473 PA recs: host allowlist Q1–Q4,
plain-logic DOM sinks, impl#1 transport routing" item 3): "**impl#1 transport routing (s451), narrow:**
only a `!{}` that already covers the failure (a `_` or `.Transport` arm) gets a failed call to a NON-`!`
server function as a `Transport` error value. Declared-`!` callees, `?`, `match` and CPS-split callees
are out of scope (they stay with the bootstrap's U1b). Unhandled call sites are unchanged."

Governing SPEC §19.9.10: "For an `f` not declared `!`, the failure set is `Transport(t: ServerCallError)`
alone." · the three kinds (no response → `Unreachable`; a non-2xx not the `fail` envelope → `Refused`
(4xx) / `ServerFault` (5xx); a body that does not decode → `Malformed`) · "A request the client itself
aborts on supersede or teardown … is not a failure".

## 2026-10-29 — build

- type-system.ts: `transportRoutableCallee(name)` — one local decl, or the imported decl
  (`importedFnDecls`); not `canFail`; its route-map entry (declaring file + span start, as #1658's
  `wholeBinderPlainServerCallee`) is `boundary: server`, not `cpsSplit`, not SSE / WS-handler /
  server-callers-only. The guarded-expr case stamps `__transportRoutable = <callee>` when an arm is
  `_` or `Transport`.
- emit-logic.ts: a client (non-server-boundary, non-`?{}`) guard with the stamp is recorded in
  var-counter.ts's per-compile `transportGuards` (result binding → callee), reset with the counter.
- emit-client.ts `routeTransportGuards` (after the s441 rewrite and `deferSyncGuardedCellWrites`):
  `let R = await CALLEE(ARGS);` [+ `_scrml_init_set` lines] directly before `if (R && R.__scrml_error) {`,
  R recorded, CALLEE the import's name or the same-file `_scrml_fetch_*` stub → `await
  _scrml_server_attempt(CALLEE(ARGS))`. Literal-blanked mask; no mask / overlap → unchanged.
- runtime-template.js `_scrml_server_attempt` in the 'errors' chunk (auto-indexed by
  RUNTIME_HELPER_DEFINING_CHUNK; also added to ERRORS_CHUNK_REFERENCE). Envelope
  `{ __scrml_error: true, type: "ServerCallError", variant: "Transport", data: { t } }`; `e.variant`
  is "Transport" (#1658's static type `{ Transport(t: asIs) }`).
- emit-functions.ts fetch stub: `.json().catch(e => { tag; throw e })` (`__scrml_malformed` on a 2xx,
  `__scrml_status` on a non-2xx) and the `HTTP <status>` Error gains `__scrml_status`. The same error
  objects are thrown as before, so unhandled sites are unchanged.

Positions (probe): cell write, let, statement, return, event-handler attribute, module-init (local) →
routed; `?` → not routed; named-only arm → not; declared-`!` → not; unhandled → not.

Tests: `compiler/tests/unit/transport-routing-s473.test.js` — 47 (37 red on base `df1e9422c`; the 10
green on base are the unchanged-behaviour rows and success). Updated
`compiler/tests/integration/wire-format-encoder-decoder.test.js` (the stub's parse line text).

flogence copy (TMPDIR): view.scrml `listArcs()` and `fetchLocal()` sites routed; app.scrml 132 guards
routed (incl. both `loadNodeStats` sites), 0 covered direct server-call guards left unrouted;
`node --check` OK.

Gap: g-impl1-client-server-call-not-failable-s451 → narrowed (run-time half for the ruled shape).

Two more pinned stub-text expectations updated (same semantics, new text):
`compiler/self-host-v2/slice-codec/cross-impl.test.js` (impl#1 emitted wire shapes) and
`compiler/tests/unit/request-settle-state-peter-20.test.js` (the `HTTP <status>` throw).

Gates: unit+conformance 32374/0; integration+lsp+commands 13086/0; root 2239/0; e2e-render-map
259/0; types-gate OK (unchanged); snippet/claim/corpus floor/md shim/conflict/spec-index/delta-lint/
s34 PASS; host-global-scan 0 violations; bootstrap lints + m1/m2/lowered-m1/m3/m4 (3750)/codec green;
bootstrap-conformance current.

Hook run 3 found a cross-file leak: the executed tests evaluate pages in the global scope, and the
errors chunk (now shipped with `_scrml_server_attempt`) left a global `_scrml_error_boundary_log` that
the url-guard test (s457, same shard) reads the absence of. Both S473 executed files now delete the
`_scrml_*` globals they added in afterAll.

## 2026-10-29 — fix round 1 (S239 review of #1664, FIX-FIRST)

- MED-1 → tag at the SOURCE. `FETCH_NETWORK_FAILURE_TAG` (emit-functions.ts) is appended to every
  plain-stub `_scrml_g.fetch(…)` (the non-CSRF stub, both fetches of `_scrml_fetch_with_csrf_retry`):
  a `TypeError` rejection (the platform's network error) gets `__scrml_unreachable`.
  `_scrml_server_attempt` routes ONLY a tagged rejection; anything else (an abort, a custom-reason
  abort, a TimeoutError, the stub's own `JSON.stringify` TypeError on a BigInt / a cycle) re-throws and
  is reported as before. The AbortError special case is gone (comment: impl#1 never aborts a server
  call today).
- LOW-1 → `(async () => _scrml_resp.json())().catch(…)` (not `Promise.resolve`: foreign-inline-codegen uses that text as its leak marker); test: a fetch shim whose json()
  returns a plain value reads 5, routed and unhandled.
- LOW-3 → status 0 → Unreachable; 1xx/3xx (unreachable through fetch's redirect following) →
  Refused(status), documented; on a 2xx only a SyntaxError is Malformed, a TypeError body read is
  Unreachable.
- LOW-2 → filed g-impl1-transport-routing-nested-arm-guard-unrouted-s473 (a nested guard is re-parsed
  at codegen; the type checker never sees it — not cheap; fails closed).
- LOW-4 → overlap now drops only the overlapping sites (was: the whole file); the per-file scan skips
  guards whose binding is not in the file. Residual (silent, per-site) filed as
  g-impl1-transport-routing-overlap-site-silently-unrouted-s473.
- Gap note: the wrapper-client-function exclusion is written into
  g-impl1-client-server-call-not-failable-s451's narrowing.

Tests: the file is 62 (13 red on round 0 `72b637a45`). Pinned stub text updated (wire-format
integration, slice-codec cross-impl).
Corpus sweep (the reviewer's 421-file `!{` list, base `df1e9422c` vs this tree): error codes identical on
all 421; 156 routed sites in 83 files; after normalising the intended edits, 0 other byte differences;
every changed JS parses (acorn); every routed page's runtime defines `_scrml_server_attempt`.
flogence copy: view 2 sites routed, app 132 routed, `node --check` OK.
