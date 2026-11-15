# s478-conf-case-migration — progress

Case-side only. Input: `~/.cache/scrml/review/s478-triage/TRIAGE.md` (read-only triage of the 260
bootstrap conformance FAILs at origin/main 5a0fd0eb5). Worktree base: origin/main 20b76334e.

## Baselines (before)

- bootstrap (`bun scripts/bootstrap-conformance.ts`): PASS 343 · FAIL 260 · NOT-TWINNED 624 · UNSUPPORTED 638
- impl#1 (`bun conformance/run.ts`): 1751/1865 pass, 114 xfail, 0 FAIL

## Part 1 — C1 `;` corpus migration

Governing SPEC sentence — §7.2.2 rule 1:

> **`;` ends a statement.** In a statement list, every statement that is not block-like (rule 2) SHALL
> end with `;` — the last one before the list's closing `}` included (`onclick={ @n = @n + 1; }`). A
> statement with no `;` after it SHALL be **`E-STMT-MISSING-SEMICOLON`** (§34) …

and §7.2.2 rule 8: "`return;` returns nothing" (the `return }` → `return; }` shape), and the
foreign-block row of the locus table: "The block itself is an expression inside a scrml statement and
takes rule 1 after its closing `}`" (the `}=;` edits).

Method: `.tmp/semi-migrate.ts` (scratch, deleted) re-ran the bootstrap front end on each case's graded
source (its §66 twin when twinned), took every E-STMT-MISSING-SEMICOLON span, mapped it back to the
case SOURCE by its same-line left context (unique match required), and inserted `;` there; repeated to
a fixpoint. Ambiguous contexts (`D(q)`, `return x()`, `return n`, the `}` closing a `!{}` statement)
were hand-placed. Every diff reviewed: only `;` was added.

Off-limits (other lanes) and NOT edited even though they are in `semi-cases.txt`:
`markup-handler/*` (C2 lane), `module/e-import-*` (C5 lane), `engine/*` (C11a lane).

Reviewed and REVERTED (the bootstrap's requested `;` would change the case's meaning):
- `control-flow/s462-else-without-if-pos` — it pins the orphan-`else` diagnostic; the bootstrap asks
  for `;` after `else` itself. C14 bootstrap gap (`g-bootstrap-unclaimed-else-misdiagnosed-as-undeclared-s462`).
- `defer/control-flow-inner-loop-ok`, the `let helper = function(v) {` line only — the bootstrap
  misreads a `function(v) { … }` value (C19); the other three `;` in that case are kept.

impl#1 effect: unchanged except `lifecycle/effect-nested-pos` (xfail signature recaptured: the
`;` after `beacon(@n)` removes impl#1's own E-STMT-MISSING-SEMICOLON / E-MU-001 / E-SCOPE-001 cascade).

## Part 2 — C12 stale cases (each with its governing SPEC sentence)

### F1 — E-COND-NOT-BOOLEAN on `function g() { }` (5 cases)
`condition/unresolved-{call,call-markup,operand-markup,operand-not,ternary-arm}-neg`.
- Governing: §4.14 — "a call of a function that returns nothing is not a value (§48 "The return rule",
  rule 3; E-TYPE-001 in a value position)"; §42.4 statement 6 — "A condition SHALL NOT also be reported
  under statement 5 when the compiler has already reported **any Error-severity diagnostic whose span
  lies within the condition**". So the bootstrap's E-TYPE-001 is right and the case was stale.
- Fix: `g` now returns a value typed `asIs` (`function g() { const v: asIs = true; return v; }`) — §42.4
  statement 5 names it: "a value typed `asIs` / `unknown` (§7.5.2)". The cases still pin
  E-COND-NOT-BOOLEAN on an unresolved call (NOT flipped to E-TYPE-001).
- Tried and rejected: a foreign `_={ }=` return and a `?{}` row return (both make `g` server-placed —
  E-VALUE-SERVER-CALL / E-ERROR-002, a different case); `-> int` (would test statement 4, not 5);
  mutual recursion (bootstrap calls it void).
- Bootstrap: FAIL -> UNSUPPORTED (it refuses `asIs` by name, §14.1.2; it emits E-COND-NOT-BOOLEAN beside
  it). impl#1: xfail signature unchanged.

### `while` retired (2 cases)
`condition/known-int-while-neg`, `condition/presence-bare-optional-while-pos` -> `for (cond)`.
- Governing: §49.4.1 — "A `while` statement SHALL be rejected with **`E-LOOP-WHILE-RETIRED`**, whose
  fix-it is `for (cond) { … }` (the same head, the keyword renamed)."
- impl#1 does not build `for (cond)`: it emits E-IMPL1-RULED-FORM-UNSUPPORTED. known-int-while-neg
  xfail signature recaptured (adds that code); presence-bare-optional-while-pos still PASSES on impl#1
  (its contract is codes [] + notCodes, so the impl#1 refusal does not fail it — noted, not hidden).

### `.substring` (1 case)
`hostmethod/substring-match-typed` -> `.slice`.
- Governing: Appendix D.1 "Not in the table: refused (S469)" — "A call of any other method on a `string`
  (… `substring`, `at`, `concat`, …) SHALL be compile error **`E-STRING-METHOD-UNKNOWN`**"; "`substring` /
  `at` / `concat` already have admitted forms (`slice`, `s[i]`, a template)".

### Bare arm tails needing `lift` (2 cases + 1 from Part 1)
`match-block/value-decl-block-arm-{raw,variant}`; `match-leave/argument-match-arm-labelled-break-outer-neg`.
- Governing: §7.2.2 rule 3 — "A brace that holds a statement … is a statement list … (`.B :> { log(); 2 }`
  is E-STMT-MISSING-SEMICOLON after `2`, and — in a value position — E-ARM-TAIL-VALUE …; with the `;` it
  is E-ARM-TAIL-VALUE alone)"; S469 ruling "`lift` is required once the block holds a statement".
- Bootstrap: FAIL -> UNSUPPORTED (statement-holding value arm is refused by name). impl#1: PASS unchanged.

### Unhandled Transport on client->server calls (4 cases)
`server-fn/cell-assign-failable-{arm-return-live,recovery-value,success-then-read}`,
`server-fn/cell-assign-independent-writes-batched`.
- Governing: §19.9.10 — "A call made on the client whose callee is server-placed is a **failable call**
  at that site, whether or not the callee is declared `!`. It SHALL be handled exactly as a call to a `!`
  function (§19.4.3) … An unhandled one SHALL be **E-ERROR-002**." Failure set (S454 F1): "`f`'s declared
  variants plus ONE wrapper variant `Transport(t: ServerCallError)`".
- Fix: a `.Transport(_)` arm added (corpus form `.Transport(_) :> return`; a value arm in the recovery case).
