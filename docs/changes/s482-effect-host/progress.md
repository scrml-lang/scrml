# s482-effect-host — progress

Gap: g-boot-effect-host-call-hang-s482 (RULED S482, ruling:user-voice-scrml.md-S482-effect-host-call).
Base: origin/main 451a4ce04.

## Built
1. `<effect>` no-write rule: a body reaching an unproven host-backed function (hostChain + pureHostFile,
   as-is) is E-EFFECT-WRITE-UNPROVEN naming the chain (analyze.scrml `refDiags` → `hostDiags`).
2. Runtime backstop: `drainQueues` caps each effect taken from `effectQueue` at `metaMaxRuns()` (100,
   `globalThis.__scrml_max_meta_runs`) runs per flush; logs once (console.error), skips the run.
3. Runtime `^{}` block body: the same hostChain judgement (PendRule.MetaBlock → `metaBlockHostDiags`),
   E-BOOTSTRAP-UNSUPPORTED INTERIM; callbacks left to metaCbDiags (no double report). Registered in both
   resolveNodes (program body, `runMetaOf`) and resolveRunNode.
4. INFO-1: export names of stdlib math/host.js and random/host.js pinned.

Tests: compiler/self-host-v2/slice-m4/effect-host-s482.test.js.

## Corpus (measured before commit)
bootstrap compileSource over examples/ samples/ benchmarks/ conformance/cases/ (2972 files), base
451a4ce04 vs head: 324 OK → 324 OK; 0 newly rejected, 0 newly accepted, 0 code changes, 0 output diffs.

## Commits
1. 233f45f6b — the three rules + INFO-1 pin + tests (hook: 58190 pass, 0 fail).
2. SPEC §6.7.4 rule 5 + §34 E-EFFECT-WRITE-UNPROVEN row amended (S482 ruling provenance); gap resolved.

## Gates (head 233f45f6b + docs)
- effect-host-s482.test.js: 15/15 (SCRML_BROWSER_TESTS=1, Chromium included); compile refusals red on base (5 fail).
- effect / effects-summary / meta-phase3 / meta-runtime / host-src / import-host slices (Chromium on): 196/0.
- bootstrap-conformance --json base vs head: PASS 845 / FAIL 4 / NOT-TWINNED 628 / UNSUPPORTED 491 / CRASH 0
  both; 0 verdict diffs (1968 cases, runtimeExecuted 288 both).
- corpus differential + byte-compare: 2972 files, 0 newly rejected/accepted, 0 code changes, 0 output diffs.
- s34-census --check-new: PASS (1 changed row, provenance resolves). types-gate --check: OK 182 unchanged.
- corpus-compile-floor --check: PASS. e2e-render-map: 259/0. claim-gate 0 failed; snippet-gate 120/0.
- gen-bootstrap-severity: not needed (no code added).
