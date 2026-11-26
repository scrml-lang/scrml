# s483-invariant-1 — Q21 struct invariant, LANE 1 of 3 (parse + declaration-side analysis + static errors)

Rulings: `ruling:user-voice-scrml.md-S482-struct-invariant-contract`, `ruling:user-voice-scrml.md-S483-struct-invariant-syntax`.
Design: `~/.cache/scrml/review/s482-struct-invariant/proposal.md` (candidate A).
Bootstrap-only (compiler/self-host-v2/); impl#1 frozen (§66 Nominal there, §34.0).

## Log

- AST (ast.scrml): `AInvariant { nid, span, e, label, text }`; `ADecl.invs`; `ATypeBody.StructBody(fields, invs)`.
- Parse (parse.scrml): `invariant (e) [label]` after a declaration closer (loop with `renders`, any order,
  several clauses) — `declInvariant`; after a `type X:struct = { … }` body — `typeInvariants` / `invariantClause`.
  `invariant (…)` inside an opener: E-DECL-INVARIANT-IN-OPENER on a declaration opener (E-PARSE-ATTR on an
  element). `invariantsKept`: E-DECL-INVARIANT-NO-FIELDS on a declaration with no attribute and no child field;
  E-BOOTSTRAP-UNSUPPORTED (INTERIM, g-boot-invariant-nested-field-s483) on a child field with fields of its own.
- Analyze (analyze.scrml, block "s483 (Q21 lane 1) — DECLARATION INVARIANTS" before `phaseB`):
  - `InvInfo` recorded on `DeclInfo.invs` (user declarations; `declInvInfos`, rebuilt when `derivedCycles`
    drops fields) and `TypeInfo.invs` (`type X:struct`; `typeInvInfos`).
  - phaseB: `resolveDeclInvs` (declEnv with inRenders — the §66.5.2 renders resolver, fields bare) and
    `resolveTypeInvs` (fields bound as read-only locals); each preceded by `invPurity` (E-CONTRACT-003 for `@`
    / `@.`; E-DECL-INVARIANT-IMPURE for an outer binding, a `function` call, a method / host call, a write, a
    function value, a query, a handled failable, a foreign block, a `<#id>` read, a spread). A clause that fails
    purity is not resolved (no cascade).
  - Typer: `typeDeclInvs` (from `typeUserDecl`) and `typeTypeInvs` (per file, from `typePass`) — `invTypeCheck`
    (E-DECL-INVARIANT-NOT-BOOL on a known non-bool / `not`; skipped when an earlier error lies inside the clause).
  - Static zone (`invFold` over `FEnt` path → literal entries): the declaration's defaults (`typeDeclInvs`,
    reported at the declaration), a use site's literal attributes (`useInvs`, from `typeUse`), and an object
    literal into a value of a type / declaration with invariants (`literalInvs`, from `boundValue` — so every
    position boundValue judges: initializers, locals, assignments, arguments, returns, elements). A spread prop
    hides the props before it. Unknown ⇒ no static claim (lane 2's run-time check).
  - `programFields`: an invariant reaching a program cell is E-BOOTSTRAP-UNSUPPORTED (fail closed).

## THE READ SET — the field shape lane 2 consumes

```
export type InvInfo:struct = { nid: int, span: ASpan, label: string, text: string, e: AExpr, reads: string[], heads: int[] }
DeclInfo.invs: InvInfo[]      // a user declaration's clauses, source order
TypeInfo.invs: InvInfo[]      // a `type X:struct`'s clauses, source order
```

- `reads` — every field path the expression reads, dotted from the value's root (`"start"`, `"range.end"`),
  the LONGEST member path at each read, deduped, first-read order. A field passed whole to a `fn` is its bare
  name (`ok(range)` reads `"range"`).
- `heads` — the index of each top field read, into `DeclInfo.fields` (attributes first, then child fields —
  `userFields` order) or the StructDef's `fields`; first-read order, deduped.
- A write needs the check iff some path it writes is equal to, a prefix of, or an extension of a path in
  `reads` (a whole replace / spread writes every head; `@x.range.end = v` writes `range.end`).
- `e` is the parsed expression. Its names are resolved in phaseB: decl-form names carry `NField(declSym,
  Lexical(0), idx)` facts (the renders scope); type-form names carry `NLocal(sym)` facts with one fresh Sym per
  field per clause (minted in `resolveTypeInvs`; the typer re-binds them by name, `typeTypeInvs`). Lane 2 can
  lower `e` against the candidate value with those facts, or re-bind by `reads`.
- `text` / `label` — for the E-WRITE-INVARIANT(-RT) message: name the label when given, else the text.
