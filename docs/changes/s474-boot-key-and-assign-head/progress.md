# progress — s474-boot-key-and-assign-head (append-only)

## 2026-10-30 — start
- Worktree verified (pwd under .claude/worktrees, toplevel matches, clean, merge-base == origin/main 34ebef81d).
- bun install + bun run pretest done.
- Maps: primary.map.md routes bootstrap work to bootstrap.map.md (load-bearing: module roles, anchors,
  "add a parser construct / add a lowering / add a refusal" routes, the slice test chain, the conformance probe).

### Governing sentences (quoted from compiler/SPEC.md and user-voice)

Task A — loop-header `key`:
- user-voice S473 "⭐ RULED — S473 review-surfaced decisions, all PA recs" item 5: *"D31 follow-up: the loop-header
  `key` is the canonical keyed-iteration form (§17.4b). `key=` on the lifted element (§6.5.3) is the legacy spelling:
  the bootstrap refuses it with a hint naming the header form, and W-KEY-001 takes the header meaning."*
- §49.2.1: `iterate-head ::= for-binder 'of' iterable key-clause?` · `key-clause ::= 'key' expression (* §17.4b *)`.
- §17.4b: "A `for` loop with `lift` MAY declare a key expression in the loop header." · Syntax:
  `for (let x of collection key x.id) { lift ... }` ·
  "When a `key` expression is declared, the compiler SHALL generate keyed reconciliation: elements are matched by key
  identity across updates, preserving DOM state (focus, animation, scroll position) for elements whose key persists." ·
  "When no `key` is declared, the compiler MAY emit W-KEY-001 warning for collections that contain objects." ·
  "The `key` expression is evaluated once per iteration and must produce a value that is unique within the collection."
- §6.5.3 RULED S473 box: "`W-KEY-001` takes the header meaning: a collection of objects iterated with no header `key`
  (§17.4b)". §6.5.3 (legacy form's rule): "A non-string, non-number `key=` value SHALL be a compile error (E-KEY-001)."
- §34 W-KEY-001 (Warning): "S473 (review-surfaced 5): the loop-header `key` (§17.4b) is canonical and W-KEY-001 takes
  the header meaning — an object collection iterated with no header `key`".
- §34 E-KEY-001 (Error): "A `key=` value on a `for`/`lift` block is not a string or number expression. The
  keyed-iteration runtime requires primitive keys for stable diffing".

Task B — D10:
- user-voice S473 D10: *"§50 keeps only the double-parenthesized assignment-in-condition head; other
  assignment-as-expression forms are refused."* · D29: *"E-ASSIGN-POSITION follows D10."*
- §50 Amendment S473 (D10): "The ONLY assignment-as-expression the language keeps is an assignment wrapped in its own
  parentheses inside the condition head of a `for (…)` or `if (…)` / `else if (…)`: as the whole condition —
  `if ((x = next()))`, `for ((line = read()))`; or as a parenthesized operand of the condition —
  `for ((m = re.exec(str)) is given) { … }`. The parenthesized assignment's value is the assigned value (§50.3).
  Every OTHER assignment in a value position is refused, compile error `E-ASSIGN-POSITION`".
- §50.2.3 (after D10): "an `assign-expr` is admitted in a condition head only as a PARENTHESIZED node — the root
  wrapped in its own `(…)` (`((x = e))`) or a parenthesized operand (`((m = re.exec(s)) is given)`). An
  unparenthesized `=` anywhere in the head is `E-ASSIGN-POSITION`."
- §50.2.1 `lvalue ::= identifier | reactive-lvalue`.
- §50.3.1: evaluate `value`, assign, "Produce the assigned value as the result of the expression."
- §50.3.5: "The lvalue SHALL be declared … before it is used"; "assigning to a `const` as an expression is E-ASSIGN-004
  (same error as a statement-level `const` reassignment)".
- §50.4.1: "The type of `x = value` is the type of `value`, which must be assignable to the declared type of `x`."

## 2026-10-30 — Task A built (loop-header `key` + W-KEY-001 + E-KEY-001)
- Locus: parse.scrml `parseIterHead` / `parseIterSrc` (held); ast.scrml `HIter.key`; analyze.scrml `resolveIter`
  (key resolved in the body scope; key local minted; `BLoop.key`), `keyOffMarkup` (key on a non-markup loop →
  E-BOOTSTRAP-UNSUPPORTED, fail closed), typer `typeLoopKey` (E-KEY-001), `keylessObjects` (W-KEY-001, from
  `typeGather`); lower.scrml `gatherView` (body's first stmt `Let(key, e)`; `View.Gather.key`); core.scrml
  `View.Gather(g, rows, key)`; check.scrml `checkGatherKey` (C20: first stmt binds the key, iterate head);
  print.scrml `gatherJs` keyed mode (`rt.gatherKeyed`, `rt.loopKey`, `rt.keyRow`, `rt.keyTextRow`; a keyed row's
  snapshot locals are cells in its markup — `withRowCells`); runtime.js `gatherKeyed` / `reconcileKeyed` (LIS moves,
  as `<each>`'s reconcile). Locus refinement: the runtime half lives in slice-m1/runtime/runtime.js (not named in the
  brief's locus list).
- Row identity = (key, place among its iteration's lifts, template index); a template switch under one key
  re-renders; a key shared by two iterations is a runtime trap (Error "duplicate key").
- READINGS for PA (no SPEC text decides them): (1) E-KEY-001 applied to the header key (its §34 row speaks of `key=`;
  the rationale "primitive keys for stable diffing" is the same mechanism) — an unknown key type fails closed with
  E-KEY-001; (2) a `key` on a statement loop / value-form loop / loop nested inside a markup loop is refused
  E-BOOTSTRAP-UNSUPPORTED (no rows of its own to reconcile; not evaluated-and-dropped); (3) W-KEY-001 fires for a
  Tier-0 loop lifting markup over a tape of STRUCTS (not payload enums, not primitives, not value-only lifts).
- g-boot-each-key-inference-unbuilt-s473 NOT touched: §17.7.5 is `<each>`'s `key=@.id` inference + W-EACH-KEY-001,
  a different element and code.
- Tests: slice-m4/loop-key-s474.test.js (16; runtime DOM identity on reorder, input text + focus kept, removal,
  multi-lift, template switch, text rows, duplicate-key trap; W-KEY-001 / E-KEY-001 / refusal), acceptance
  loop-value/{tier0-keyed, tier0-keyless-objects-warns, neg-tier0-key-type}; ruled-refusals F9 hint updated.
  slice-m4 full: 4263 pass / 0 fail (before acceptance additions).

## 2026-10-30 — Task A committed (hook green: 52375 pass / 0 fail incl. slices)

## 2026-10-30 — Task B built (D10 kept form)
- Locus: parse.scrml held (`parsePrimary` dropped the parens — now `parenMark`; `parseIf` / `parseFor` HCond →
  `keptHead`); ast.scrml `Assign(target, value, paren, kept)`; analyze.scrml `assignAsValue` (resolver),
  `typeAssignValue` + `keptKey` + `keptPlaceNarrowing` + `tKeptUnnarrow` (typer, in `typeIf` / `typeLoopCond`);
  lower.scrml `keptAssignExpr`; Core `Expr.Assigned(local, value)` (+ an arm in every Expr match: check 19, lower 6,
  walk 2 + `assignedInExpr` for `let`, print 7, print-server 3, measure 1, ingest 2); js.scrml `JAssignE` (printed
  `(x = v)`, always parenthesized). Locus refinement: core/walk/js/measure/ingest/print-server needed arms (totality),
  check.scrml only trivial arms (no new rule).
- Kept places (parse keptHead): the head's root, and operands through Unary / Binary operators. NOT kept (stay
  E-ASSIGN-POSITION): single parens, chain, initializer, argument (also inside a head), return, operand outside a
  head, ternary arm in a head, inside a kept assignment's value, a member target, a COUNTED head's condition.
- READINGS for PA: (1) the counted head's `cond` clause is not a kept place (§50 names `for (…)` / `if (…)` /
  `else if (…)` condition heads; the examples are condition heads) — refused, E-ASSIGN-POSITION; (2) a cell target
  `((@x = e))` (§50.3.4 allows it) is not built — E-BOOTSTRAP-UNSUPPORTED by name (gap stays narrowed);
  (3) a const target gives E-ASSIGN-CONST (the bootstrap's statement-form code; §50.3.5 says E-ASSIGN-004 — the
  existing E-ASSIGN-CONST vs E-ASSIGN-004 split is g-bootstrap-loop-codes-owed-s469's, not changed here).
- Tests: slice-m4/assign-head-s474.test.js (22: runtime of `for ((x = xs.at(i)) is given)`, `if ((x = e))`,
  `else if`, `for ((x = e))` with `continue`, `&&` short-circuit; printed form; typing; 12 refusals);
  acceptance loop/assign-head-presence, control-flow/{if-assign-head, neg-assign-single-paren,
  neg-assign-argument-in-head}. All slices: 5242 pass / 0 fail; SLICE_CORE=lowered slice-m1 109 / 0.
