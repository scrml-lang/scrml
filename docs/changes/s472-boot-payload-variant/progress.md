# progress — s472-boot-payload-variant

base: origin/s472-boot-link-visibility 67bd70862 (#1606). Gap: g-boot-payload-variant-value-s472 (HIGH).

## SPEC sentences built
- §14.4 "Construction arity": one positional argument per declared field, in declaration order; too few / too many /
  a payload on a unit variant → E-TYPE-082; the check applies at every construction locus (`let` / `const` /
  state-cell initializers, `return`, `fail`).
- §14.10: a constructor argument is a bare-variant position resolved against the PAYLOAD field's type; the callee may
  be bare (`.V(…)`) or qualified (`E.V(…)`). §66.3 rule 5: "`E.V(…)` is a call whose declared type is `E`".
- §14.5 / §66.20: an undeclared variant → E-TYPE-VARIANT (supersedes E-TYPE-063 in the bootstrap); a bare variant two
  enums declare → E-VARIANT-AMBIGUOUS.
- §45.2: payload variants compare by tag + payload fields — the runtime's structural `eq` (unchanged; analyze already
  picked EqStruct for an enum with a payload variant).
- §57.8: the wire form `{"variant","data":{field: …}}` both ways (the existing codec; tested).

## Done
- core.scrml `Expr.VariantOf(enumSym, idx, args)` (nullary stays `Lit(Variant)`).
- analyze.scrml: `ValueFact.VConstruct`; `resolveCallOrConstruct` → `resolveConstruct` / `ctorOf` (the callee decided
  from the AST: `E.V(…)` with `E` an enum type here and `V` a declared variant or an uppercase name; bare `.V(…)`
  against the expected enum, else the one enum in scope); `isBareVariantish` (a bare construction takes the other
  `==` operand's type); typer `checkConstructArgs` (E-TYPE-031 per payload value, as typeFail); messages for the
  non-called payload variant updated (no "only `fail` builds one").
- lower.scrml VConstruct → VariantOf; print.scrml VariantOf → `variantValueJs` (the `fail` shape); check.scrml C-V1;
  walk.scrml kids; every exhaustive Expr / ValueFact match extended.
- Tests: slice-m4/variants-s472.test.js (17: Core shape, printed shape, C-V1, compiled+RUN, server return + argument
  over the §57.8 wire, 11 refusals); acceptance/variants/{construct-runs, neg-arity, neg-payload-type};
  slice-m4/strings-s469.test.js F/U-8 re-pinned (construction is now a value, still never a method).
- scripts/bootstrap-conformance.ts: a `state` assertion is judged on the snapshot re-keyed by the cell's declared
  Core type (§57.8 shape) — the bootstrap's in-memory payload is positional by design.
- Red-proof on base 67bd70862 (detached worktree, removed): variants-s472.test.js 15 of 17 FAIL (the 2 that pass are
  the two kept fail-closed refusals: `E.V()` on a unit variant, a constructor named as a value); the three acceptance
  cases are bootstrap-unsupported on base.
- bootstrap-conformance --write: PASS 254 → 259 · FAIL 51 → 51 · UNSUPPORTED 823 → 818 (5 cases UNSUPPORTED → PASS;
  3 move to parse-reject: their next wall is a missing `;` in the twin).
- known-gaps.md: g-boot-payload-variant-value-s472 (resolved), g-boot-position-write-s472 HIGH,
  g-boot-local-part-write-s472 MED, g-boot-logic-block-const-s472 MED, g-stdlib-md-regex-unicode-classes-s472 HIGH;
  g-boot-stdlib-none-compiles-s471 corrected (four md blockers). `for … else` / `xs[i].f` were already filed
  (g-bootstrap-loop-head-surface-s469) — not duplicated.

## Readings (not SPEC-stated)
- `E.V()` on a UNIT variant: refused E-BOOTSTRAP-UNSUPPORTED (fail closed) — §14.4 names "any payload on a unit
  variant" but `()` supplies none; §14.5 spells the unit value `E.V`.
- A payload variant named without its payload (`return Shape.Circle;`): refused E-BOOTSTRAP-UNSUPPORTED (a constructor
  as a function value; the bootstrap has no function values).
- A bare `.V(…)` with no expected type resolves against the ONE in-scope enum declaring `V` — the bootstrap's existing
  rule for a bare unit variant (resolveVariant). §14.10 says a bare variant with no type context is
  E-VARIANT-AMBIGUOUS; the bootstrap's laxer reading pre-dates this lane and is kept uniform, not widened.
