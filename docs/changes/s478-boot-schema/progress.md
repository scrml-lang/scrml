# s478-boot-schema — progress

Lane: `<schema>` (SPEC §39) on the bootstrap. Branch `s478-boot-schema` from origin/main f23824dbb.

## Done
- schema.scrml (new): §39.2 body reader + §39.4/§39.5/§39.7 checks; refusals by name.
- parse.scrml: finishSchema (raw body, no children; §39.3 attrs refused; E-SCHEMA-002 via MP.schemaN).
- analyze.scrml: resolveSchema (E-SCHEMA-003 / E-SCHEMA-001; nested program refused), ElemFact.MSchema
  (renders nothing), §8.1.1 ownership (schemaDbs), `schema` dropped from structuralOwner.
- lower.scrml: MSchema renders nothing.
- severity.scrml regenerated.
- slice-m4/schema-s478.test.js (25 tests green).
- Conformance (head1): 6 UNSUPPORTED→PASS, 0 PASS→FAIL.

## Next
- corpus newly-rejecting/accepting differential, CI checks, hook, merge origin/main, PR.

## Owner questions
- g-boot-schema-column-comma-s478: `t { a: integer, b: text }` (17 conformance cases) — not in the
  §39.2 grammar; impl#1 silently drops every column after the first.
- g-boot-schema-dup-code-s478: §39.7 duplicate tables/columns SHALL be validated, no §34 code.
- migration artifacts (§39.8.1 SHALL write <db>.migration.sql/json) — impl#1 does not either.
