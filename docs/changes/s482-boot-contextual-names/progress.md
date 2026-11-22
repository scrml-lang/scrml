# s482-boot-contextual-names — progress

Lane: follow-ups from the PR #2056 review (F1, F2, F3) + the g-boot-from-identifier-s481 record.
Base: origin/main 2eba1eb75 (PR #2056 merged). Scratch: ~/.cache/scrml/review/s482-boot-contextual-names/.

## Done
- F1: `parse.scrml` `binderThen` → `bindNameTok`. Audit of every binding-name site (see PR body table):
  labelAhead, parseJump label, bracelessFor, patBinds (paren + paren-free), wildcard `_ x` binder,
  lambdaParams, typedArrowAhead (+ `lin`), single-param arrow on a keyword (parseKeywordPrimary),
  parseFnExpr name, parseFnDecl name (g-boot-contextual-word-fn-name-s482), localFnAhead,
  parseParamList `lin`, parseGiven rebind, import local names (`a as x`, `* as x`), nsToks / nsHeadAt
  (a namespace named `from`), hostBindLine name, dbItemHeadAt fn name, nestedWhenMessage param,
  skipPatternElem.
- F2: `bindNameTok` admits `as`, `pure`, `render`, `some` (§18 shorthand-name class, §7.2, §20.3a).
  `lex.scrml` `isContextualNameWord` adds `pure`, `render`, `some` (not `as`: `a as .Published`, §14.12.6.2).
  `as.member` → owner question, gap g-boot-contextual-as-member-s482.
  Why `scrml-boot compile` didn't show them: `relabelRefusals` drops errors on lines where a named refusal fired.
- F3: `lex.scrml` `lastIsMemberName` — a Dot preceded by a Dot (spread) is no member access.
- Gap records corrected / resolved / filed.
- Tests: `compiler/self-host-v2/slice-m4/contextual-names-s482.test.js` — base 3 pass / 18 fail, head 21 pass.

## Measured (base 2eba1eb75 vs head 4c6d4ea76)
- Self-host, parse level (parse.parseFile, unique sites, the 28 top-level self-host-v2/*.scrml):
  E-PARSE-LOCAL 5 -> 0 (analyze.scrml:2199, :6596; print.scrml:3202, :3746; url.scrml:288); every other code unchanged.
  Left: E-PARSE-EXPECTED/EXPR at analyze.scrml:6598-6613 (`as.value`, owner question), :5975, :6189 (pre-existing).
- Self-host, `scrml-boot compile` (compileSource): E-PARSE-LOCAL 1 -> 0 (url.scrml:288); the others were already
  hidden by relabelRefusals. Unique sites 12020 -> 12015 (lex/parse line shifts aside).
- Corpus (1421 files: examples, benchmarks, samples, stdlib, docs/tutorial-snippets, self-host-v2; scrml-boot):
  newly rejected 0, newly accepted 0; one file's error changed code (gauntlet-r10-vue-datatable.scrml:61
  `let as = …` with no `;`: E-PARSE-LOCAL -> E-STMT-MISSING-SEMICOLON; rejected on both).
- Bootstrap conformance: base 772/3/555/0 CRASH, head identical; no bucket or emitted-code change.
- Emitted output (diags + client JS + HTML + server JS, 1958 cases, twin source): byte-identical.
- Gates: pretest exit 0; s34-census PASS; types-gate OK unchanged; snippet-gate / claim-gate 0 fail;
  corpus-compile-floor PASS; gen-md-shim current; parser-conformance lexer+corpus 125 pass; touched slice tests 1112 pass.

## Next
- Push, PR.
