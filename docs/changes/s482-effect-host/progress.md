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

## Gates
(see below as they run)
