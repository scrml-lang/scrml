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

## SPEC + gaps
§6.15 (the host-call bullet: S483 Q15 (b) rule text, Provenance, held status; "The render self-write hang":
Q15 (a) run bound; a normative statement), §6.7.4 rule 5 (cross-reference), §6.7.7 (Q14 normative statement
+ the code table row), §6.7.7.1 O-059-3 (host-call limb settled; the rest open), §6.7.7.3 (note), §34
(E-VALUE-WRITE-UNPROVEN amended — also its stale "not yet emitted" status; E-REQUEST-WRITE-UNPROVEN new).
known-gaps: g-boot-request-host-call-s482 RESOLVED; g-boot-render-host-call-hang-s482 NARROWED (owner
question with options and a rec). severity.scrml not regenerated (answer-neutral: the new code is an
Error both by its row and by the fail-closed default; the post-merge bot owns it).

## Gates (head)
- hook (unit + integration + conformance + slices): 58604 pass / 0 fail.
- host-render-request-s483 (after the (b) split): 9/9, Chromium on; the other s482 Chromium
  slice files: 147/1 — the 1 (meta-runtime-s482 "r1 MED-3: a block mounted by a click…", E-VALUE-WRITES-STATE
  on its fixture) fails identically on base 2d40d8407 (pre-existing; Chromium-only, so the hook skips it).
- compiler/tests/browser *-chromium-s482: 75/0.
- bootstrap-conformance --json base vs head: PASS 851 / FAIL 3 / NOT-TWINNED 628 / UNSUPPORTED 491 / CRASH 0
  both; 0 differing verdict records of 1973; runtimeExecuted 289 both.
- corpus differential + byte-compare (bootstrap, 2977 files): 0 changed results.
- s34-census --check-new PASS (3 rows); types-gate --check OK 182 unchanged; host-global-scan 1/2 and 2/2
  0 violations (throws are impl#1, pre-existing); retired-forms-lint OK (hook); runtime-size-ratchet 11/0
  (impl#1 — unaffected). Bootstrap runtime.js: +1,588 B raw, +351 B gzip -9 (no gate on it).
- Chromium probes (s482 chrom.ts driver): F9 base UNRESPONSIVE → head responsive o=101 c=101, one cap log;
  H2 (`title=` through a wrapper) base UNRESPONSIVE → head responsive c=101; H4 (derived formula) c=2 both.

## Fix round r1 (#2123 review, verdict FIX)
- HIGH-1 reproduced on 6bbc1565d: p-R10_req_settle / p-R11 UNRESPONSIVE after the click.
- Built the lap cap (runtime.js RunQueue causes + lapNode + suspend carries runCause; epoch on a macrotask
  tick). R10/R11 responsive c=101, one log. All other reviewer p-* probes byte-identical vs 6bbc1565d runtime.
- Tests: host-render-request-s483 15/15 with Chromium (compiled F9 + R10).
- Text: gap kept HIGH (narrowed; MED rec withdrawn; X2 glue-microtask shape still hangs), SPEC §6.15 / §6.7.4 /
  §34 ruled-not-built markers; q15b patch moved to ~/.cache/scrml/review/s483-briefs/q15b-as-ruled.patch.
