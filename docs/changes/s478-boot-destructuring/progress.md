# s478-boot-destructuring — progress

Branch `s478-boot-destructuring` (from origin/main e65969118). Gap: g-boot-destructuring-local-unbuilt-s478.

## Built
- Object destructuring declaration in a statement list (`const { a, b: c, d: { e } } = v;`, `let { … }`):
  parse.scrml `parseDestructDecl` → one `const` temp `destructured#<offset>` holding `v`, then one
  `Local` per bound name holding `temp.key`. List readers take it through `parseTermStmts`
  (parseBlock, parseStmtRun, arm blocks, parseBlockOrStmt, single-statement `defer`).
- Object destructuring `for` binder (`for ([let|const] { id } of xs)`, keywordless, value loops):
  `parseDestructIter` — the binder is the temp, the body opens with the bound locals.
- Typing / lowering / runtime are the member read's (no analyze / lower change for the built path).

## SPEC sentences
- §7.2 "All JavaScript that is valid in a Bun execution context is valid inside `${ }`, except the
  constructs §7.2.1 excludes" (§7.2.1 names `const { class: c } = o` as a valid destructuring key).
- §49.2.1 `for-binder ::= ('let' | 'const')? (Identifier | destructuring-pattern)`; §49.3.5 "A
  destructuring binder follows §50's destructuring rules"; keywordless binder is `const` (§50.8.5).
- §35.3 rule 1 "`let y = x` where `x` is `lin`. The identifier on the right-hand side is the consumption."
- §34 E-STMT-PATTERN-PROPERTY / E-STMT-BINDING-NAME / E-STMT-UNCLOSED-PATTERN (pattern syntax errors).

## Refused by name (INTERIM) — gaps g-boot-destructuring-unruled-forms-s478, g-boot-destructuring-positions-s478
tape pattern (owner question: trap vs `not` past the end), default, rest, computed/string/number key,
annotation on the pattern, `lin` source (inherit-`lin` unruled), `key` clause on a destructuring
binder, file-scope / body-top position. Body redeclaring a destructured binder name is E-SCOPE-REDECLARE.

## Measurements
- Tests: slice-m4/destructuring-s478.test.js — 26 pass on head, 25/25 (then-existing) red on base.
- Conformance: PASS 498 → 498, FAIL 36 → 35 (server-db/async-fn-escapes-handler-destructured-scheduler-neg
  FAIL → UNSUPPORTED: now stops at its lambda), no PASS→FAIL, no UNSUPPORTED→PASS.
- Corpus (samples, examples, conformance, acceptance, stdlib, benchmarks; 3211 files, base vs head
  bootstrap, per file): newly-rejecting 0, newly-accepting 0.
- stdlib/data/transform.scrml first error: now the tape-pattern refusal at `for (const [key, value] of Object.entries(obj))`.

## Status
- [x] code + tests  - [x] severity regen  - [x] known-gaps markers  - [ ] hook / CI gates  - [ ] PR
