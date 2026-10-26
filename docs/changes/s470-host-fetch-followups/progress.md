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
- 2c8… (first commit) — R2 + R1.

## R3 — a binding of the host global object
`markHostGlobalAliases(file)` (host-promise-names.ts), run on every file at the start of codegen
(index.ts, before any file's async facts — an importer asks an imported file's set): every name declared
or assigned (any scope) a value that holds the host global object (`window`, `globalThis`, `self`, `top`,
`parent`, `frames`, `document.defaultView`, chains of them, a `?:` / `||` / `&&` / `??` branch, an alias
of an alias — fixpoint) is an alias, and every identifier of that name is marked. `isHostGlobalObjectExpr`
reads the mark, so the ONE reader every consumer uses (colouring callee walk, emit-expr await,
value-use judge, render / action walk) sees `w.fetch` as the host `fetch`. By name and scope-blind: the
fail-closed direction (a same-named binding elsewhere reads as the host object too: its `.fetch(…)` is
awaited or refused, never treated as an author function). Provenance the walk cannot follow (a host object
passed as an argument / returned / stored and called through `x.fetch` there) is not caught: candidate gap.

## R5 — `frames[0]`
`isHostGlobalObjectExpr`: a numerically indexed host global object (`window.frames[0]`, `window[0]`) is a
host window. No frame exists under happy-dom / Bun, so no pack shape can log in through it: unit tests.

## Pack r20 (s23 / f26 / l18 / t18, 26 shapes)
Measured with ~/.cache/scrml/s470/laneH/measure.sh (the pack's runShape, base fcaa8b84b vs head). Every
R1 / R2 / R3 shape FAIL on fcaa8b84b → PASS / PASS-DENY / PASS-REFUSED; every VALID control PASS on both
(the f26 "awaited status through an alias" control was PASS-DENY on base — un-awaited — PASS on head).
Non-browser sides fetch a `data:` URL: awaited → a 200 Response; un-awaited → `.status` undefined.
Found while building it: a bare `fetch(…)` inside a SERVER function resolves to the server module's own
exported request handler (`fetch`), returning null — candidate gap (s23 has no bare-fetch control).
EXPECTED_SHAPE_COUNT 3094 → 3120; r20-pinned.js. Unit tests: host-fetch-followups-s470.test.js (12).

## R26 with digests — 4067 files, base fcaa8b84b vs head (pre-merge)
newly rejected 0; emitted JS changed on a file that compiles on both: 0; code changes only in stdlib/
(harness artefact; each compiler over its OWN stdlib: 54 files, 0 code / 0 emit diffs).

## Merge + CI (after merging origin/main ffbcf4432 = #1566)
All CI job commands exit 0 (types-gate, root tests, snippet-gate, claim-gate, corpus-compile-floor,
md-shim, conflict-marker, spec-index, delta-lint, ci-shards, s34-census, unit + conformance, pretest,
integration + lsp + commands, todomvc, browser-baseline, lint-no-default-arm, slices, e2e-render-map,
host-global-scan, gen-bootstrap-severity) except the WARN-only facts --check. The whole failable pack
(3120 shapes, classify.js): FAIL=2 — exactly the two f25 G0 BY_DESIGN_LOGS_IN shapes.

## Candidate gaps
- A bare `fetch(…)` in a SERVER function calls the server module's own exported request handler
  (`export async function fetch(request)`), not the host fetch (measured: `r` is null). Fails closed
  here, but it is a wrong binding (the S457 host-global alias does not cover a user call of `fetch`).
- R3 residual: a host global object handed on as a VALUE (an argument, a return, a tape / object
  member) and called through `x.fetch(…)` there is not tracked (provenance lost; not refused).
