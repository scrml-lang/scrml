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
