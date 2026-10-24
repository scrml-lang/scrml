# s469-boot-loop-value-form — progress

Branch `s469-boot-loop-value-form` (from origin/main 8d5c897). Limb: BOOTSTRAP only (`compiler/self-host-v2/`).
Gap: `g-bootstrap-loop-value-form-s469` (MED). Ride-along: #1530 review (grant-scan R7) + the `rule=`-into-payload gap.

## Design (as built)

- **AST** — `AFor.bound: AForBound | not` (a `for-binding`, §49.2.1); `AStmtK.Lift(ALift)` with
  `ALift.LiftExpr(e)` / `ALift.LiftNode(n)` (a lifted markup row — Tier-0 only); `ANodeK.Gather(f: AFor)` (a
  Tier-0 `${ for … }` in a free-text markup body, §17.4).
- **parse** — `parseLocal` reads `const|let x[: T] = [label:] for …;` (`parseForBinding`); `lift` is a statement
  (`parseLift`, needs `;`); `parseKids` reads a `${` whose first statement is a `for` as Tier-0 (`parseTier0`):
  the region is lexed by `lex.scrml lexTier0`, which PAUSES before each `lift <element>` so the element is read as
  markup (text is not tokens) and the run resumes after it with the open braces; each element becomes a row
  placeholder token, and `fillRows` puts it into its `lift` after the loop parses. A `for` anywhere else that is
  not bound (an operand, an argument, a `return` operand) stays refused by name (§49.4.4 calls it a syntax error and
  names no code).
- **analyze** — `resolveForStmt` mints the binder before the body (every `lift` names it, BJump on the lift),
  binds it after the loop; its resolve-time type is the join of the lifts' (`AS.lifts`); zero lifts =
  **E-LOOP-007**. `Env.lift: LiftCtx` (NoLift / LiftTo(into, tier0) / LiftInArm) — reset at a function body, a
  handler block, an effect body; an arm block makes it LiftInArm. The loop-control pass gives a bound loop a WALL
  frame: a labelled `break` / `continue` that would cross it is **E-LOOP-005** (§49.6 rule 6). The typer
  (`typeForStmt`) types the binder `Seq(join of lifted values, fixedSeq())` (no grants, rule 2); a written type is
  checked lift by lift. Tier-0 (`resolveTier0`): an accumulator minted on the node, the loop as its own
  loop-control root, E-LOOP-007, `return` / `fail` refused by name; the loop is a §6.15 RENDER position
  (`tier0Positions` → E-VALUE-WRITES-STATE / E-VALUE-WRITE-UNPROVEN / E-VALUE-SERVER-CALL through the existing
  value-position machinery), and its rows' handlers are action positions.
- **Core** — `Stmt.Gather(g: Gather)`, `Stmt.Lift(into, what: Lifted)` (`LValue(e)` / `LRow(idx)`),
  `View.Gather(g, rows: GatherRow[])`; `Gather = { label, bind, head, body }`. No Stmt holds a View (rows are by
  index).
- **check C20** — every Lift names its NEAREST Gather in its owner (a Suspend `then` / Join / Defer body has none);
  a row Lift only in a View.Gather, naming one of its rows; every Gather has ≥ 1 Lift into it (E-LOOP-007
  re-checked); a Gather body starts a jump scope holding only its own label (E-LOOP-005 re-checked in checkJumps);
  C19's loop-body rules (no Suspend / Join / Jump / Defer) apply; a View.Gather's loop holds no Return / Fail /
  writes no reactive state (C11's witness).
- **print** — `const xs = []; [L:] for (…) { … xs.push(v); … }`. Tier-0: `rt.gather(scope$, marker, () => { …loop…
  return rows; })`; a row Lift pushes `((a, b) => (scope$, anchor$) => { …render… })(a, b)` — a snapshot of the
  loop locals the row reads (a later rebinding never changes a row already lifted); a value Lift pushes
  `rt.textRow(v)`. Runtime `gather` re-runs the loop (tracked) and re-renders every row (untracked, one child
  scope) when a cell it read changes — no key (§17.4b not built).

## Log

- 2026-10-24 — commit 1: the value form (statement + Tier-0) through parse → analyze → Core → check → print →
  runtime; grant-scan R7 (positional binder; arm ends at the next arm's pattern) + 4 must-fail controls. Slices:
  3344 pass / 2 fail before the two pins below were moved (loops-s469 "value form refused" pin → an operand `for`;
  `acceptance/arms/neg-lift-nested` gained the `;`s its parse-level refusal used to mask — the case still tests the
  nested-lift refusal, same code, same bucket).
- commit 2: `slice-m4/value-form-s469.test.js` (50), `acceptance/loop-value/*` (19: 12 run, 6 exact codes, 1
  UNSUPPORTED target — the union tape); E-SYNTAX-002 for a `lift` in a bare `function` outside any bound loop
  (§10.4 / §49.6.2 — `ruled-backlog-s469` pin moved); E-LOOP-007 is "no `lift` REACHABLE on some path"
  (`liftReachable`); C20 no longer refuses an Attempt in a Tier-0 loop (a handled call there is legal; its arms'
  Return / Fail still are). Ride-along: `g-bootstrap-rule-transition-into-payload-variant-s469` filed and fixed
  (runtime `checkEdge` judges variant TAGS; lower `stateView` tests a payload variant by pattern) with
  `slice-m4/rule-payload-s469.test.js` asserting the RUNTIME effect (red before: `.Dot → .[object Object]`).
  Gaps: the value-form gap RESOLVED; `g-bootstrap-loop-value-form-residue-s469` (LOW) filed for what is still
  refused. `bun scripts/gen-bootstrap-severity.ts` (E-LOOP-005 / E-LOOP-007 / E-SYNTAX-002 now named);
  `bun scripts/bootstrap-conformance.ts --write` (one bucket move, below); `bun scripts/state.ts --write`
  (master-list recent-sessions already current — untouched).

- commit 3: SPEC — the §34 rows of E-LOOP-005 / E-LOOP-007 / E-SYNTAX-002 and the §49.10 summary rows cite
  `emitted at compiler/self-host-v2/analyze.scrml:LINE` (s34-census `--check-new` PASS); §49.8's bootstrap note
  (it said "no loop node yet") states what is built; SPEC-INDEX regenerated. analyze: a refused `lift` no longer
  reads its markup row (one report, not two).

## Conformance diff (`docs/bootstrap-conformance.md`)

- **One bucket move:** `control-flow/ctrl-010-else-on-for-without-lift-neg` UNSUPPORTED → FAIL (twin-extra-error:
  E-LOOP-007, E-VALUE-WRITES-STATE). The case is `<ul>${ for (let item of @items) { @total = @total + 1; } }</ul>`
  and expects a clean compile. Under S469 a `for` that is the sole content of a markup `${ }` is the value form
  (§49.4.4) — it must lift (E-LOOP-007) — and the interpolation is a render position that may not write (§6.15).
  The case predates both rulings: an owner question, not a bootstrap defect (the corpus is not edited here).
- Reason moves inside UNSUPPORTED (no bucket change): `ctrl-012-bare-control-flow-in-markup-neg` and
  `ctrl-013-braceless-for-of-head-neg` now parse-reject on `lift <li>${x}</>` written without its `;` (they were
  refused as a value-form `for`); `ctrl-010-for-lift-in-match-arm-neg` now stops at its `for … else`; four cases
  name the new `lift` refusal text; `auth-graph-004-neg`, `e-match-block-in-lift-pos`, `sql-handled-lift-rt` now
  stop at an earlier wall (`<program title=…>`, `<match>`, `<schema>`).
- Totals: PASS 250 (unchanged) · FAIL 63 → 64 · UNSUPPORTED 815 → 814.

## Owner questions

1. **`lift` inside an arm block of a bound loop's body** (review note: a value-position arm already takes the §18.5 reading and runs; only the statement-position arm is refused — the question is that position). §49.6 rule 7 sends a `lift` "through … `match` arms and
   `!{}` arms" to the nearest bound loop; §18.5 makes a value-position arm block's `lift` the ARM's value (and the
   bootstrap refuses a statement-position one). Which wins for a `match` / `!{}` inside a bound loop? Refused today.
2. **The code for a `for` in an operand / argument / `return` position** — §49.4.4 calls it "a syntax error" and
   names no code (E-BOOTSTRAP-UNSUPPORTED today); likewise a Tier-0 loop that is not the sole content of its `${ }`.
3. **`return` / `fail` inside a Tier-0 loop** — §49.6 rule 6 names a function's exits; a render position has none,
   and the SPEC names no code (E-BOOTSTRAP-UNSUPPORTED today).
4. **`ctrl-010-else-on-for-without-lift-neg`** (corpus) expects a lift-less, state-writing `${ for }` in markup to
   compile clean; under §49.4.4 + §6.15 it is E-LOOP-007 + E-VALUE-WRITES-STATE. Re-target the case?
5. **A union tape** (§49.6 rule 2) needs a union type in the bootstrap — the same wall as `T | U` in an opener.
