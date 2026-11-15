# s478-boot-markup-value-foreign — progress

Branch `s478-boot-markup-value-foreign` (from origin/main 6ea07d203). Gaps:
g-boot-markup-as-value-unbuilt-s473, g-boot-foreign-header-checks-unbuilt-s473.

## Done
- lex.scrml: `TokenKind.MarkupValue` — an element opener `<name` after a token that leaves an
  operand to read (`return`, `=`, `(`, `[`, `,`, `?`, `:`, `=>`, `&&`, `||`, `??`, `!`, arm `:>`)
  is ONE token, extent by characters (`markupValueExtentAt`). Region lexer (`lexFromMode`) only;
  whole-file `lex` and `lexTier0` untouched.
- parse.scrml: `parseMarkupValue` reads the element with `parseMarkupNode` over the token's span.
  Named: E-SCRIPT-001 / E-STYLE-001 (§4.17 S462), E-MD-IN-LOGIC-NOMINAL (§34 row, §67.2),
  E-MATCH-ARM-MARKUP-IN-VALUE (§18.0, value `match` arms only — `parseArmBody(inMatch)`).
  Else E-BOOTSTRAP-UNSUPPORTED (INTERIM). File-level: the interim refusal is dropped when the
  file carries one of the four named codes (`markupValueDiags`).
- Cases: foreign-slice-no-free-capture-neg (`;` added); foreign-inline-no-lang-neg (library moved
  to aux `lib.scrml`, `fn` → `function`; impl#1 still passes); md/in-logic-markup-refused (cell
  `on` → `shown`; `on` is reserved under §66.2.3; impl#1 still passes).

## Findings (not built here)
- foreign-crossing-shadow-in-block-neg / foreign-slice-unparseable-in-block-neg: the bootstrap
  already gives E-FOREIGN-006 / E-FOREIGN-007 (slice-m1/tool-slices.js) once `println` resolves —
  blocked only on §20.7 `println` (E-SCOPE-001), the other lane's.
- e-match-arm-markup-in-value-pos / e-syntax-011-guard-clause-pos: also blocked on struct-field
  `req` (refinement lane).
- e-syntax-011: SPEC §18.10 names only `if` after a pattern; `| cond` is unruled → owner question.
- e-type-026-match-in-markup-pos: E-TYPE-026 is RETIRED (S473 D19) → owner question.
- async-fn-escapes-handler-destructured-scheduler-neg: needs destructuring `const { a } = …`
  in a handler (E-PARSE-LOCAL) — not cheap; listed.

## Commits
- 7d2c01c21 — the lexer token, parseMarkupValue, the named refusals, the three case edits,
  arms-union pin updated (the markup arm body is read whole: E-MATCH-ARM-MARKUP-IN-VALUE alone).
- merge of origin/main b8a25034e (#1876 body-top): `mdElemsIn` takes ANodeK.Run; lexTier0X reads a
  markup value too; LexStop.Decl does not stop before a markup VALUE (`const v = c ? <b/> : 1;`).

- foreignHeader (g-boot-foreign-header-checks-unbuilt-s473, RESOLVED): E-FOREIGN-007 for a duplicate
  crossing, a reserved-word / `await` / `eval` / `arguments` crossing, and a header after a comment
  (§23.2.4a: "not valid JavaScript as the body of a strict-mode async function whose parameters are its
  crossings"). Tests slice-m4/foreign-header-s478.test.js (3 of 4 red on base).
- known-gaps: g-boot-markup-as-value-unbuilt-s473 narrowed; filed g-spec-18-10-pipe-guard-unruled-s478,
  g-conf-e-type-026-case-asserts-retired-code-s478, g-boot-destructuring-local-unbuilt-s478.

## Measurements (after the merge; base = origin/main b8a25034e bootstrap, same case files)
- Conformance: PASS 457 → 460, FAIL 97 → 94; 0 PASS→FAIL. FAIL→PASS: element-refusal/fn-return-script-pos,
  element-refusal/interp-markup-value-style-pos, md/in-logic-markup-refused. foreign/foreign-inline-no-lang-neg
  is FAIL→PASS by the case edit alone (vs the original case on main: FAIL).
- Corpus (samples, examples, conformance/cases, self-host-v2/acceptance, stdlib — 3,204 files, single-file
  front end): newly rejecting 0, newly accepting 0; 111 already-failing files change their error set
  (cascade codes lost: E-PARSE-EXPR 79, E-STMT-MISSING-SEMICOLON 43, E-SCOPE-001 40, …).

## Next
- hook, PR.
