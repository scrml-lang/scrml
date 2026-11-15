# s478-boot-attr-operator-residue progress

Base: origin/main af7fe4bab. Input: the two "Surfaced, not fixed" residues of
docs/changes/s478-boot-attr-values/progress.md (PR #1865).

## SPEC (verbatim)

- §5.2 "An unquoted value is read WHOLE (S457)": an event-handler value "is ONE expression and continues
  across whitespace wherever the expression does: after an operator that needs a right operand (`=`, `+`,
  `&&`, `?`, `:`, …), or before an infix operator, …, or the keyword tests `is` / `instanceof` / `in`";
  "any other attribute followed by an operator (`title=@a + "x"`, `href=docs/intro`) is
  `E-ATTR-UNQUOTED-OPERATOR`"; "A value that cannot be read whole is REFUSED, once per attribute, never
  truncated"; a handler EXPRESSION followed by `>` after inline whitespace is `E-ATTR-UNQUOTED-OPERATOR` too.
- §42.4 item 9: "A bare unquoted condition attribute is atomic-only (§5.2): `<div if=@x>` is the presence
  test; the explicit forms are parenthesized — `<div if=(@x is given)>`, `<div if=(@x is not)>`."

## Done

1. `parse.scrml` `unquotedOperatorDiag`: a bare value that is the postfix presence test (`Unary` IsGiven /
   IsNot — `is given`, `is not`, `is some`) is an operator form → E-ATTR-UNQUOTED-OPERATOR (same message as
   the other operators), value recovered whole. Handler values unchanged: `onclick=@ok = @last is given`
   stays clean (one expression, §5.2).
2. `lex.scrml` `bareValueEnds`: when the last token still needs a right operand, whitespace followed by a
   lone `>` / `/>` (`endsTagAt`) ends the value — the tag's end is never an operand. `parse.scrml`
   `operandlessEnd` / `operandlessValue`: a bare value ending in a punctuation operator is refused once
   (E-ATTR-UNQUOTED-OPERATOR; handler and non-handler wording), recovered whole, tag `>` left in place —
   no cascade. Word operators (`in >`, `is >`) reach the existing `trailingWordOperator`.

## Tests

attr-forms-s478.test.js: +2 tests (33 pass); both FAIL on base (lex/parse from origin/main).

## Measurements

- Conformance (`bootstrap-conformance.ts --json`) base → head: identical report (PASS 422, FAIL 142,
  UNSUPPORTED 665, CRASH 0). 0 PASS→FAIL.
- Corpus (3,149 files: conformance/cases samples examples acceptance; per-file Error code|start sets):
  0 newly rejecting, 0 newly accepting, 2 diag sets changed while still rejecting —
  samples/compilation-tests/{combined-020-calculator, gauntlet-s79-calculator}.scrml
  (`onclick=calculate()>=</>`: E-PARSE-EXPR → E-ATTR-UNQUOTED-OPERATOR; `>=` "reads as the operator").

## Notes

- `title=@last is not given` reads `is not` as the test and `given` as a boolean attribute (refused once,
  on `title=@last is not`). `is not given` is not a scrml form (§42 has `is given` / `is not`).

## Fix round 1 (#1873 review)
- MED: parse.scrml parseAttrValue — operandlessEnd is consulted only when the bare value does not parse whole (parse diags grew or tokens remain). A complete postfix `?` (§19.5.4) keeps its own diagnostics (E-ERROR-003, as on base); spaced `bad()? >` no longer cascades; ternary `@ok ? >` still refused.
- LOW: lex.scrml endsTagAt — note on `/> /` regex literals.
- LOW (item 3, `calculate()>=</>` naming `>=`): skipped — the value reader consumes the closer, not a trivial message tweak.
- Tests: attr-forms-s478 "postfix `?`" (red on 5473226783); 8 attr/markup slice files 330/330.
- Conformance vs origin/main 97278e7f9: identical (PASS 422/1868). Corpus 2860 files: 0 newly rejecting / 0 newly accepting.
