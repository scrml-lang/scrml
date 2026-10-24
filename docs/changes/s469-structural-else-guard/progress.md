# s469-structural-else-guard — progress

Gap: `g-structural-element-if-chain-and-show-composition-nominal` (MED → HIGH security) + the `if=`-ignored
class (`g-if-on-structural-element-silently-ignored`, `g-if-reject-unenforced-on-structural-declaration-elements`).
Branch off `origin/s469-engine-if-chain-refusal` (b0cffc6a4); origin/main merged after #1526 landed.
Limb: impl#1 SECURITY — refuse, never render.

## Measured (happy-dom, base b0cffc6a4) — probe: elements x {else, else-if=, if=, show=} x {top, nested, row, component, lift}

`else` / `else-if=` FAIL OPEN (both branches render, exit 0):
- `<engine>`: top, nested. (row / component: refused E-COMPONENT-ENGINE-SCOPE; lift: E-CTRL-001.)
- `<match>`: top, nested, row, component. (lift: E-MATCH-BLOCK-IN-LIFT.)
- `<each>`: top, nested, row, component, lift.
- `<empty>` (on an `<each>`'s fallback): `else` / `else-if=` / `if=` / `show=` all ignored, every position.
Markup / component use-site `<C else>` / `<errorBoundary else>` / `<render else>`: chain members, correct.

`if=` IGNORED (content renders with the condition false, exit 0):
- `<errorBoundary if=>`, `<render if=>`: top, nested, component (row / lift honour it).
- compound-state namespace wrapper `<signupForm if=>`.
- `<empty if=>`: every position.
- `<engine|match|each if=>`: honoured (S302 original symptom fixed).
- `<onTimeout if=>` / `<onIdle if=>`: silent, no diagnostic (lifecycle, not render). `<onTransition else>` ignored.

`show=` IGNORED: `<engine>` / `<match>` / `<each>` (every position), `<empty>`, `<errorBoundary>`, `<render>`,
a lifted `<each>`.

## Done

- [x] structural openers keep `else` / `else-if=` / `show=` (ast-builder `captureStructuralChainAttr`,
      `captureStructuralShowAttr`; `chainAttr` / `showAttr` fields); one TAB check
      `refuseUnconsumedStructuralChainAttrs` (E-CTRL-001 / E-CTRL-002 / E-GATE-UNSUPPORTED-HOST) after `collapseIfChains`.
      `derived=if … then … else …` not misread (an `else` closing a pending `if` word in the same value).
- [x] CE reports the refusal as itself in a component body (not E-COMPONENT-021).
- [x] emit-lift: lifted `<each else>` / `<each show=>` backstop (the nested-each route skipped the markup backstop).
- [x] emit-each `renderEmptyChildToJs`: `<empty>` if= / show= / else / else-if= refused.
- [x] emit-html: if= / show= ahead of the IF_GATE_BYPASS_TAGS dispatches + the compound-parent wrapper refused
      (E-GATE-UNSUPPORTED-HOST; gate-attr-refusal.ts shared message).
- [x] onTimeout / onIdle (engine-statechild-parser `timerGateAttr`, symbol-table `timerGateAttrDiagnostic`),
      onTransition `else` (type-system).
- [x] tests: browser `structural-else-guard-s469` (94; 73 fail on base), ssr-a-terminus (g)/(i) re-pinned,
      if-on-structural-elements timers, conformance `i-ssr-each-client-rendered-if-gate-bypass-neg` re-pinned.
- [x] security pack n27 (43): base 41 FAIL / 2 PASS-REFUSED; branch 43 PASS-REFUSED. Count 758 → 801.
- [x] SPEC §17.1.2 enforcement note, §17.1.2.2 divergence note, §34 E-GATE-UNSUPPORTED-HOST + E-CTRL-001/002;
      SPEC-INDEX regen; s34-census --check-new PASS; gen-bootstrap-severity: no change.
- [x] bootstrap probe (read-only): every shape E-BOOTSTRAP-UNSUPPORTED (engine / match / errorBoundary / empty
      elements, `<each else=>` / `<each show=>` named); plain markup chain compiles.
- [x] known-gaps: three entries resolved (structural chain raised to HIGH), new
      g-render-element-in-each-row-or-lift-renders-nothing-s469; state.ts --write.
- [x] corpus differential (scripts/corpus-emit-differential.ts, 2864 sources, base b0cffc6a4 vs head): 1 newly refusing — conformance ssr/i-ssr-each-client-rendered-if-gate-bypass-neg (intended, re-pinned); 170 artifact diffs, ALL the `_scrml_project_root` checkout path (0 after root normalization); 0 syntax regressions.
- [x] CI blocking-job commands: all exit 0 (facts --check exit 1 = stale FACTS.md, WARN-only by design; not regenerated).
