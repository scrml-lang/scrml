# progress — s470-render-residue-host-promises

Lane G (S470, SECURITY under the S435 policy). Three escapes where a pending Promise reaches a gate unrefused:
`g-markup-in-const-initializer-unwalked-s470` (MED), `g-host-promise-global-in-render-not-refused-s470` (MED),
`g-host-promise-global-in-action-body-s470` (LOW).

- 2026-10-25 start: worktree verified (base 6081e0685 == origin/main), bun install + pretest done.
  Scratch: ~/.cache/scrml/s470/laneG/ (probes copied from ~/.cache/scrml/review/s470-l2/p/q04, q05).

## Gap 1 — markup held in a `const` initializer

Root cause, measured (AST dump of q04 on 6081e0685): the walk DOES reach the markup (`const-decl.initExpr` is a
`markup-value`, which `unseenWaits` walks as markup). What it reads is wrong: the attribute value is
`{ kind: "expr", raw: "${isOk(@pw)}", exprNode: { kind: "ident", name: "$" } }`. The markup-value reader
(ast-builder `parseExprWithMarkupValues`) pre-splits only TEXT-position `${…}` interpolations into child blocks
(`collectTextInterpSpans`, GITI-033); an attribute-position `${…}` was "left to the attribute tokenizer", which read
the `$` as the whole value. That one defect is both reviewer findings:

- q04 (`if=${isOk(@pw)}`): the check judged `$` (no server call) — compiled, exit 0.
- q05 (`if=${@pw == "s"}`, the sync twin): emitted `_scrml_ifrow_apply(…, ($))` — the condition lost. Without a
  page `$` a ReferenceError (fails closed); with jQuery or any page-level `$` the gate is always open.
  Also `title=${@pw}` → `String($ ?? "")`.

Fix (proven path): pre-split an unquoted attribute `${…}` too, as the block splitter does for `lift <tag attr=${…}>`;
`_parseLiftAttrValue`'s BLOCK_REF branch then strips the `${ }` and parses the interior (the q06 `lift` control was
already right). The walk is unchanged — it now sees the real call. After: q04 → E-VALUE-SERVER-CALL; q05/q07 emit
`_scrml_structural_eq(_scrml_cs_reactive_get("pw"), "s")` with a reactive subscription; q08 `title=` reads the cell.

## Log
