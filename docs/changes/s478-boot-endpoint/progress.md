# s478-boot-endpoint — progress

Lane: build SPEC §61 `<endpoint>` (the typed inbound route) in the bootstrap (`compiler/self-host-v2/`).
Branch `s478-boot-endpoint` from `720ea381d`.

## Design (as built)

- **Parse** (`parse.scrml` `endpointItem` / `endpointArms` / `endpointArm` / `endpointBareBody`): the
  opener's `path=` / `method=` / `accepts=` (E-ENDPOINT-PATH-MISSING / -METHOD-INVALID /
  -ACCEPTS-MISSING), the arms (`<V : e>`, `<V(a, b) : e>`, `<V/>`, `<V>e</>`, `<_ : e>`), a
  multi-statement bare body (E-ENDPOINT-MULTI-STATEMENT-ARM). Recorded in `FileAst.eps`.
- **Desugar** (`parse.scrml` `endpointDesugar`, after the whole file is read): each arm with a body
  becomes `server function endpoint#<k>#<V>(<binders typed by the enum's payload fields>) { return <body> }`
  in place of the endpoint — so scope (§61.1 E-SCOPE-001), typing, placement and lowering are a server
  function's. Only for an `accepts=` enum declared in the same file.
- **Analyze** (`analyze.scrml` `endpointPass`): accepts= resolution (E-ENDPOINT-ACCEPTS-NOT-ENUM /
  E-TYPE-UNKNOWN-NAME), arms (E-ENDPOINT-NOT-EXHAUSTIVE, E-MATCH-SUBSET-DEAD-ARM, E-TYPE-023,
  E-TYPE-021, E-SYNTAX-010, W-MATCH-001), by-name refusals → `CoreEndpoint` (ServerFacts → Core).
  `epRetFiles` (analyzeSources): the arm's result type — an object literal becomes a synthesized struct
  (`endpoint#k#V#R`), any other value its proven type — then the program is analyzed again.
- **Emit** (`print-server.scrml` `endpointConsts` / `endpointEntry`; runtime `server-runtime.js`
  `endpoint` / `handleEndpoint`): mounted at path+method on the existing `rt.server` fetch (no second
  router), no CSRF, §61.3 decode → 400 `{ error: { kind, message } }`, §61.5 200 / 204, 405 + Allow
  for another method.

## Status

- [x] parse + analyze (commit 1)
- [x] emit + runtime (commit 2)
- [x] tests `compiler/self-host-v2/slice-m4/endpoint-s478.test.js`
- [x] severity regen
- [x] conformance: 539 → 556 PASS (+17, all `endpoint/*`), 0 PASS→FAIL
- [ ] CI checks-job gates, hook, PR

## Owner questions — see docs/known-gaps.md `g-boot-endpoint-s478`
