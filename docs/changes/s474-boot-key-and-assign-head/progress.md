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
