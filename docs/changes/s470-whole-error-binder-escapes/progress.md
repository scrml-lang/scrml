# progress — s470-whole-error-binder-escapes

- 2026-10-24 start: worktree verified at base 915b6775f; bun install + pretest ok.
- 2026-10-24 REPRODUCED on base 915b6775f (run.mjs + r6a/r6b copied to scratch): r6a 33 FAIL, r6b 7 FAIL (r6b library-import case UNJUDGED: harness gap).
  Escape 1 (shadowed callee): fullstack/library/tool `shadow const arrow`, `shadow let fn`, `shadow arm-local const/fn`; all sides `shadow nested param`; library/tool `fn shadowed in fn by const`; r6b `import check + nested local check`, `top-level const check + nested fn check`, `fn declared after shadow param in fn` (lib/tool).
  Escape 2 (log inherited): `fn body log param` (server, library), `fn body local log` (server, fullstack, library; tool PASS-500).
  Escape 3 (ctor residual): `ctor data member` all 4 sides; `ctor extract match`, `ctor extract dot ctor`, `ctor extract match eq` (server, tool).
- 2026-10-24 DONE escapes 1+2 (type-system.ts): audit ctx now carries the LEXICAL scope + declaration frames;
  callee resolved via the existing `resolveFnBinding(name, scope, forExact=true)` (exactly one decl, else refuse);
  a name any frame declares (arm body, re-parsed nested body, callee params/body) is refused; callee body audited
  in its decl scope with its own frames; `log` builtin recomputed per body (auditLogIsBuiltin), and never the
  builtin if the file declares/imports `log` anywhere. r6a 33 -> 10 FAIL (all 10 = escape 3), r6b 7 -> 0.
  Locus hypothesis HELD (auditBinderCallArgs / auditWholeErrorBinderText).
  NEXT: escape 3.
- 2026-10-24 escape 3 — PREFERRED fix NOT reachable on the proven path: impl#1 has no expression typing for a
  ctor call (`Box.Wrap(e)`), types `const b = …` from literals only, and binds match payload binders as `asIs`
  (type-system.ts case "match-arm-block": "variant payload type inference is a separate concern"). So
  "refuse payload read on ANY enum-typed value, from the value's type" cannot see `b`, `i`, or the ctor result.
  Took the brief's FALLBACK: refuse a whole `e` into a variant constructor (E-TYPE-031, message labelled impl#1
  limitation). COST: this newly-rejects SPEC §18.6.1's own example `@state = .Failed(err)`.
- 2026-10-24 ADJACENT escape found (new, same family): `_ e :> match e { .Wrapped(i) :> i.reason == "bad" }` where a
  field of the variant holds an enum — i is an enum value read as a struct; logged in on server/tool (r7 probes).
  Fixed in-audit, fail closed: a `match <binder>` arm binding a payload of a variant with any enum-holding /
  unresolvable field is refused (E-TYPE-031, impl#1). COST: valid `.Wrapped(i) :> match i {…}` / `i is .Bad` refused.
  r6a 10 -> 0 FAIL, r7 (new, 28 shapes) 16 -> 0 FAIL.
  (the nested-binder refusal IS committed: 1145d53cf "refuse an enum-holding payload binder")
- 2026-10-24 STOP on escape 3 (brief's STOP rule): the ctor-refusal FALLBACK newly-rejects real corpus —
  examples/09-error-handling.scrml (`_ err :> { @phase = .Failed(err); return }`, lines 113/117; the canonical
  "hold the error in a state" idiom, and SPEC §18.6.1's own example) — and breaks
  compiler/tests/integration/s461-runtime-tree-shake.test.js (compiles examples/09). The commit carrying it was
  blocked by the pre-commit gate; the ctor refusal was REVERTED (never landed). Patch kept in scratch for the report.
  Escape 3 stays OPEN; its shapes are in the pack as KNOWN_FAIL (18: s11/t6 x6, f8/l6 x3).
- 2026-10-24 probe pack: + r8-shapes.js (s11 / f8 / l6 / t6, 128 shapes), EXPECTED_SHAPE_COUNT 1920 -> 2048, pins
  regenerated from a run (not hand-written classes). r8 on base: 54 FAIL; on branch: 18 FAIL (all escape 3, KNOWN_FAIL).
  NEXT: full gate, types:check, R26 corpus on base vs branch.
- 2026-10-24 gates: types:check OK (181 diagnostics, unchanged). R26: 913 files (examples/*.scrml + samples/**),
  base 915b6775f vs branch — diagnostic codes IDENTICAL for every file (0 newly-rejected). Only 3 corpus files
  use a whole binder (examples/09, 16, 29). Measured separately: the reverted ctor-refusal fallback
  newly-rejects examples/09-error-handling.scrml (E-TYPE-031 x2), nothing else.

## Gap status for the PA to file (do not edit known-gaps.md here)
- `g-impl1-whole-error-binder-allowlist-escapes-s469` (HIGH) -> PARTIAL. Escapes 1 (callee by name) and 2
  (`log` inherited) FIXED; the adjacent `match e { .Wrapped(i) :> i.reason }` FIXED (refused, impl#1). Escape 3
  (whole `e` into a variant constructor) OPEN: 18 KNOWN_FAIL shapes in r8 (s11/t6 x6, f8/l6 x3). Decision owed:
  (A) the fallback refusal (closes it; newly-rejects examples/09 and SPEC §18.6.1's `@state = .Failed(err)`), or
  (B) the typed path (below), which closes it AND the new gap.
- NEW `g-impl1-enum-value-member-read-unchecked-s470` (HIGH). Locus: `compiler/src/type-system.ts`
  `checkRowFieldAccessInExpr` checks member reads on STRUCT-typed idents only; match / `!{}` payload binders
  are bound `asIs` (case "match-arm-block"; the `!{}` arm binding loop). Symptom: a payload field read off an
  enum value compiles and reads `undefined`: `!{ .Wrapped(i) :> i.reason == "bad" ? … }` and
  `function chk(x: Inner) { return x.reason == "bad" }` log a wrong password in (server + tool, scratch r9).
  §18 normative: "The type of each bound variable SHALL be the declared type of the corresponding field".
- Code label: the S470 refusals use E-TYPE-031 (this audit's existing code) with "impl#1 limitation, not a
  language rule" in the message; no new §34 code minted. If a labelled E-IMPL1-* code is wanted, that is a SPEC
  §34 row + ruling.

## Fix round 1 (review of frozen d015e3e34; probes ~/.cache/scrml/review/s470-l1/)
- RULING (bryan, S470): escape 3 -> "(B) Type the binders (Recommended)". The (A) constructor refusal is NOT
  landed. Escape 3 stays KNOWN_FAIL here. POINTER: lane (B) — type match / `!{}` payload binders from their
  declared field type (§18 "The type of each bound variable SHALL be the declared type of the corresponding
  field") and refuse a non-`.variant` member read on an enum-typed value (E-TYPE-004) — is a SEPARATE
  type-system lane the PA dispatches after this one lands (same file, cannot run concurrently). It closes
  escape 3, `g-impl1-enum-value-member-read-unchecked-s470` (reviewer Q4), and lets the S470 refusals of
  `.Wrapped(i) :> match i {…}` / `i is .Bad` (reviewer Q3 / Q7) be lifted.
- 2026-10-24 reproduced on d015e3e34 with the reviewer's run.mjs + shapes1–5: D1/D2/D4/D6 FAIL all 4 sides;
  R3 FAIL fullstack; F1/F2/F4–F7/L3/L4 FAIL tool; Q4 FAIL all sides (lane B); Q1 / P2 refused; D3 crash.
- #1 FIXED — an audited callee's parameter defaults are audited (each default naming the parameter is parsed
  with auditParseBody and walked with the same audit + use count; a non-text default is refused).
- #2 FIXED — the global scope obeys exactly-one-declaration: the file's top level is counted (functions,
  const / let / cell / bare decls, destructured names, `export const|let`, imports); != 1 -> refused.
- #3 FIXED — a `!{}` inside a function written as a value is audited: at every `checkLogicExprIdents` site
  (the site that already walks such bodies for the ruled-form check), each function-expression / block-arrow
  body is read with the existing check-time reader `escapeHatchBodyStatements` and each `!{}` in it is
  audited through the same `auditWholeBinderArms` the statement visitor now calls, with the function's params
  and body as frames. No new reader. (A body that reader cannot read is skipped: left to the checks that refuse it.)
- #4 FIXED — the enum-holding payload refusal checks only the BOUND fields. Found while fixing: the
  `match-arm-block` `payloadBindings` list flattens a named form (`.V(code: _, inner: i)` reads `["_","i"]`,
  while the lowering binds `i = data.inner`), so positions are read from the arm's pattern TEXT (`binding`),
  never from `payloadBindings`; a positional binder also checks the field it is named after (legacy
  name-as-field binding); an unread part checks every field. Q3 / Q7 refusals stay (lane B lifts them).
- #5 FIXED — a function declared directly in an audited callee's body (the only declaration of the name in
  every frame) resolves through the scope the checker registered it on (`fnDeclScope`); P2 compiles again.
- #8 FILED (not fixed, per instruction) — NEW gap `g-impl1-destructured-param-crashes-whole-error-audit-s470`
  (LOW): `function f({ reason }: AuthErr)` passed `e` crashes the compiler ("name.replace is not a function",
  `countWordUses` on a non-string param name in `auditBinderCallArgs`); base and head. Fails closed (no output).
- #6 / #7: no action.
- reviewer probes after the fix (shapes1–5, 4 sides): only FAILs left are Q4 x4 (lane B). Every change vs
  d015e3e34 is FAIL -> PASS-REFUSED (the fixes), PASS-500 -> PASS-REFUSED (server F*), PASS-REFUSED -> PASS
  (P2, Q1) or server R3 PASS -> PASS-REFUSED (the duplicate top-level name, now refused on every side).
- pack: + r8 "5 D1/D2/D4/D6/R3/F1/F2" + "VALID Q1" (32 shapes), EXPECTED_SHAPE_COUNT 2048 -> 2080; full pack
  2083 pass / 0 fail.
- 2026-10-24 fix-round gates: unit+integration+conformance --bail 40426 pass / 0 fail / 125 skip / 18 todo;
  types:check OK (181, unchanged); R26 913 files base 915b6775f vs branch: diagnostic codes IDENTICAL (0
  newly-rejected). DONE.

## Fix round 2 (review of frozen 43d162d52; probes ~/.cache/scrml/review/s470-l1b/ s6–s16)
- ROOT FIX (binding shape): the whole-error binder audit is now keyed on the `!{}` NODE. ONE call site:
  `_checkExpressionPositionHandlers` (the existing post-walk generic walker over every node of the file,
  already used for expression-position handler exhaustiveness) calls `auditWholeBinderArms` once per `!{}`
  — a statement `guarded-expr` or an expression-position guard-marker call (`guardCallArmsRaw`) — at any
  depth, with:
  - scope: the scope the statement walk recorded for the nearest visited node (`visitNode` records
    `_wholeBinderNodeScope`, one generic line); global if none;
  - frames: params + bodies of the functions written as values between that node and the `!{}`
    (`lambda`; `escape-hatch` bodies read with `escapeHatchBodyStatements`; function-decl param
    defaults read with `parseExprToNode`) — empty frames valid;
  - enum: the one the statement walk resolved for a statement `!{}` (`_wholeBinderGuardEnum`), else the
    callee's via `failableCalleeErrorEnum`; unresolvable -> every binder use refused.
  Arms the guard-arm reader (`parseGuardArmsFromRaw`) cannot read, and a parameter default the expression
  parser cannot read, are REFUSED (E-TYPE-031). Inside bodies read from text only the audit runs (the
  walker's exhaustiveness checks keep their original reach). REMOVED: the statement-case audit call and the
  round-1 `checkLogicExprIdents` hatch hook (+ its module-level variable).
- #1 HIGH FIXED (J1–J4) and #2 HIGH FIXED (E2/E5/E6/E8/E10, K3–K6, H6, M1c): by the root fix. E10 (a `!{}`
  in a parameter default) needed the default-reading above.
- #3 HIGH FIXED: `arguments` anywhere in an audited callee's body or parameter defaults is refused (tree,
  with the body-text use count as the backstop) — D13, D14, AR3, AR5, AR6.
- NEW (found by the probes, not in the brief): `arguments` in the ARM ITSELF (s7 AR1/AR2) — the arm is
  lowered inside a function receiving the error, so `arguments[0].reason` read the whole error in ANY arm
  (even `_ :>` with no binder). Logged a wrong password in on every side. FIXED: refused in every `!{}`
  arm body (E-TYPE-031, impl#1 limitation).
- #4 LOW (Q1 refused via E-CODEGEN-INVALID-LOGIC on fullstack/library — the B-form statement match there,
  unrelated to the audit) and #5 (D3 destructured-param crash, filed above as
  `g-impl1-destructured-param-crashes-whole-error-audit-s470`): no action.
- pack: + r8 "6 …" (19 shapes x4 sides + fullstack-only M1c = 77), EXPECTED_SHAPE_COUNT 2080 -> 2157.
  On 43d162d52: 60 FAIL / 17 PASS-REFUSED; on the branch: 77 PASS-REFUSED. Full pack 2160 pass / 0 fail.
- 2026-10-24 fix-round-2 gates: reviewer s6–s16 + shapes1–5 on 4 sides: only FAILs left are Q4 x4 (lane B);
  2 UNJUDGED (library G9 / G10, harness, same on the reviewer's run). unit+integration+conformance --bail
  40516 pass / 0 fail / 125 skip / 18 todo; types:check OK (181, unchanged); R26 913 files 43d162d52 vs
  branch: diagnostic codes IDENTICAL (0 newly-rejected; 43d162d52 was itself identical to main). DONE.

## CI jobs the hook does not run (on c26134ff4, commands as in .github/workflows/ci.yml) — all GREEN
- integration + lsp + commands (after `bun run pretest`): 9925 pass / 0 fail / 77 skip / 5 todo
- root conformance `bun test compiler/tests/*.test.js`: 2239 tests, 0 fail
- snippet-gate: 113 pass / 0 fail / 16 spec-ahead · claim-gate: 18 pass / 0 fail
- corpus-compile-floor --check: PASS · gen-md-shim --check: current · conflict-marker-gate: PASS
- regen-spec-index --check: OK · delta-lint: PASS · s34-census --check-new --base 915b6775f: PASS
- gen-bootstrap-severity --check: current · bootstrap-conformance --check: not required (no conformance/cases
  or self-host-v2 change)
- slices: lint-no-default-arm OK; slice-m1 / m2 / m1 lowered / m3 / m4 / codec all 0 fail
- e2e-render-map: 259 tests, 0 fail
- host-global-scan --check 1/2 and 2/2: exit 0, 0 violations (2 / 135 compiles threw — same counts as the
  S469 CI logs, pre-existing)
- browser: TodoMVC gauntlet compile + `node --check` OK; browser-baseline --check PASS (8 asserted)
- NOT RUN: `ci-shards.ts needs .github/workflows/ci.yml` — the worktree sandbox refuses the command (the
  `.github` path); this branch does not touch ci.yml.

## Fix round 3 (review of frozen c26134ff4; probes ~/.cache/scrml/review/s470-l1c/ s17–s21, c1–c8)
- #1 HIGH FIXED — a `!{}` nested in another `!{}`'s arm (call-arg / paren / named arm / 3-deep / a parameter
  default): every arm's handler is read the way the failable-call walk reads it (failable-value-calls.ts
  `guardArms`: a braced body via `parseStatementTextDetailed`, else its `handlerExpr` tree, else the text as
  a body via `auditParseBody`) and walked by the same post-walk, so the nested `!{}` reaches the ONE audit
  call; unreadable text holding `!{` is refused (E-TYPE-031, impl#1).
- #2 HIGH FIXED — an engine opener `effect=` (and every engine body `checkEngineRawBodies` reads with
  `readEngineBody`: state-child `effect=`, `<onTransition>` body / guard, timer delays, message arms): the
  statements that walk visits are registered and walked by the post-walk (the SAME parsed objects codegen
  lowers). An opener the statement walk never parsed (engine refused earlier) is read with `readEngineBody`.
- #3 HIGH FIXED — the handled call's enum is the enum of the callee the call names BY BINDING
  (`wholeBinderCalleeEnum` -> `wholeBinderResolveFn`, the round-1 callee resolver): a frame-declared name,
  an alias / shadow / not-provable binding -> unknown -> every binder use refused. `const w = wrapBig`
  beside `function w()! -> AuthErr` is now refused (s18 N2 / N4). A function binding in a scope that
  registers no declarations (a `<program>` / markup scope) resolves to the file's one declaration of the
  name (examples/09 kept compiling).
- #4 LOW FIXED — `arguments` read from the tree only (an `ident` / `shorthand` reference; never a property
  key or member name); the raw word count only where the text does not parse (c2 A3 / A4 / A5 now clean).
- #5 (the parser accepting an empty default): no action, noted.
- `arm.nestedHandlers` (ast-builder `_nestedHandlersIn`, a kind-less lint copy of a nested `!{}`): covered by
  the arm-body read above.

### Raw-text code fields — the coverage claim (grep of ast-builder.js / engine-statechild-parser.ts /
### match-statechild-parser.ts for fields holding unparsed code, plus a corpus dump of every string field
### holding `!{` across examples/ samples/ conformance/ stdlib/)
REACHED by the post-walk (read with an existing reader and audited):
- `!{}` arm `handler` (statement `guarded-expr` arms and guard-marker arms) — statement / handlerExpr / body reader
- guard-marker call literal `"!{…}"` — `parseGuardArmsFromRaw`
- `escape-hatch.bodyRaw` (function expression / block arrow) — `escapeHatchBodyStatements` (unreadable + `!{` -> refused)
- function / lambda `params[].defaultValue` — `parseExprToNode` (unreadable + `!{` -> refused)
- template `lit.raw` (`${…}` interpolations) — `templateInterpolationNodesAll`
- `expr.raw` WITHOUT `exprNode` (an attribute / handler value) — `parseHandlerStatementsForCheck`
- `when-effect` / `when-message` / `when-worker-message` / `when-worker-error` `.bodyRaw`, `onchange-decl.arms[].bodyRaw` — `parseStatementTextDetailed`
- engine bodies (`engineMeta.openerEffect`, state-child `effectRaw`, `<onTransition>` `bodyRaw`, guard `ifExprRaw`,
  timer delays, message-arm `bodyRaw`) — `readEngineBody` (the statements `checkEngineRawBodies` visits)
COVERED BY A TREE TWIN the walk reaches (the text is a copy): `expr`/`exprNode`, `init`/`initExpr`,
`condition`/`condExpr`, `iterable`/`iterExpr`, `if`/`ifExpr`, `for`/`forExpr`, `args`/`argsExpr`,
`update`/`updateExpr`, `header`/`headerExpr`, `result`/`resultExpr`, any `x`/`xExpr`/`xNode`;
whole-declaration source copies `function-decl.raw`, `export-decl.raw`, `component-def.raw`, `escape-hatch.raw`;
~~`match-block.armsRaw`; `_reparseEachArmBodyRaw`~~ — FALSE as written (round-4 review F1): see round 4 below;
`each-block.bodyRaw` (children); engine `rulesRaw` (source copy).
REFUSED-ON-FAILABLE elsewhere (`refuseFailableInTextSlot`: any failable call -> E-ERROR-002, so no `!{}` can
stand): engine `derivedExprText`, `inlineMatchBody`, `ifRaw`.
NOT CODE: `value` (string literals, markup text, comments).
EVERYTHING ELSE: a string field holding `!{` that none of the above covers is REFUSED (E-TYPE-031, impl#1).
Corpus dump at c26134ff4: the only `!{`-holding fields were lit.value/raw, expr.raw (+exprNode, and 1
without), comment.value, text.value, function-decl/export-decl/component-def raw, if-stmt.condition,
const-decl.init, match-block.armsRaw, escape-hatch raw/bodyRaw — all in the lists above.
- Known extra refusal: c3 E2b (an engine opener `effect=` holding `const f = () => wrap(x) !{ _ e :> … }`)
  gains E-TYPE-031 beside its existing E-ERROR-002 — that parse puts the `!{}` on the arrow, not on a call,
  so its enum is unknown (fail closed); the file did not compile before either.
- 2026-10-24 fix-round-3 gates: reviewer s6–s21 + shapes1–5 (4 sides): only FAILs are Q4 x4 (lane B);
  2 UNJUDGED (library G9/G10, harness, as before). c1–c8 vs the reviewer's c26134ff4 run: every change is
  CLEAN/OTHER-ERR -> AUDITED on a BAD shape, or AUDITED -> CLEAN on the `arguments` false positives (A3/A4/
  A5); no OK control newly refused except E2b above. Pack 2186. Gate unit+integration+conformance --bail
  40553 pass / 0 fail; types:check OK (181, unchanged); R26 913 files vs main 915b6775f: IDENTICAL.
  CI jobs (as before): lsp+commands 774 pass / 0 fail; root 2239 / 0 fail; e2e-render-map 259 / 0 fail;
  slices lint + m1/m2/m1-lowered/m3/m4/codec 0 fail; host-global 1/2 + 2/2 0 violations (2 / 135 threw,
  unchanged); snippet 113/0; claim 18/0; compile-floor PASS; md-shim current; conflict-marker PASS;
  SPEC-INDEX OK; delta-lint PASS; s34 --check-new PASS; bootstrap-severity current; TodoMVC gauntlet +
  node --check OK; browser-baseline PASS. `ci-shards needs` not runnable in the sandbox (ci.yml untouched).

## Fix round 4 (adversarial review of eb0d5677a; ~/.cache/scrml/review/s470-l1d/)
- F1 HIGH FIXED (review's root held). A markup `<match>` arm whose body holds an `<each>` is BLANKED by the
  AST builder (children: [], text in `_reparseEachArmBodyRaw`); the checker re-parses it twice — `_reNodes`
  (the read-side walk) and `walkCodegenCopy` (readBareArmBody / readShorthandBody: the nodes CODEGEN LOWERS).
  Neither was registered, and the coverage list claimed both texts covered. Now: both node lists are pushed
  to `_wholeBinderVisited` (the post-walk audits the SAME objects), and `armsRaw` / `_reparseEachArmBodyRaw`
  count as covered ONLY when their parse was registered (an arm with a `!{` whose copy is empty must be held
  by its `armBodyChildren` wrapper's children or registered re-parse) — else E-TYPE-031.
  Two consequences fixed with it: (1) those re-read copies re-tokenize `:>` as `: >`, so the arm parser keeps
  the separator at the head of the handler (`: > e is .Denied …`) — `wholeBinderArmHandler` drops that
  remnant (else every valid arm in such a copy was refused); (2) a nested `<match>` in a copy is a native
  `LogicEscape` with `bodyText` — read with the statement reader and audited.
  Shapes F1/each-in-match-arm-BAD, match-in-component-BAD, each-sibling-logic-fn-BAD: refused (E-TYPE-004);
  c11 / c12 (15 shapes): as main 915b6775f (all BAD refused). Pack: r8 "8 F1a–F1c" (fullstack; F1a/F1b FAIL
  on eb0d5677a AND on main in this server-call form, F1c PASS-DENY). Unit tests added.
- F3 MED FIXED. `<md>` prose (`text._mdText`) is not code. The catch-all tests only a field's CODE: string /
  template text / comments blanked by the parser's own lexer (`blankLiteralTextInSource`, which returns the
  text unchanged when it cannot lex it, so an unlexable field still refuses). F3/md.scrml, F3/app.scrml,
  c15 FP1/FP16/FP14, c16 FQ3: clean. c14 P3 / P8 (a real `!{}` in a struct default, dropped by main): still
  refused, as allowed.
- Not mine (filed by the PA): F2 (try body cut at the first `}`), N1 (`<match>` shorthand `$`).
- Twin-list audit by probe (round-4 `twins.mjs`, one BAD `!{}` per position; each must be refused): const
  init, if / while condition, for-of iterable, C-style for parts, return operand, bare-expr, match header,
  match inline arm result, lift operand, onclick single / multi-statement / block arrow, attribute value,
  markup interpolation, `if=`, `<each>` row, `export const` init, function param default — ALL AUDITED
  (E-TYPE-004). Component body: refused by E-ERROR-002 before the audit.
- vs main 915b6775f on the l1d new/ set: every change is a BAD shape now audited, except OK controls that
  already failed to compile on main (c9 S5/S9, c17 K2/K4: E-ERROR-002 / E-PARSE-001 plus E-TYPE-031) and the
  allowed P3/P8. vs the reviewer's eb0d5677a run of all earlier sets: c1 M6 now precise (E-TYPE-004 BAD,
  OK no longer falsely refused), c5 K6 gains E-TYPE-031 (BAD shape). Only FAILs anywhere: Q4 x4 (lane B).
- REBASED onto origin/main d455f482e (29 commits; main added its own pack family `f8` — this lane's renamed
  `f9`; main's f8 file and pins restored after `rebase -X theirs`; main touched no type-system.ts).
  EXPECTED_SHAPE_COUNT 1923 (main) + 269 (this lane) = 2192; full pack 2195 pass / 0 fail.
- 2026-10-24 fix-round-4 gates on the rebased head: unit+integration+conformance --bail 40632 pass / 0 fail;
  lsp+commands 774 / 0; root 2239 / 0; e2e-render-map 259 / 0; types:check OK (181, unchanged); slices lint +
  m1/m2/m1-lowered/m3/m4/codec 0 fail; host-global 1/2 + 2/2 0 violations; snippet 113/0; claim 18/0;
  compile-floor PASS; md-shim current; conflict-marker PASS; SPEC-INDEX OK; delta-lint PASS; s34 --check-new
  (vs origin/main) PASS; bootstrap-severity current; TodoMVC gauntlet + node --check OK; browser-baseline PASS.
  R26 vs origin/main d455f482e: the 913-file set (examples + samples) and the reviewer's corpus3 set (now 2666
  files: benchmarks compiler/samples conformance docs stdlib) — diagnostic codes IDENTICAL for every file.
  All probe sets (l1, l1b, l1c, c1–c8, l1d new/ c9–c17, n1–n4) rerun on the rebased head: unchanged from the
  pre-rebase run; only FAILs Q4 x4 (lane B).
