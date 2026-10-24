# s469-keyed-row-if-gate — progress

Gap: `g-keyed-row-control-flow-if-not-reevaluated-s469` (HIGH, security). Branch `s469-keyed-row-if-gate` from
origin/main 27f897748 (includes #1529). Limb: impl#1 `compiler/src` (security: a guard stays open after revoke).

## Log
- startup: worktree clean, bun install, compile-test-samples OK.
- repro: compiler/tests/browser/keyed-row-if-gate-s469.browser.test.js — 22 cases (root vs element `if`;
  `r.ok`, `@role`, if/else, else if, nested, around a nested loop, multi-root, siblings, index keys, typed
  input). On origin/main: 22 FAIL (every case shows gated content while its condition is false).

## Design
- `if` that decides a keyed row (an arm lifts, or `continue` / `return` / `break`) and a lifting `match` statement:
  - inside an ELEMENT of the row, no early exit, reading only own names / the row item / cells / file-level bindings
    (liftRegionSafe): REGION of the keyed row (emitIfStmtWithContainer) — anchor + child owner scope + tracked effect
    reading the item from a per-row slot republished only on item identity change. Row stays keyed.
  - elsewhere: row lowered plain (liftForTreeIfPins → forLiftTreeHasImpureLoop); liftNoteRowIfPlainLoop counts it like
    an open gate (group forced re-render / arm) or refuses it (function body) — E-IMPL1-LIFT-GATE-UNTRACKED.
  - prediction miss at emission → refused.
- bind:value/checked initial read untracked (plain lists rebuilt on every keystroke otherwise).

## Log (cont.)
- 32563932f fix + peter-19 / LIFT-5 / example-js-validity / s427 M1 fixtures moved to the element form (keyed path),
  root form pinned plain; pack n27 98 shapes (main 84 FAIL, branch 0).
- caa852a3a if-region item slot (reorder no longer rebuilds the arm); bind init untracked; round-6 arm_in_row
  cell/vi expectations = conditions' truth.
- 19b0be4e1 lifting match statement pins the row; refusal wording; browser +5; pack n27 +3 (902).
- corpus: 3,753 files; error sets identical (stdlib diffs were a layout artifact — identical with same-layout copies);
  keyed → plain 2 lists / 2 files of 264 keyed call sites (gauntlet-r10-go-contacts inline-edit row; lift-5-repro);
  0 regions; visible-set differential over perturbed cell steps: only the list wrapper <div> differs.
- docs: SPEC §17.1 impl#1 note + §34 E-IMPL1-LIFT-GATE-UNTRACKED row; SPEC-INDEX regen; known-gaps: resolved
  g-keyed-row-control-flow-if-not-reevaluated-s469, filed g-lift-loop-region-rebuilds-on-every-reconcile-s469 (LOW),
  g-match-stmt-lift-in-lifted-element-lands-outside-s469 (MED), narrowed g-lift-group-non-single-if-rerender-loses-
  input-state-s462; state.ts --write.
