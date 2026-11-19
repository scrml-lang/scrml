# s479-waiting-helper-server-copy — progress

Gap: g-boot-waiting-helper-server-copy-s479 (filed by #1978). Base: origin/main e415f40b0.

## Base measurements (e415f40b0)
- bootstrap conformance: PASS 702, FAIL 4, UNSUPPORTED 557, CRASH 0
  (~/.cache/scrml/review/s479-waiting-helper-server-copy/conf-base.json)
- corpus (3182 files, codes + artifact hashes): corpus-base.json (same dir; script corpus.mjs)

## Design (verified against the code)
- analyze: after placement + plan, the set of helpers needing a server copy — an Ambient function
  that waits (client) and is called (not as a value) from a server-side body (Server-placed,
  inherited, or another copy) — transitively. Each gets a minted Sym and its own server-mode
  suspension plan (planBlock, server: true); the copy plan's diagnostics are dropped only when they
  duplicate a diagnostic on the original (same code/file/span) — otherwise kept (fail closed).
- lower: the server-side bodies (ServerFns, inherited Fns, copies) are lowered against a server
  view of the tables: callees with a copy retargeted to it; in a copy, the copy plan and the
  original counted server-side (remoteCaller false → in-place calls, callee's own enum); a
  handling form on a non-`!` callee reduces to the bare call; `.Transport` arms dropped.
- Core: the copy is a server-only Fn (like an inherited function — Core derives server-only-ness:
  it plain-calls a ServerFn), never a route.

## Status
- [x] analyze copies (copyPass, keepNewDiags, sideCallee/copyOf)
- [x] lower server view (serverView, inPlaceUnfailing/unfailingStmts, deadTransportArm)
- [x] tests / conformance cases / known-gaps markers

## S480 continuation (lane re-dispatched)
- WIP saved ~/.cache/scrml/review/s480-waithelper/wip.patch; branch fast-forwarded to origin/main c9f62ee5c, patch re-applied (--3way, clean).
- Base (c9f62ee5c, + the 3 new cases copied in): conformance PASS 726 / FAIL 0 / UNSUPPORTED 560 / CRASH 0 (s480-waithelper/conf-base.json); corpus-base.json (3210 files).
- WIP compiles; the 3 new RT cases PASS; slice-m4/waiting-helper-server-copy-s479.test.js 9 tests, all 7 original red on main (base tree).
- Mutation check: dropping keepNewDiags duplicates the defer-body refusal (test catches it).
- Residue filed: g-boot-server-copy-bang-envelope-s479 (a `!` helper reached only through another copy — refused by name).

