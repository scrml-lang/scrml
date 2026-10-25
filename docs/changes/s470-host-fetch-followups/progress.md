# progress — s470-host-fetch-followups

Follow-up to s470-render-residue-host-promises (#1566), from the re-review of fcaa8b84b. Branch created
from fcaa8b84b (#1566 not yet merged at start). Probes copied from ~/.cache/scrml/review/s470-lg2/ to
~/.cache/scrml/s470/laneH/ (read-only originals).

## R2 — library mode: `globalThis.fetch(…)` not awaited
Measured (lib/l2.scrml + run-lib.mjs, a 401/200 fake fetch): head emitted `const r = globalThis.fetch(…)`
in an `async function login` → wrong → LOGGED IN. A library member body is lowered in server mode with
the file's async set as its peer names (`serverFnNames`), and no stdlib classifier is installed, so the
host-member branch's `isStdlibAsyncCallee` answered false. Fix: the server arm also accepts
`ctx.serverFnNames.has(HOST_FETCH_MEMBER)` — the same fact that awaits the bare `fetch` there (peer branch).
After: `await globalThis.fetch(…)`; wrong → rejected, right → LOGGED IN.

## R1 — tool mode never awaited fetch
Measured (bin/tool.mjs, a local 401/200 Bun server; 5 shapes): 4 FAIL on fcaa8b84b (bare fetch,
globalThis.fetch, helper, `if (fetch)`). Fix: the tool's own seed (index.ts, `generateToolJs`'s
`asyncImportedNames`) gets `hostPromiseSeedOf(file)`; `computeToolAsyncImportedLocals` itself is untouched
(trap 1: its emptiness routes a tool-dep library). After: every deny shape answers rejected / LOGGED IN;
`if (fetch(u))` is emitted `if (await fetch(…))` and logs in by its own logic (a Response is truthy).

## Log
