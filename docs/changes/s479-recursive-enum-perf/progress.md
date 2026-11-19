# s479-recursive-enum-perf — progress

Gap: g-boot-recursive-enum-exponential-s479 (MED).

- [x] Located: CPU profile of the k=3 repro (`type E:enum = { Leaf(v: int), V1..V3(a: E, b: E[]) }`):
  97% of 9.7 s inclusive in analyze.scrml `containsHost` (called from `hostTypeDataDiags`, §21.3.3 rule 15).
  It recursed through named types' fields with only a depth-12 bound, re-expanding `E` inside `E`:
  ~(2k)^12 steps per field.
- [x] Fix: `containsHost(ts, t)` is a worklist with a `seen` set of named-type ids (each named type
  expanded once). Linear in the type graph; finds a handle at any depth (rule 15: "at any depth").
- [x] Repro after: k = 1..6 each ~0.25 s through scrml-boot (was 0 / 1 / 11 / >60 s).
- [x] Test: compiler/self-host-v2/slice-m4/recursive-enum-perf-s479.test.js (7 tests).

## S480 (finishing agent)

- [x] Review of the worklist: Type's Maybe / Seq / Named are disjoint variants (maybeInner / seqElemOf /
  namedOf each match one), and a TypeDef is Struct / Enum / Host only (no alias), so the else-if never
  skips a branch the old sequence would have taken. `T | not`, tape elements, struct fields, enum payloads
  and their nesting are all still walked; `seen` only stops a second expansion of the same name.
- [x] Base (HEAD) commit was blocked by an impl#1 order-dependent flake (snippet-slot `_dbVar`, fixed on
  origin/main 71660db43): fast-forwarded to origin/main (84f33f8ff), re-applied the staged fix (clean).
- [x] Survey of other depth-bounded walks over named types (grep `depth > ` / `depth + 1`):
  analyze.scrml hostResultOk and check.scrml hostDecodes (host binding result, §21.3.3 rule 13) were
  exponential on a struct graph with sharing (5-wide, 11 deep: 40.6 s on base). Fixed as (type, depth)
  worklists, verdict unchanged (depth-12 cap kept; base and new agree on chain 11/12, `[] | not` 9/10,
  cyclic struct, enum). Enum results are refused before any walk, so the recursive-enum shape never
  reached them. print.scrml hostDescJs (the decode descriptor) is the same shape at codegen: its output
  is a tree, 4x per level on a shared struct graph (d8 = 7.3 MB; d11 OOM) — residue, filed as a gap.
  Probed fast on k=6 recursive enum: server fn param/return, `==`, cell, tape cell, channel tape,
  struct of the enum (all 1-10 ms). check.scrml boundValue (`depth > 8`) walks values, not types.
- [x] Timings (frontEnd, k variants `Vi(a: E, b: E[])`): base k=1 5 ms, k=2 102 ms, k=3 6018 ms,
  k=4 >90 s (killed). New k=1..12 4-7 ms.
- [x] Red on base: "at any depth" (14 levels) fails; 5-wide host-result graph 40.6 s (bound 10 s).
- [x] Committed 1a422d03f (on origin/main 84f33f8ff; hook PASS).
- [x] Corpus old-vs-new (scrml-boot compileSource, examples/ samples/ benchmarks/, 959 files): 0 changed.
- [x] Conformance base vs new: identical — PASS 724, FAIL 0, CRASH 0 (only the timing line differs).
- [x] CI checks: s34-census --check-new, types-gate --check, snippet-gate, claim-gate,
  corpus-compile-floor --check, gen-md-shim --check — all exit 0.
- [x] known-gaps: g-boot-recursive-enum-exponential-s479 status=resolved; filed
  g-boot-host-desc-exponential-s480 (LOW, print.scrml hostDescJs tree-shaped descriptor).
