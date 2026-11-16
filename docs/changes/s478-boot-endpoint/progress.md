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
- [x] CI checks-job gates (types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim) clean
- [x] corpus: 0 newly-rejecting (only `examples/33-endpoint.scrml` + `protect/endpoint-multikey-arm-response` hold `<endpoint>`; the example now compiles, the protect case stays refused for its raw DDL)
- [x] PR #1916
- [x] review fix round 1 (review ~/.cache/scrml/review/s478-1916/review.md):
  - M1: 415 `UnsupportedMediaType` unless the request media type is `application/json` (§61.7's CSRF exemption is for a "JSON-body + bearer-token" endpoint); OPTIONS stays 405
  - M2: `scrml-boot dev` hands the manifest's endpoint paths to the program's server
  - L1: a payload field named `tag` refused (E-BOOTSTRAP-UNSUPPORTED, INTERIM; owner question 8)
  - L2: `__proto__` / `constructor` / `prototype` keys in an arm's object literal refused
  - L6: an echoed tag / key clipped to 64 chars
  - filed g-boot-wire-int-decode-unsafe-s478 (L3), g-boot-server-no-body-ceiling-s478 (L8); impl#1 media-type parity = owner question 7
  - conformance 556 PASS (same set), 0 PASS→FAIL; severity / CI gates clean

## Owner questions — see docs/known-gaps.md `g-boot-endpoint-s478`
