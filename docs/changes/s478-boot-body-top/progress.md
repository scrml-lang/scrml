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

Conformance h3 vs base: PASS 422→437 (+15), FAIL 142→118, UNSUPPORTED 665→674. Moves (review r1 re-measured; the
first write-up said FAIL→PASS 12 / UNSUPPORTED→PASS 5 / FAIL→UNSUPPORTED 15): FAIL→PASS 17, FAIL→UNSUPPORTED 10, PASS→FAIL 2, UNSUPPORTED→FAIL 1 (all three: C1 `;` — see below).
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

## Next
- (d) C10 nested `${ … }` statement blocks in markup — second branch.

## Fix round 1 (review of #1876)
- H1: analyze `resolveRun` → `runReturnSpans`: a `return` in a body-top run (bare, at the top of a body-top
  `${ … }`, nested in `if` / loop bodies / `match` arms, not inside a `fn` / lambda) is
  E-STMT-RETURN-OUTSIDE-FUNCTION (§34 row: "Also a `return` at the top of a `${ … }` logic block, or nested there
  only in control flow that runs in place"). severity.scrml regenerated. Handler blocks / effect bodies keep
  `return` (§5.2.3: an inline handler block has "the same statement grammar as a function body"; §6.7.4 effect
  teardown `return () => …`) — no change, no gap.
- LOW-2: `"a"; @n = 5;` — `"a";` (a code string by §40.8's own-line test) is the literal-only statement, its
  E-UNQUOTED-DISPLAY-TEXT ends at its `;`, `@n = 5;` is code.
- LOW-1: `Don't panic.` — a token running past the failing line ends the display run at the line and the body is
  re-read from the next line (no E-PARSE-UNCLOSED cascade, §4.18.7).
- LOW-4/5/6/8 filed: g-boot-body-top-regex-unicode-as-prose-s478, g-boot-body-top-template-span-s478,
  g-boot-body-top-tilde-exemption-s478, g-boot-run-before-dom-insertion-s478.
- `;` migrated in error/async-not-in-scrml, fn/async-decl-reject, loop/loop-006-neg (impl#1 `bun conformance/run.ts`
  result lines identical before/after).

## Owner rulings S478 (body-top owner questions) — on s478-boot-body-top
- Ruling 1: the INTERIM own-line display-literal test is kept as-is.
- Ruling 3 (cases, not compiler): declared-prose-renders + ctrl-012-default-logic-prose-neg `dom` re-pinned to §4.18.5
  (no formatting whitespace between display literals) — impl#1 PASS→XFAIL on both, carried gap
  g-impl1-body-top-display-literal-formatting-whitespace-s478 (signatures recorded); both ctrl-012 `if (1)` cases →
  `if (true)` (keeps each case's point; impl#1 still PASS); forms/validator-applies-* reads moved into `<p>${…}</p>`
  (impl#1 still PASS). Bootstrap: all PASS except forms/validator-applies-typed-clean, now twin-extra-error
  E-VALIDATOR-DEAD (validators on cells no form input binds) — a separate question, not the no-effect one.
- Ruling 4: `Counter;` at a bare-run body top is E-STMT-NO-EFFECT (message names the declared forms) + E-SCOPE-001;
  elsewhere withoutRefusedNoEffect still drops it (g-boot-body-top-lone-name-no-effect-s478 resolved).
