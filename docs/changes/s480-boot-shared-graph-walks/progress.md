# s480-boot-shared-graph-walks — progress

Branch from origin/main c61700fee (#1991 merged). Review findings of #1991: F1, F2, F3 plus a survey.

## Done
- F1: analyze.scrml structTapeWrites/innerTapeHits now thread a `done` set (tapeWalkStruct/tapeWalkInner). check.scrml structTapeKept/innerTapeKept do the same (keptWalk/innerKeptWalk). One E-WRITE-NOT-GRANTED per offending tape field, at the first path.
- F2: print.scrml hostBindJs hoists the structs a descriptor names from 2+ places (`const hostty$K`, post-order). Descriptors without sharing are unchanged byte for byte. No runtime change.
- F3: analyze.scrml hostyIds/containsHostIn are computed once per pass (hostTypeDataDiags, hostServerDiags, hostCellDiags).
- Survey fixes: chInnerContract (channel cells), check.scrml blockWriteWitness family (a threaded `seen`), derivedPath (a threaded `dead` set).
- Residue filed: g-boot-shared-graph-walk-residue-s480. F1 filed+resolved: g-boot-tape-grant-walk-exponential-s480. Resolved: g-boot-host-desc-exponential-s480.
- Tests: compiler/self-host-v2/slice-m4/shared-graph-walks-s480.test.js (21 pass on head; red on base: F1 counts/time, F3 time, F2 size; base OOM-killed at the depth-8 test under the 4G cap).

## Gates (on 5239ec30e)
- `bun run pretest` exit 0; the pre-commit hook PASSED (57 039 tests, 1964 files).
- `bun scripts/bootstrap-conformance.ts --json`: 1919 attempted, PASS 724, FAIL 0, CRASH 0 (main is the same).
- Corpus (examples/, samples/, benchmarks/, 959 files): old bootstrap (c61700fee) vs new, diagnostics and emitted
  client/server/host outputs. 0 programs changed. (`files` differs only by the absolute tree path.)
- CI checks: s34-census --check-new PASS; types-gate OK (unchanged); snippet-gate 0 fail; claim-gate 0 fail;
  corpus-compile-floor PASS; gen-md-shim current.

## r1 (review:#1994 HIGH-1)
- analyze.scrml tapeWalkStruct/tapeWalkInner and check.scrml keptWalk/innerKeptWalk: the path `seen` cut is gone
  (and the `seen` parameter with it); `done` alone terminates (no-value states enter `done` before their fields are
  walked; literal states descend into the literal). Fixes failopen1 (head-only regression) and preexist1 (a base fail-open).
- Gap filed + resolved: g-boot-tape-walk-literal-cycle-cut-s480 (HIGH, security-class fail-open).
- Tests: describe "r1" in shared-graph-walks-s480.test.js (6 red on e8e943792); the recursive-tape test now expects
  `@t.kids` and `@t.kids[…].kids` (the element-held tape, rule 1 / RULED S472 item 1).
- Differential (~/.cache/scrml/review/s480-1994-r1/tdiff3.mjs, with an oracle): 12 000 programs, 6 801 valid; fixed
  head = oracle everywhere (analyze + Core flip); base fail-opens 411, pre-fix head 433.

## r2 (review:#1994 HIGH-2, LOW-a, LOW-b)
- HIGH-2: check.scrml keptWalk memoizes clean literal states by (Local sym, struct, keptPathClass): the path
  when some StructOf field value in the program reads a place under it (OnceBinds.keepReads), else "*".
  plain24/reclet24 (>90 s), tri13 (6.6 s), let24 (47 s, base too) → ~6 ms checkCore.
  Gap filed + resolved: g-boot-tape-walk-let-dag-exponential-s480.
- LOW-a: analyze.scrml TapeWalk.fields — each tape field DECLARATION hit once (first path).
- LOW-b: keepFieldHint — a field under a value replaced whole gets the nested-rebuild hint.
- Tests: describe "r2" + updated F1 expectations (36 pass).
