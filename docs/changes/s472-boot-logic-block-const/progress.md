# progress — s472-boot-logic-block-const

Gap `g-boot-logic-block-const-s472` (MED, filed in #1608): the bootstrap refused `const` at the top
level of a `${ }` logic block (E-PARSE-ITEM). Branch `s472-boot-logic-block-const` from origin/main
`c8070b56a`; origin/main merged (not rebased) at `e8d2e38cd` (#1608 landed meanwhile).

## Governing SPEC sentences

- §7.2: "The content of a `${ }` logic context is JavaScript … All JavaScript that is valid in a Bun
  execution context is valid inside `${ }`, **except the constructs §7.2.1 excludes**" — a `const`
  statement is not excluded.
- §7.6: "A variable declared with `let` or `const` at the top level of a file-level `${}` block SHALL be
  in scope for all subsequent `${}` blocks and markup interpolations in the same file." · "Variables
  declared inside a function body within a `${}` block are scoped to that function. Only top-level
  declarations within the `${}` block participate in file scope." · "Re-declaring a name with `let` in a
  later file-level `${}` block when that name was already declared at file scope SHALL be a compile error
  (E-SCOPE-010: duplicate binding in file scope)." · "A declaration in a `${…lift…}` block nested inside
  an `if=` element is a file-scope declaration: it runs ONCE, at file init".
- §7.6.1: "A V5-strict structural cell `<x>` and a local `let x` cannot coexist in the same file scope.
  `E-NAME-COLLIDES-STATE`". §1.6: "attempting to declare a local variable with the same name as a
  registered state cell is `E-NAME-COLLIDES-STATE`".
- §7.3.3: "Shadowing in a NESTED block … is legal and unaffected." · "File-scope duplicates are
  E-SCOPE-010 (§7.6), not this code".
- §7.4.2: "When `expr` references NO reactive cells AND the expression collapses to a compile-time-known
  constant value (literal, `const`-bound to a literal, simple arithmetic on constants), the compiler MAY
  inline the string value directly … This is a permitted optimization — the rendered output is
  observationally equivalent." · non-constant: "the compiler SHALL emit a one-shot evaluation at module
  initialization".
- §7.2.2 rule 1: "every statement that is not block-like … SHALL end with `;`".
- §21.2 / E-IMPORT-001 row: "`export const Name = ...` inside `${ }` per §21.2 Form 2". §21.3: "Named
  imports … from `.scrml` files SHALL be resolved by the compiler against the exporting file's export
  list."
- §50.9: "An assignment to a `const` variable SHALL be a compile error (E-ASSIGN-004), in statement
  position and in expression position alike."
- §12.2 Trigger 3: "an `import` is file-scoped and cannot itself be placed, so the escalated unit is the
  *using* function" · S331 note: "A server-only reach in a position that is not a function body
  therefore does not escalate".

## SPEC silences (fail closed)

1. **Where a non-constant file-scope initializer runs** (client / server / both; per process / per
   request). §12 places functions only; §6.6.19 covers only derived cells. → the bootstrap builds the
   compile-time-constant class only and refuses every other initializer by name. Filed
   `g-spec-file-scope-binding-placement-s472` with a recommendation.
2. **File-scope `let`** — §7.6 admits it; it is module-level mutable state with the same placement
   silence. → refused by name (E-BOOTSTRAP-UNSUPPORTED, message quotes §7.6).
3. **A constant named like a type / a user declaration of its file** — no SPEC code. → bootstrap-local
   E-BOOTSTRAP-REDECLARE (the convention for SPEC-silent collisions; cf.
   `g-boot-decl-fn-same-name-one-file-s472`, where decl-vs-fn is still ACCEPTED — a recorded asymmetry).
4. **Reading a later constant from an initializer** — JS would TDZ-throw at init. → E-SCOPE-001 ("read
   before it is initialized"); there are no cycles.

## Design

- ast: `AItemK.ConstItem(c: AConst)`, `AConst { nid, span, exported, name, ty, init }`.
- parse: `parseLogicItem` → `parseConstItem` (parseLocal + termAfter: the function-body statement
  reader and its `;` rule) / `refusedLetItem`. Edits confined to the logic-block item loop.
- analyze: `NameKind.KConst` (file scope / imports, #1606 rules); `ConstInfo` in `Globals.consts` and
  `Tables.consts`; `constStubs` (phase A: Sym + written type), `constPass` (after phase A, before
  checkImports / phase B: each initializer bound in order; `constBlocker` refuses anything that does
  something); `resolveName` → `NameFact.NConst` after the locals (which shadow); `placeName` →
  E-ASSIGN-004; `dupConsts` in checkScopes; typer `constVType` / `typeConst` (written type checked like
  a local's).
- lower: `readName` `.NConst` → `Local(sym)`; `coreConsts` lowers each initializer ONCE into
  `CoreProgram.consts` (dependency order). print.scrml `constsReadIn` / `constStmts`: each artifact
  (client: its decls + client fns; server: the fns it reaches) emits one module-level `const` per
  constant its code reads, transitively, and no other — a server-only value never reaches the client.
  walk `programKids` includes the initializers (checkCore sees them). (Round-1 change — the first cut
  inlined each read: review #1617 MED-1, exponential in constant depth.)
- severity.scrml regenerated (E-ASSIGN-004, E-NAME-COLLIDES-STATE; it also picked up E-IMPORT-003 /
  -008 / -009 that earlier lanes left unregenerated — all Error, as before by fail-closed default).

## Log

- impl + tests: `slice-m4/logic-block-const-s472.test.js` — 35 tests; red on origin/main (e8d2e38cd) 35/35
  (`~/.cache/scrml-pa/s472/lc-red-main.log`), green on the branch.

## Review round 1 (S239 of #1617, ~/.cache/scrml/review/s472-lc/REVIEW.md)

- MED-1 fixed: module-level emission (above). Tests +3: a depth-20 chain (each `const` printed once,
  < 4 KB, value 2^20 in the page), transitive carry (BASE before FULL, an unread constant absent),
  two files' private `K` are two bindings. The server-only test now also asserts one binding each.
  The reviewer's probe sets (r1 78, r2 21, r3 3) re-run: outputs identical to the reviewer's head logs
  apart from sizes / timings — every placement probe (template, `?{}` parameter, `!{}` arm) unchanged
  (`~/.cache/scrml-pa/s472/lc-probe-r*.log`).
- Filed (LOW): g-boot-imported-const-like-cell-s472, g-boot-const-like-builtin-type-s472,
  g-boot-sqlerror-variant-client-checkcore-s472 (pre-existing).
