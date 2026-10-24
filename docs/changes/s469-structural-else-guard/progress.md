# s469-structural-else-guard — progress

Gap: `g-structural-element-if-chain-and-show-composition-nominal` (MED → HIGH security) + the `if=`-ignored
class (`g-if-on-structural-element-silently-ignored`). Branch off `origin/s469-engine-if-chain-refusal` (b0cffc6a4).
Limb: impl#1 SECURITY — refuse, never render.

## Measured (happy-dom, base b0cffc6a4) — probe: elements x {else, else-if=} x {top, nested, row, component, lift}

`else` / `else-if=` FAIL OPEN (both branches render, exit 0):
- `<engine>`: top, nested. (row / component: refused E-COMPONENT-ENGINE-SCOPE; lift: E-CTRL-001.)
- `<match>`: top, nested, row, component. (lift: E-MATCH-BLOCK-IN-LIFT.)
- `<each>`: top, nested, row, component, lift.
- `<empty>` (on an `<each>`'s fallback): `else` / `else-if=` / `if=` all ignored, every position.
Markup / component use-site `<C else>` / `<errorBoundary else>` / `<render else>`: chain members, correct.

`if=` IGNORED (content renders with the condition false, exit 0):
- `<errorBoundary if=>`, `<render if=>`: top, nested, component (row / lift honour it).
- `<empty if=>`: every position.
- `<engine|match|each if=>`: honoured (S302 original symptom fixed).
- `<onTimeout if=>`: silent, no diagnostic (lifecycle, not render).

## Done

- [ ] structural openers keep `else` / `else-if=` (ast-builder `captureStructuralChainAttr`, `chainAttr` field);
      one TAB check `refuseUnconsumedStructuralChainAttrs` (E-CTRL-001 / E-CTRL-002) after `collapseIfChains`.
- [ ] CE reports the refusal as itself in a component body (not E-COMPONENT-021).
- [ ] emit-lift: lifted `<each else>` backstop (the nested-each route skipped the markup backstop).
