# s478-boot-body-top — progress (crash-recovery anchor)

Lane: S478 conformance clusters C3 (body-top / top-level `${}` statements) + C10 (nested `${}` statement blocks).
Branch: s478-boot-body-top (from origin/main af7fe4bab).

Baseline (af7fe4bab): PASS 422 · CODES-ONLY 4 · FAIL 142 · NOT-TWINNED 635 · UNSUPPORTED 665. All 55 C3/C10 cases FAIL.
Measurements: ~/.cache/scrml/review/s478-body-top/ (base.json, h2.json = (a)+(b), h3.json = +(c); corpus-*.json; semicases/).

## Done (commit 1: (a) + (b) + (c))
- (a)+(b) parse.scrml `bodyTopRun` — a bare run at a `<program>` / `<page>` body top is read statement by statement:
  standalone `"…"` → Text / Interp nodes; not-code lines → ONE E-UNQUOTED-DISPLAY-TEXT per maximal run (§4.18.7);
  literal-only statements and `Total: 42` → E-UNQUOTED-DISPLAY-TEXT (§40.8); a statement a recognizer NAMES keeps
  its code. `parseStmtRun` — a `${ … }` block's top-level statements. A run of statements = `ANodeK.Run` →
  `View.Run` → `rt.run(scope$, …)` (runtime.js `run`): once, as the scope is built, in source order.
  analyze `resolveRun` (handler-block env: writes / host calls allowed; loopChecks); typed / lin-checked /
  suspension-planned via nodeActions as a handler block. Body-top `const` / `let` / `export const` → the same
  item as in `${ … }` (new LexStop.Decl; logicRegionItem reads ONE item and hands the rest back).
  refusals.scrml: E-UNQUOTED-DISPLAY-TEXT is a symptom code (a known construct at the body top keeps its name).
  A statement outside `<program>` → strayEffects E-BOOTSTRAP-UNSUPPORTED.
- (c) parse.scrml `logicBlockTP` + lex.scrml `lexTier0X(bare)` — markup in a body-top `${ … }` (`lift <x>`, bare
  `<x/>`, implied-lift arm) read as markup: `<script>` / `<style>` → E-SCRIPT-001 / E-STYLE-001 on the element
  (§4.17 S462), any other markup refused by name (INTERIM, g-boot-logic-block-markup-statements-s478).

Conformance h3 vs base: PASS 422→437 (+15), FAIL 142→118, UNSUPPORTED 665→674. Moves: FAIL→PASS 12,
UNSUPPORTED→PASS 5, FAIL→UNSUPPORTED 15, PASS→FAIL 2, UNSUPPORTED→FAIL 1 (all three: C1 `;` — see below).
PASS→FAIL / UNSUPPORTED→FAIL explained: error/async-not-in-scrml, fn/async-decl-reject, loop/loop-006-neg —
the bootstrap now reads the function / loop body that the E-PARSE-ITEM cascade used to hide, and that body's
`return 1` / `return id` / `let a = i` lacks its `;` (§7.2.2 rule 1, cluster C1). Editing the cases was not done
(case files are the L1 lane's / need permission).

`;`-only (C1) measured (semi.ts on h2): 12 of my cases PASS once `;` is inserted at the bootstrap's own
E-STMT-MISSING-SEMICOLON spans: body-top/{bare-write-is-legal, code-line-after-declaration-runs,
no-effect-statement-rejected, template-const-renders}, linear/{lin-001-never-consumed-neg, lin-002-double-use-pos},
loop/loop-002-continue-outside, module/e-import-001-export-inside-logic-clean, reactive/{hoist-forward-ref-neg,
reset-init-after-assignment-rt, write-not-in-logic-context-neg, write-not-in-logic-context-pos}; + 1 CODES-ONLY
(foreign/foreign-slice-no-free-capture-neg).

Corpus (3,149 files, conformance/cases + samples + examples + acceptance, raw sources, base vs h2):
0 newly rejecting, 1 newly accepting (ctrl-012-default-logic-prose-neg — display literals), 899 changed diag sets
while still rejecting (E-PARSE-ITEM −822 → the real diagnostics behind it).

## Case questions (case looks wrong per SPEC)
- body-top/declared-prose-renders, control-flow/ctrl-012-default-logic-prose-neg: DOM expects spaces between
  display literals; §4.18.5 "Whitespace outside a display-text literal but inside a code-default body … is source
  formatting and is NOT content".
- control-flow/ctrl-012-bare-control-flow-default-logic-root-neg, …-non-leading-residual-neg: `if (1) { }` is
  E-COND-NOT-BOOLEAN (§42 / S440 condition rule); the cases expect clean.
- forms/validator-applies-*: `${ @age }` at a body top is a statement list → E-STMT-NO-EFFECT (S447 reading 7).
- body-top/lone-identifier-is-code: C1 + g-boot-body-top-lone-name-no-effect-s478.

## PR 1
https://github.com/scrml-lang/scrml/pull/1876 (branch s478-boot-body-top, (a)+(b)+(c), merged with origin/main 47d1250cb).
Conformance vs 47d1250cb: PASS 422→437, FAIL 142→118, UNSUPPORTED 665→674.

## (d) — branch s478-boot-nested-logic (from PR 1)
- parse.scrml `nestedLogicAhead` / `parseNestedLogic` — a `${ … }` in a free-text markup body that starts with a
  declaration is a logic block (a statements-only block is left to its element — a `<timer>` / `<poll>` body names
  its own refusal; first cut also took a top-level `;` and pre-empted that refusal, request-refs-s475): its fn / type / const items are hoisted (MP.hoist) to file
  scope (§7.6 S439 #12); the block renders nothing and does not split the text around it. Statements / import /
  export / declarations there are refused by name (INTERIM, g-boot-nested-logic-statements-s478).
- Conformance h5 vs h4: FAIL→UNSUPPORTED 3 (block-047, both cleanup cases), UNSUPPORTED→FAIL 1
  (server-fn/e-route-004-pos: now reaches the `cb: fn()` parameter, reported E-STRUCT-FUNCTION-FIELD by the refusal
  table instead of E-ROUTE-004 — g-boot-fn-type-param-labelled-struct-field-s478). PASS 437, FAIL 116, UNSUPPORTED 676.
- `;`-only (C1): server-fn/{branch-declared-server-fn-routes-to-server (runtime), e-route-003-neg, e-route-004-neg}
  PASS once `;` is inserted (15 of the cluster in all).
- Tests: slice-m4/nested-logic-s478.test.js (6).
