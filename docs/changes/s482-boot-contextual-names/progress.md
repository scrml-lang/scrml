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

## Next
- Commit; measure (self-host diag counts base vs head, corpus newly-rejected), final gates, PR.
