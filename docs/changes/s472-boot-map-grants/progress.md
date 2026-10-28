# s472-boot-map-grants — progress

Gap: g-boot-map-position-write-bypasses-element-tape-grants-s472 (HIGH, fail-open).

## Plan
- analyze: a shape-4 write back (`xs = xs.map(…)` / `.sort(…)` / `.reverse()`, §66.11.2 "a
  position-write") replaces EVERY element, so it needs what a position write `xs[i] = v` needs
  (#1610 r1 F1): an element that is a tape needs its `replace`; a struct element's tape fields
  (structTapeWrites, nested) need theirs. New reader fn `shapeElemTapeProblems` (inside the grant
  reader range). Call sites: resolveSeqShape (cell), localTapeProblems (local / parameter
  rebinding), localFieldWriteProblem (a local / parameter struct's tape field), fieldAtWrite
  (an instance-spread override of a cell's tape field).
- check (C3): `.PositionWrite :> positionTapeProblem(…)` (was `""`); a FieldAt whose target is a
  tape and whose value is a map / sort / reverse judges its elements (`fieldAtElemProblem`).
- Callback not walked: identity map / spread-keeping map refused (fail closed, SPEC silent).
- sort / reverse refused alike (fail closed: SPEC classifies them as the same position write).
- Out of scope, unchanged: a whole `replace` of an outer tape (`@g = [[]]`) — unruled.

## Log
- branch from origin/main c8070b56a.
- tests: slice-m4/map-grants-s472.test.js (17). Red on base: 13 of 15 initial fail.
- commit 1: analyze + check + tests.
- red-proof: map-grants-s472.test.js against base c8070b56a analyze/check — 3 pass / 14 fail (the 3
  pass: the granted control, the `write`-only control, the already-refused `@b.g = @b.g.map(…)`).
- 768529441 analyze + check + tests; 707edc58a known-gaps narrowed (counts unchanged: still open HIGH).
- 02194fd32 merge origin/main (#1608 payload variants: `positionalValue` gains the VariantOf arm).
- bootstrap-conformance --write: no change (report already current).
- slices (lint, m1, m2, m1-lowered, m3, m4, codec) + e2e-render-map: green post-merge.
- Pre-commit hook: the default shard plan timed out twice on a loaded host (one 1655-file shard, 1200 s);
  re-run with SCRML_HOOK_SHARDS=5 (a shard count, not a bypass) — green.

## Review round 1 (S239, ~/.cache/scrml/review/s472-mg/REVIEW.md) — LAND-WITH-FOLLOWUPS; RULED S472 ("five PA recs" items 1-2)
- F1 (MED, base too): a whole write of a tape replaces every tape its elements hold, RECURSIVELY —
  analyze innerTapeHits / tapeWriteInnerProblems (judged by the VALUE: the place itself / a grow-shrink
  shape / a permutation keep elements, anything else replaces them); structTapeWrites walks a replaced
  tape's elements; C3 innerTapeKept / structTapeKept (a tape) / positionTapeProblem / fieldAtPermutation.
- Rule 2 / F2: sort / reverse written back exempt (analyze seqPermutation, C3 permutationOperand); map judged.
- F3: resolveSeqShape resolves the value first — two-parameter map E-BOOTSTRAP-UNSUPPORTED, `sort()` on a
  tape of tapes E-TYPE-031 lead.
- SPEC §66.12.6 rules 1 and 3 gain the ruled sentences (provenance); SPEC-INDEX regen. No new codes.
- known-gaps: g-boot-map-position-write-bypasses-element-tape-grants-s472 RESOLVED (HIGH open 265 → 264).
- Red-proof: map-grants-s472.test.js against da1ffcf81 — 11 fail / 12 pass.

## S473 landing front (2026-10-28T20:56Z)
- land-s472-boot-map-grants from origin/s472-boot-map-grants b5cd8f155; `git merge origin/main` (3a7d1d223) — CLEAN, no conflicts (merge 77739586e).
- bun install + pretest done. Next: S239 probes (round-1 ruled set) on the merged head, then CI gates.
- 2026-10-28T21:40Z: S239 probes run on merged head 77631d61d (16 S239 + 14 reconstructed ruled-set probes + 3 C3): every ruled MUST-REFUSE refused (E-WRITE-NOT-GRANTED), every permutation (sort/reverse) compiles and runs; C3 edit-to-Replace hole now refused. No disagreement with the S472 ruling.
- Gates (checks job + bootstrap slices + conformance report + e2e-render-map): all RC=0. known-gaps @gap id set: none lost (2445 = main's). state.ts --check PASS.
- 2026-10-28T22:30Z: re-merge origin/main (#1619 bootstrap gate fail-opens) → 34fa2644b. Conflict: SPEC-INDEX.md only (git-merge-generated.ts --regen). severity.scrml regenerated (E-FORM-OWNER-UNRESOLVED). analyze/check/core/known-gaps/SPEC auto-merged; PR code does not match over InstRef/View (no new-variant break); @gap ids == main (2446). All 19 gate steps RC=0; mg probes (33) identical verdicts to the previous head.
