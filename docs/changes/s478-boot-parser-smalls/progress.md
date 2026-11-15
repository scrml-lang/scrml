# s478-boot-parser-smalls — progress

Lane: S478 bootstrap parser small clusters (triage C6, C8 alias, C15, C13, C19).
Branch `s478-boot-parser-smalls` from origin/main af7fe4bab. Base conformance JSON:
`~/.cache/scrml/review/s478-parser-smalls/base-cases.json` (PASS 422 · FAIL 142 · UNSUPPORTED 665).

## Results (head = merge of origin/main 47d1250cb)

- Bootstrap conformance, base 47d1250cb → head: PASS 422 → 424, FAIL 142 → 137, UNSUPPORTED 665 → 668;
  PASS→FAIL 0. FAIL→PASS: auth/program-nested-auth-through-div-pos, condition/given-head-bool-refused-markup.
  FAIL→UNSUPPORTED (named refusals): auth/program-nested-lifecycle-attr-neg,
  match-leave/given-arm-in-expression-position-match, match-leave/given-arm-in-lambda-body-reads-param-no-false-scope-error.
- Six more cases now fail ONLY on case dialect (newline-terminated statements / newline-separated arms, the
  C1 / case-migration work): condition/given-presence-deprecated-arm, match-leave/given-arm-body-lowered,
  match-leave/given-arm-legacy-arrow-keeps-body, match-leave/given-arm-malformed-heads-in-assignment-match-neg,
  codegen/cg-export-enum-library-rep. With terminators written in, the four `given` cases PASS (runtime too).
- Corpus (git ls-files conformance/cases samples examples compiler/self-host-v2/acceptance, 3,149 `.scrml`,
  bootstrap frontEnd, Error `code|start` sets, base af7fe4bab vs head): 0 newly rejecting, 0 newly accepting,
  0 crashed; 38 files' error sets changed while still rejecting.
- Gates: gen-bootstrap-severity --check current; snippet-gate 113/0/16 spec-ahead; claim-gate 0 failed.
- Red on base: all four new test files fail on base sources (33 of 37 new tests + 5 program-shape pins).

## Items

- [x] C6 `given` arm + markup guard (§42.2.3) — parse.scrml `givenArmHead` / `givenArms` /
  `parseMarkupGiven`; slice-m4/given-arm-s478.test.js; gap g-boot-given-guard-arm-unbuilt-s478.
  The 4 conformance cases still FAIL only on case dialect (newline-terminated statements /
  newline-separated arms: E-STMT-MISSING-SEMICOLON / E-MATCH-ARM-SEPARATOR, C1). With the
  terminators written in, all 4 PASS (runtime included) — checked against scratch copies.
- [x] C8 type alias `type Id = int;` — ast `ATypeBody.AliasBody`, parse.scrml `parseTypeDecl`,
  analyze.scrml `aliasRhs` / `aliasCycles` / `resolveTypeName` / `typeInfos`;
  slice-m4/type-alias-s478.test.js. `cg-export-enum-library-rep` still FAILs only on its
  newline-terminated `type Id = int` (§7.2.2 rule 1 — an alias is not a `type … = { … }` item, so
  it takes `;`). `type E : error` NOT built (owner question). `body-top/declaration-trailing-tokens-rejected`
  is the body-top lane's (program-level reader).
- [x] C15 nested `<program>` through markup — parse.scrml `markupProgram` (hoisted via MP.hoist;
  file-top-level wrapped program still E-PARSE-PROGRAM), analyze.scrml `nestedProgramDiags` (no
  refusal beside a §4.12.2 Error); slice-m4/nested-program-markup-s478.test.js; program-shape.test.js
  pins updated. `program-nested-auth-through-div-pos` PASS; `program-nested-lifecycle-attr-neg`
  UNSUPPORTED (workers unbuilt, honest); `program-nested-app-attr-pos` still FAIL on the worker body
  `when message(d) { … }` → E-PARSE-ITEM (parseLogicItem — body-top lane / §43 workers; not touched).
- [x] C13 cascades — NOT fixed (no SPEC sentence makes either pair one root cause): E-DEFER-LATER-SHADOW
  beside E-SCOPE-REDECLARE are two rules that both apply (§19.16.2 / §7.6); E-TYPE-031 after
  E-MATCH-012 — no SPEC text types a non-exhaustive match's value. Reported.
- [x] C19 — `.A :> defer D()` → E-DEFER-UNSUPPORTED-SITE (parseArmBody); slice-m4/defer-arm-site-s478.test.js.
  Not fixed: bare `{ }` block statement (no AST form; statement reader), `function(v) {…}` values
  (C2b function-values slice), and `fn/scope-redeclare-fn-over-param-ok`, whose remaining
  diagnostic is the correct S440 `string + int` E-OPERATOR-OPERAND-TYPE (case-stale: the shadowing
  itself works).

## Fix round 1 (PR #1877 review)
- HIGH-1: a type alias is a file-scope `type` binding in fileNames (analyze) → E-SCOPE-010 for alias+alias/struct/const/fn/cell; import-vs-alias stays linkage's one report.
- MED-1: givenArmHead accepts `, @name` after the first name (arm + markup guard) → E-BOOTSTRAP-UNSUPPORTED alone.
- LOW-1: the accepted `given x =>`/`->` arm drops its legacy mark (no W-MATCH-ARROW-LEGACY).
- LOW-2: a refused/malformed given arm's match keeps one arm with a Recovered body (refusedArm); resolveMethod blames an unresolved receiver holding a parse error.
- LOW-3/LOW-4: gaps g-boot-markup-program-refusal-span-s478, g-boot-markup-program-refused-body-read-s478.
- Conformance vs main 807e5c467: PASS 422→424, FAIL 142→137, 0 PASS→FAIL. Corpus newly-rejecting vs main: 0.
