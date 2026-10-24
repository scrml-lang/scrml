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

## Round 2 (review of 456158a63 — FIX)

- [x] Stopped and reported: the markup tokenizer cannot read a `derived=` value (its `>` / `=>`). Ruling: option 1.
- [x] Structural openers read by `tokenizeAttributes(…, "markup")` + `parseAttributes` (`readStructuralOpenerAttrs`,
      `structuralGateFields`); word walk, mask, `pendingIf` deleted; `captureStructuralIfAttr` replaced.
- [x] `<engine derived=…>`: tokenized up to `derived=`; extent → `parseExprToNode` (`${}` → `logicBlockClose`);
      leftover → E-ENGINE-DERIVED-NOT-LAST. Other opener slots read from the prefix only. Bare `if` → E-CG-003.
- [x] `<match>` / `<each>` opener END from the tokenizer (`tokenizerOpenerEnd`).
- [x] timers / state-children / match arms (codegen `buildMatchArms`) / component-body `<slot>` / `<md show=>`.
- [x] differential test (354), pack n27 +61 (862), SPEC (§17.1.2.2, §51.0.J, §34), gaps.
- [x] merged origin/main (4e1983534); CI blocking commands all 0 (facts WARN 1; bootstrap-conformance regenerated); `bun test compiler/tests/browser` 2055 pass / 8 fail = the 8 browser-baseline names; corpus differential vs main: only the round-1 intended refusal, 170 artifact diffs all the checkout path.

## Round 3 (review of 412b77b8b — FIX on one HIGH regression)

- [x] HIGH-1: every attribute-reader refusal (ATTR_OP_REJECT → E-ATTR-UNQUOTED-OPERATOR / -MULTI-STATEMENT) reported
      on structural openers, forwarded out of sub-builds, and on raw-text openers (`scanOpenerGateAttrs`); the
      builder expression slots (`<each in= of= key=>`, `<match on=>`) end at the expression parser's extent.
- [x] MED-1 (arm openers), MED-2 (trim before `derived=`), LOW (comma sequence; VAR-DUPLICATE cascade).
- [x] Case variants: E-GATE-ATTR-CASE on any element (one predicate `gateAttrCaseVariant`).
- [x] SPEC: `<onTransition>` off the §17.1.2 reject list (ruling 69d6636); round-3 note; §34 E-GATE-ATTR-CASE.
- [x] differential test (849), pack n27 +275 (905 → 1180; main 801 after #1529 merged), gaps.
- [x] corpus differential vs main 27f897748: 0 new refusals (only the round-1 intended one), 170 path-only diffs.

## Round 4 (review of 20fadd7b4 — FIX on two fail-open holes)

- [x] HIGH-1: every scratch error forwarded (dropped values `-1` `+1` `.5` `~1` `)` `]`); sigil slots
      (`initial=.V`, `accepts=:T`) exempt unless the left name is a gate; raw-text openers report dropped values;
      a swallowed-gate E-ATTR-001 forwarded out of `<each>` rows (markup `<p tabindex=-1 if=@n>` in a row leaked too).
- [x] HIGH-2: slot loop strictly progresses, no cap.
- [x] LOW: slot ends at the next top-level `name=`; declared component prop `Show` exempt (CE).
- [x] differential test 972; pack n27 +142 (1180 → 1322); SPEC note + §34 row; gaps.

## Round 5 (review of 88d71e8ba — FIX on one HIGH)

- [x] HIGH-1 / M3 / L3: no attribute token is silently skipped (parseAttributes, raw-text scanner, arm-opener bail).
- [x] sigil exemption exact (one `.`/`:`, bare identifier, no `=` after); M5 reserved-word values; M1 registered components only.
- [x] M2 / M4 filed (security gaps, repros).
- [x] differential test 1044; pack n27 +26 (1322 → 1348); SPEC note; gaps.

## Round 6 (review of 9be2cecf9 — last round)

- [x] aliased component imports registered by their local name.
- [x] whitespace (state) openers: gate refused (E-GATE-UNSUPPORTED-HOST); parseTypedAttributes no-skip / dropped-value / reserved-word refusals; gap filed resolved-by-refusal.
- [x] differential test 1056; pack n27 +6.
