- 2026-11-10T15:21Z — start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-a9e73c9407e4de53d (base 0487a8fa4 + merged s477-boot-dev-leak 04edd2ead). bun install + pretest OK.
- 2026-11-14T09:40Z — RESUMED after API outage. F4 re-checked; origin/main still 0487a8fa4 (already includes #1823/#1824) — nothing to merge.
- 2026-11-14T09:48Z — BASELINE (base tree = 0487a8fa4+bench, one-shot wall incl. bun start): g9 211L 325ms · g18 418L 543 · g36 832L 1929 · g72 1660L 7877 · g108 2488L 22303 · g144 3316L 53780 · adopt23 2312L 10454 · adopt27 2720L 16595. Profile adopt27: allNodes 11.6 s SELF (its own out.concat([n]) per node = O(n²) per walk) of 16.7 s; onceBoundInit 6.3 s, isParam 3.2, reinitUsed 3.2 incl.
- unit 1: walk.allNodes rebuilt by halving children (same preorder). adopt27 16.6 s -> 3.9 s, g72 7.9 -> 1.4 s; outputs identical. Next: advance1/cursorAt 1.27 s, structural_eq 1.06 s (analyze boundAs/fnWrites).
- 2026-11-14T10:20Z — unit 1 committed c180c2251 (hook ~60 min on a loaded machine). unit 2: check.scrml OnceBinds (Let/Assign index built once in checkCore, threaded to onceBoundInit) + print.scrml PrintIx (constructed fields + InitOf uses, built once per print Ctx root) — adopter 3.9 -> ~3.7 s alone (machine loaded); the remaining hotspots after it: lex cursorAt (1.27 s), analyze fnWrites/fnwIn (1.9 s), fnsInScope (0.8 s at 3.7k lines), names mint/taken.
- unit 2 committed 873d58033. unit 3: lex.scrml cursorAt from the line feeds (was advance1 from offset 0 per lexed region); analyze.scrml fnWrites reads fnwIn once per pass and file (fnwScopes), voidFns / fallOffPass read fnsInScope once per file (fnsInScopes); names.scrml NameTable as two parallel tapes searched by indexOf. Profile after (adopter 2,720 lines, compileSource 905 ms): flat — no function above ~10% (parse 220 ms, typePass 155, print 174, checkCore 123, allNodes 105).
- byte-identity gate (docs/changes/s477-boot-compile-perf/identity.ts; base tree = git archive of 5bf45370e in the lane scratch dir, head = the final self-host-v2 tree): 2,342 files (1,866 conformance case files + 341 self-host-v2 fixtures (the 9 impl#1 build entries that import the compiler itself excluded) + 125 compiler/tests fixtures (dist/ excluded) + 7 generated sizes + 2 adopter entries + the adopter's data module) -> 0 differ (493 printed artifacts, 14,092 diagnostics); 868 §66 twins (twinOf) -> 0 differ (254 artifacts, 4,573 diagnostics); 6 deep-nesting probes (3,000-term `+` chain, 400 nested ifs) -> 0 differ; scripts/bootstrap-conformance.ts --json base vs head: 1,827 verdicts, 0 differ (PASS 302 / FAIL 244 / NOT-TWINNED 624 / UNSUPPORTED 657 both).
- scaling test compiler/self-host-v2/slice-m4/compile-scaling-s477.test.js (N=40 vs 80 replicas, ~900 -> ~1,800 lines, in-process best of 5 interleaved, ratio < 3): head 2.33-2.45, base 5.98 (FAILS on base, run in the base tree), allNodes-only state 3.42.

| input | lines | base ms | head ms |
|---|---:|---:|---:|
| gen g9 | 211 | 325 | 253 |
| gen g18 | 418 | 543 | 284 |
| gen g36 | 832 | 1,929 | 374 |
| gen g72 | 1,660 | 7,877 | 660 |
| gen g108 | 2,488 | 22,303 | 1,098 |
| gen g144 | 3,316 | 53,780 | 1,157 |
| gen g160 | 3,684 | 176,519 | 1,461 |
| adopter r26 analyzer | 2,312 | 10,454 | 897 |
| adopter lotto-analyzer | 2,720 | 16,595 | 1,208 |
(one-shot `scrml-boot compile` wall incl. bun start + bundle load ~230 ms; machine shared with other agents' hooks, ±30%.)
- 2026-11-14T13:30Z — unit-3 commit attempt FAILED in the hook: the new scaling test measured >= 3x inside the long single-process slice run (heap of ~190 earlier test files), and the residual super-linear terms at N=40 -> 80 measured 2.8x in process on an idle machine. Round 2 (nothing lost — the unit-3 work stayed staged): the measurement moves to a FRESH child process (slice-m4/compile-scaling-s477.probe.js), and more per-item re-derivations go: analyze laterPrograms (isLaterProgram per item, O(items²) per file: typeItems / declStubs / fnItems / constItems), Globals.singles (singleProgramField re-read every program cell per element), Globals.hostImps (hostImportBinding re-walked every item per name), fileNameClashes reads importsByFile once (importBringing per file-scope name); walk.scrml exprNodes / viewNodes / stmtNodes built by halves (every walk rebuilt a 240-child list by prefix copies); names.scrml mint resumes each base's candidate search (k mints of one hint were O(k²) candidates).
- in-process ratio (fresh process, best of 5 interleaved) N -> 2N: N=30 2.43, N=40 2.51-2.61, N=50 2.37 (base 5.98; allNodes-only 3.42). Bound 3.
- remaining super-linear terms, each < 5% at 1,800 lines (not taken): Tarjan sccOrder's immutable setInt/setBool (O(V²) per closeDim), cursorAt's line-feed count per lexed region (O(lines × regions)), fnErr / capOwner linear lookups per call node in check, the OnceBinds / laterPrograms concat accumulation.
- FINAL byte-identity gate (base = an archive of 5bf45370e in the lane scratch dir): 3,216 inputs (2,342 corpus/fixture/generated/adopter files + 868 §66 twins + 6 deep-nesting probes) -> 0 differ (759 printed artifacts, 18,665 diagnostics, 0 thrown); bootstrap-conformance --json 1,827 verdicts -> 0 differ.

| input | lines | base ms | head ms (final) |
|---|---:|---:|---:|
| gen g9 | 211 | 325 | 308 |
| gen g18 | 418 | 543 | 328 |
| gen g36 | 832 | 1,929 | 405 |
| gen g72 | 1,660 | 7,877 | 608 |
| gen g108 | 2,488 | 22,303 | 792 |
| gen g144 | 3,316 | 53,780 | 906 |
| gen g160 | 3,684 | 176,519 | 1,187 |
| adopter r26 analyzer | 2,312 | 10,454 | 843 |
| adopter lotto-analyzer | 2,720 | 16,595 | 1,033 |
(one-shot `scrml-boot compile` wall incl. bun start + bundle load ~250 ms; best of 2; shared machine.)
