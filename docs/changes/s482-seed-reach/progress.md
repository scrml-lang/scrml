# s482-seed-reach — progress

Lane brief: `~/.cache/scrml/review/s482-briefs/seed-reach.md`. Branch `s482-seed-reach` from origin/main 62d36cabd.
Scratch: `~/.cache/scrml/review/s482-seed-reach/` (base tree `base/`, probes `p/`, Chromium runner `h/run.sh`, `h/sweep.sh`).

## Items
- (a) g-boot-seed-read-early-reach-s482 — a use of a cell before its place (or of a derived cell anywhere) runs its seed there; a seed reaching a later binding is E-SCOPE-001.
- (b) g-boot-seed-at-place-reaches-later-s482 — a seed at its own place reaching a later binding is E-SCOPE-001.

## Log
- Reproduced on base in Chromium: y-cell-seed-direct / flat / nested `1 | 1`, effect `kab`, b-cellread `1 | 1`, derived read early `1 | 1`, write before place with a seed `show(k)` traps (`undefined has no text`).
- Built in `compiler/self-host-v2/analyze.scrml`: bodyReachDiags now runs on a BodyCx; `codeReach` is the one judgment (names, writes, cell uses, functions via usesR); `cellReach` follows a cell's seed / formula; usesR gains `c:<cell>` atoms (cellUsesDirect). Persisted cells left out (INTERIM carve-out).
- Head sweep: all refusal probes E-SCOPE-001; legal shapes compile with the right values.
- Found (pre-existing, not this lane): a never-called nested function declaration in a function body code calls still makes the printer run the binding early (`x-body-nested-never`: `3 | 1`, should be `3 | 5`) — filed as a gap.

- Commit 8820ef89a (analyze) — hook PASS (57677 pass).
- Corpus differential (2968 files via compileSource, base 62d36cabd vs head): 0 newly rejected, 0 newly ok, 0 code changes, 0 output diffs over the 305 files that compile on both.
- Tests: slice-m4/seed-reach-s482.test.js — base 9 pass / 16 fail (every refusal), head 25 / 0.
- SPEC §7.6 rule (b) "A seed reads only the bindings whose place is before it runs (S482)", provenance INTERIM item struck, §34 E-SCOPE-001 row. Gaps: (a) resolved, (b) filed + resolved, g-boot-nested-decl-reach-runs-binding-early-s482 filed (open).

## Next
- final gates (pretest, conformance base vs head, s34-census, types-gate, snippet/claim gates, corpus floor, md shim), push, PR.
