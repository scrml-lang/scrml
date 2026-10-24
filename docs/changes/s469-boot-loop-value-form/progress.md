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
  Attempt and writes no reactive state (C11's witness).
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
