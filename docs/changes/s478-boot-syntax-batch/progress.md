# s478-boot-syntax-batch — progress

Lane: three named refusals in `compiler/self-host-v2/`, built per SPEC.

## 1 + 2. bare `{ … }` block (§7.2.2) and `transaction { … }` (§19.10) — DONE (one commit)

They share one representation, so they landed together: `AStmtK.If` gained `form: IfForm`
(`Written` / `Bare` / `Transaction`); both blocks are an `if` whose test is the literal `true`
(the JS block scope). Core `Stmt.If` gained `tx: Sym | not` (the database of a transaction block).

- parse.scrml: `bareBlock` builds `If(true, b, not, Bare)`; `transaction {` builds
  `If(true, b, not, Transaction)`, or E-ERROR-001 + drop at the top level (TP.inFn 0).
- analyze.scrml: `txRulesPass` (§19.10.4: E-ERROR-001, E-ERROR-007, E-TRANSACTION-CONTROL-FLOW limbs);
  `txPlacePass` (the block's database = its function's envelope's; no envelope → named refusal,
  g-boot-transaction-block-no-envelope-s478); exit analysis (`stmtExits`, `stmtLeavesAll`) reads a
  bare / transaction block as always running.
- lower.scrml: `txOfIf`; `cpsStmts` never moves a block's continuation tail into a transaction block.
- check.scrml: C-TX4; C12 reads a transaction block as its own continuation owner.
- print.scrml: `ifStmtJs` (try/finally around `rt.txBlock` / `rt.txEnd`); client functions holding one refused.
- server-runtime.js: `txBlock` / `txEnd` (SAVEPOINT / RELEASE / ROLLBACK TO on the envelope's tx).
- refusals.scrml: `yield` named refusal (§10.1).
- tests: slice-m4/syntax-batch-s478.test.js (24, red on base).

Conformance (base 213dd1203 → head): PASS 552 → 555, FAIL 11 → 14, UNSUPPORTED 670 → 664.
PASS→FAIL: 0. UNSUPPORTED→FAIL: 3 (stale/legacy cases — see PR body).

Committed 2581b789a (hook PASS: 55557 pass, 0 fail).

## 3. `?.` optional chaining (§42.3.6) — STOPPED (blocked on a prerequisite)

Measured: the bootstrap builds NO member access through a `T | not` struct value — `if (@u is given)
{ @u.name }` and `@u is given ? @u.name : not` both refuse at analyze.scrml resolveMember ("member
access `.name` on a value that is not a struct …") — and enforces no E-TYPE-046 (§42.3.5). A `?.`
desugar (receivers' presence tests around the plain chain) was built and probed; every use stopped at
that refusal, so it was not landed. Filed g-boot-optional-member-access-s478 with the recommended
next lane; WIP patch at ~/.cache/scrml/review/s478-boot-syntax-batch/optional-chain-wip.patch.
