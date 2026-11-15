# s478-boot-run-locals — progress

Lane: build owner ruling S478 body-top question 2 (body-top run locals are FILE-SCOPE, §7.6);
closes g-boot-run-locals-scope-s478. Base: origin/s478-boot-nested-logic (PR #1880).

## Done
- analyze resolve: `resolveNodes` carries a program-body run's top-level locals into later
  sibling nodes (`resolveRunEnv` / `resolveBlockEnv`); `<page>` regions scoped (`pageIndexAt`).
- typer: `typeNodes` carries a run's top-level locals (`tWithLocals`).
- linPass: Runs no longer walked as standalone action positions; `linProgramRuns` walks each
  program body in order (runs + markup), counts one consumption per appearance, refuses
  effect (E-LIN-004), request (E-LIN-006), loop/each (E-LIN-002), attr/handler/if=/use/page
  crossing (E-BOOTSTRAP-UNSUPPORTED); name-table backstop; a lin bound after a wait and read
  outside its run is refused.
- fileNameClashes: run locals are file-scope names (E-SCOPE-010); vs a cell E-NAME-COLLIDES-STATE.
- a function body reading a run local: named refusal (E-BOOTSTRAP-UNSUPPORTED), no E-LIN-001 cascade.
- core View.Run gains `hoist: Sym[]`; lower `runView` rewrites top-level Lets to Assigns;
  print `runJs` declares `let name;`; walk `viewBinds` binds them (C21).

- tests: slice-m4/run-locals-s478.test.js (20 tests; 18 red on base, 2 guards green on base).
- docs/lin.md:191 spec-ahead marker removed (claim-gate: 5 pass, 0 spec-ahead); stale
  "does not implement lin yet" sentence fixed.
- known-gaps: g-boot-run-locals-scope-s478 + g-boot-lin-logic-block-level-refused-s473 resolved;
  residue g-boot-run-local-lin-interim-positions-s478 filed.
- severity.scrml regenerated (E-LIN-004 / E-LIN-006 now emitted).
- Measurements (~/.cache/scrml/review/s478-run-locals/): conformance base vs head — 0 cases
  changed (PASS 456 both); corpus 3,175 files — 0 newly rejecting, 0 newly accepting, 0 changed.

## Next
- hook, push, PR.
