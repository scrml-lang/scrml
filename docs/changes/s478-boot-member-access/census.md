# s478-boot-member-access — census of "member access `.<name>` on a value that is not a struct or an instance" (base 213dd1203)

42 conformance cases (graded on their §66 twin where twinned) carried the refusal. Receiver per case:

| bucket | receiver type | cases | disposition |
|---|---|---:|---|
| A | `S | not` struct cell, narrowed or not (`@user.name`, `@other.name`) | 15 (reactive/narrowing-*) | BUILT: field resolved on S; typer E-TYPE-046 where not narrowed (§42.3.5) |
| B | `?{}` row / rows (`row.name`, `row.body`, `rows.length`, `@hit.body` after a `?{}` write, `c.n` from a fn returning a `?{}` row, `cols.filter(...)`) | fn/sql-access-handled-reject, fn/sql-access-in-function-clean, fn/sql-access-reject, server-db/sql-handled-cell-write-rt, sql-handled-decl-rhs-rt, sql-handled-lift-rt, sql-handled-match-scrutinee-rt, sql-handled-split-write-rt, tenant/program-statement-admitted-pos (9) | EXCLUDED — lane s478-boot-sql-row-types |
| C | untyped loop binder over an untyped parameter (`for (const it of items) … it.id / it.on`) | server-db/sql-handled-hoisted-loop-rt, sql-handled-hoisted-loop-nested-read-rt, sql-hoisted-loop-{allow-list,key-affinity,key-projection,nested-read,prefetch-failure-timing,reassign,unbindable-key,unrewritable-site,write-between-iterations}-rt (11) | STAYS REFUSED (Unknown type, fail closed); these cases also hold `?{}` rows |
| D | `.length` of a method result on an untyped parameter (`xs.filter(...).length`, `xs` untyped) | defer/stack-arrow-helper-before-defer, -twin (2) | STAYS REFUSED (Unknown) |
| E | `.length` of an unannotated `const` bound to a declared-return call (`const ys = seed(); ys.length`, `seed() -> int[append]`) | reactive/tape-append-on-returned-tape-rt (1) | STAYS REFUSED — the binder gives an unannotated local no type (the typer infers it); also fails E-WRITE-NOT-GRANTED on `ys.append` (inferred: no grants) — residue |
| F | foreign host-import result (`tokenize("a b").length`, `import:host`) | module/e-import-003-host-import-inside-logic-reject (1) | STAYS REFUSED (foreign value) |
| G | member of a call whose return type is inferred from an object literal (`check(1).ok`, `fn check(n:int) { return { ok: … } }`) | markup-handler/s457-unquoted-member-chain-condition (1) | STAYS REFUSED (no declared return type; the object literal itself is E-TYPE-STRUCT-CONTEXT) |
| H | unbound `event` in a handler (`event.target.value`, `event.type`) | markup-handler/s457-event-unbound-bare-call-neg, -inline-block-neg (2) | STAYS REFUSED — receiver is E-SCOPE-001; expected E-EVENT-UNBOUND (§5.2) not built — residue |

Total: 15 + 9 + 11 + 2 + 1 + 1 + 1 + 2 = 42.

Bucket A also needed the loop-narrowing refinement (reactive/narrowing-survives-write-after-loop-pos):
the typer dropped every cell narrowing at a loop; now it keeps one the loop writes nowhere.
