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
