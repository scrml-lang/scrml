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
