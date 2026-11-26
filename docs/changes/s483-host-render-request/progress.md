# s483-host-render-request — progress

Ruling: ruling:user-voice-scrml.md-S483-host-calls-render-request (Q15 + Q14, PA recs adopted).
Gaps: g-boot-render-host-call-hang-s482 (HIGH), g-boot-request-host-call-s482 (MED).
Base: origin/main 2d40d8407.

## Built
1. Q15 (a) — runtime.js `drainQueues`: a render / structure `Effect` taken from `queue` runs at most
   `metaMaxRuns()` (100, `globalThis.__scrml_max_meta_runs`) times per flush; past that it logs
   `[scrml] render effect exceeded 100 runs in one update — …` once and skips the run (the S482 effect
   cap's shape). A runtime `^{}` block (MetaEffect / MetaSubscription) keeps its own cap.
2. Q14 — analyze.scrml `requestPass` → `requestHostDiags`: a `<request>` body (or a pending cell's
   load) reaching unproven host code (hostChain + pureHostFile, as-is) is E-REQUEST-WRITE-UNPROVEN (new
   sibling code of E-EFFECT-WRITE-UNPROVEN / E-VALUE-WRITE-UNPROVEN; §34 row with the impl), whatever
   its deps.

## HELD — Q15 (b) (built, measured, NOT landed; brief: a non-zero newly-rejecting count is not migrated)
Built as ruled: analyze.scrml `valueRefDiags` → `valueHostDiags` — a render expression (interpolation,
markup attribute value, Tier-0 loop) or a derived formula (not `plainLocked`) reaching unproven host
code is E-VALUE-WRITE-UNPROVEN naming the position, the chain and the fix; initializers, locked values
that read no cell, placeless `^{}` blocks (metaBlockHostDiags) and reads of a derived cell (the formula
is judged at its declaration) are not judged. Probes F9 / H1–H4 / H13 refused, H5 / H6 / H8–H10 clean.
Measured:
- corpus (bootstrap compileSource, examples/ samples/ benchmarks/ conformance/cases/, 2977 files, base
  2d40d8407 vs the (b) build): 326 OK → 326 OK; 0 newly rejected, 0 output diffs, 0 error-code changes;
- the bootstrap's own test fixtures: 34 tests in 5 files newly rejected — every one an interpolation,
  almost all a one-shot display reading no cell (`<p>${f()}</p>`): host-src-s473 (13),
  host-block-f3-s473 (11), math-port-s472 (8, its `scrml:bad` / `scrml:hb` stub modules),
  shared-graph-walks-s480 (8 assertions over 4 r1() fixtures), import-host-s472 (2).
The patch (analyze.scrml + its tests) is `q15b-as-ruled.patch` here, against this branch's analyzer
commit; it applies with `git apply`. Owner question filed in the gap.

Tests: compiler/self-host-v2/slice-m4/host-render-request-s483.test.js (Q14, the render cap, Chromium F9).
On base (analyze.scrml + runtime.js at 2d40d8407) the Q14 refusals and the Chromium F9 pin fail; the
happy-dom cap tests are not run on base (they never return there).

## Corpus (Q14 + (a))
Q14 alone (this branch, base 2d40d8407 vs head, 2977 files): 0 changed results — 0 newly rejected, 0 newly accepted, 0 output diffs, 0 error-code changes.
