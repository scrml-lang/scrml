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
