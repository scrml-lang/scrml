# S473 impl#1 — server-side navigate() (progress)

Ruling: user-voice-scrml.md "⭐ RULED — impl#1 exception: fix server-side navigate()" (S473).
Gap: g-impl1-server-navigate-referenceerror-after-commit-s473 (HIGH).

## Bug (reproduced on base f4079bd2d)
`navigate("/posts", .Hard)` in a server function lowered to `_scrml_navigate("/posts");` in
app.server.js. `_scrml_navigate` is client-runtime only → `ReferenceError` after the `?{}` INSERT
committed; nor was it returned, so no redirect either.

## Plan / design (readings flagged)
- Server lowering: `_scrml_server_navigate(path, fixedOrigin)` — throws a navigation SIGNAL (not an
  error); every route handler's body IIFE gets `.catch((_scrml_e) => _scrml_nav_settle(_scrml_e, _scrml_req))`
  which turns it into the response. Throw (not `return`) so it ends the function from any depth:
  a match-arm IIFE, an in-process peer callable, a nested block.
- Wire (SPEC §20.1 fixes only "302 redirect"; the fetch-wrapper channel is a READING):
  - scrml's fetch wrapper sends `X-Scrml-Fetch: 1` → `204` + `X-Scrml-Navigate: <target>`; the
    wrapper does `location.assign(target)` and returns a never-settling promise (caller never resumes).
  - any other client → real `302` + `Location`.
- Path safety (SPEC silent beyond "developer-defined URL string" — READING): same-site path
  (`/x`, not `//` or `/\`), or absolute http(s) URL whose ORIGIN is fixed by literal source text at
  the call site (verified at runtime by URL origin equality). C0 controls/DEL refused (header
  injection); non-ASCII percent-encoded. Refusal = host error (500; implicit transaction rolls back).

## Log
- (start) branch s473-impl1-server-navigate from origin/main f4079bd2d.
- 3af29588c — fix: server lowering (`_scrml_server_navigate`), handler catch (`_scrml_nav_settle`),
  server string fallback, client stubs (`X-Scrml-Fetch` / `X-Scrml-Navigate` / `_scrml_follow_server_navigate`).
  The catch is stripped and no helper injected when the server bundle has no server-side navigate.
- 944a9c016 — tests: integration (30; 26 red on base f4079bd2d, 4 pass there = 2 controls + 2 tests of
  the new module's reader) and browser/happy-dom (2; 2 red on base).
- 7126f291b — the signal is an Error with a message (uncaught in a non-route server context → readable 500).
- known-gaps: g-impl1-server-navigate-referenceerror-after-commit-s473 filed HIGH, status=resolved.
  Bootstrap coverage §20.1 row (impl#2, REFUSED-LOUD) is about the bootstrap and stays unchanged.

## Readings / SPEC silences (flag in PR)
1. Wire shape for scrml's fetch wrapper (204 + X-Scrml-Navigate; request X-Scrml-Fetch: 1) — SPEC silent.
2. "navigate ends the server function" — SPEC says "compiles to a 302 redirect"; it does not say what
   happens to statements after it. Read as: a redirect IS the response, so nothing after it runs.
3. Path safety rule — SPEC says only "a developer-defined URL string".
4. navigate inside `transaction { }` rolls the block back (same as `return`, §19.10.3 S453/B1a) — a
   save-then-navigate inside a transaction block LOSES the writes while the user is redirected. Owner
   fork: keep (consistent with return) / commit-then-navigate / refuse at compile time (recommend refuse).
5. CPS-split function: navigate lands in the client continuation and soft-navigates (pre-existing).

## Deferred (not closed)
- navigate in a non-route server context (SSR/`/__mountHydrate` loader, SSE, `<endpoint>`, `handle()`)
  fails the request (500, readable message) instead of redirecting the page.
- A refused target after an autocommitted write (no implicit envelope) leaves that write committed.
- Client-side `_scrml_navigate` (`.Hard` from client code) has no target guard (`javascript:`).
- Cross-file: a server helper imported from another module that navigates — its importer's handler
  catch is stripped unless the importer itself navigates (fails closed: 500).

## Review round (#1679, LAND-W-F/U — ~/.cache/scrml/review/s473-1679/REVIEW.md)
- ad093ea8a — F1 client origin pin (frozen `_SCRML_NAV_ORIGINS` in both bundles), F4 module-private
  `Symbol()` + settle re-check, F5 `#fragment` target settles, F3 docblock corrected, F7 call-site
  scanner (no member calls / string / comment text) + empty navigate() → E-NAV-NO-PATH in the string
  lowering. Tests: integration 36 (6 new, red on 3d9ec7db4), browser 5 (3 new, red on 3d9ec7db4).
- F3 lint filed as a gap (needs a §34 row + a reliable codegen→diagnostics channel):
  g-impl1-server-navigate-target-unproven-lint-s473 (MED, open). Proposed name W-NAV-TARGET-UNPROVEN (reading).
- F6 filed: g-impl1-per-route-stub-ignores-server-navigate-s473 (LOW, latent).
- F2 RULED (user-voice S473 "review-surfaced decisions" item 4): navigate inside transaction{} is a
  compile error. 957f19d7c — lint-transaction refuses it with E-TRANSACTION-CONTROL-FLOW (existing
  code; a reading — #1682 names no navigate-specific code). Rollback pin replaced by 4 must-refuse
  shapes (red on 79ed33510) + near-miss (navigate after the block: 302, both writes committed).
