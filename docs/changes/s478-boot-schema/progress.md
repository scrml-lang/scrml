# s478-boot-schema — progress

Lane: `<schema>` (SPEC §39) on the bootstrap. Branch `s478-boot-schema` from origin/main f23824dbb,
merged with origin/main 849fe5c18.

## Done
- schema.scrml (new): §39.2 body reader + §39.4/§39.5/§39.7 checks; refusals by name.
- parse.scrml: finishSchema (raw body, no children; §39.3 attrs refused; E-SCHEMA-002 via MP.schemaN).
- analyze.scrml: resolveSchema (E-SCHEMA-003 / E-SCHEMA-001; nested program refused), ElemFact.MSchema
  (renders nothing), §8.1.1 ownership (schemaDbs), `schema` dropped from structuralOwner.
- lower.scrml: MSchema renders nothing. severity.scrml regenerated.
- slice-m4/schema-s478.test.js — 25 tests, 25/25 red on base, green on head.
- failclosed.test.js: `schema` left the structural-refusal list.
- spec-ahead pins updated (README.md, NERDME.md, docs/tutorial.md, docs/articles/llm-kickstarter-v2).
- known-gaps: g-boot-schema-column-comma-s478, g-boot-schema-dup-code-s478 (owner questions),
  g-boot-schema-interim-refusals-s478, g-boot-sql-row-types-s478.
- Conformance: 6 UNSUPPORTED→PASS, 0 PASS→FAIL, 0 →FAIL.
- Corpus (3150 files, origin/main vs head): 0 newly-rejecting; 2 newly-accepting (schema/clean-pos,
  schema/w-schema-001-warn — both legal). Plus 2 docs probes (legal §39.2).
- CI checks: types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim, severity --check: green.

## Next
- push, PR.

## Fix round 1 (review of #1908)
- F1 (HIGH): a user declaration named `schema` → E-BOOTSTRAP-UNSUPPORTED (analyze userDeclStub), and a
  `<schema>` use while one is in scope → refused (resolveElem) — never rendered as nothing. Owner
  question g-boot-schema-user-decl-name-s478 (add `schema` to §4.15's reserved list).
- F2 (MED): `default(…)` admits literals only (§38.5.4 "passed verbatim to the generated SQL"):
  number, `'…'`, `X'…'`, NULL/TRUE/FALSE/CURRENT_*, signed number, parenthesized constant expression.
  `${…}` / `?{…}`, identifiers, calls, `"…"` refused by name.
- F3 (MED/LOW): schemaCloseAt moved to schema.scrml and reads with the body reader's skipping
  (`//` comments, one-line quotes) — `default('</>')`, `// see </>` are text; an unterminated
  `<schema>` is no longer rescued by `// </>` (E-PARSE-UNCLOSED).
- F5 (LOW): a give-up after name+type keeps the partial column (pk/refs); W-SCHEMA-001 is not
  raised on a table whose reader gave up.
- F6 (LOW): `db . users {` (whitespace / closed comments around `.`) → E-SCHEMA-012 (§39.2).
- Gap markers: g-boot-schema-runtime-inert-s478 (F4), g-boot-schema-type-case-s478 (F7),
  g-boot-schema-create-table-prose-s478 (F8); interim-refusals entry extended with the default rule.
- Tests: schema-s478.test.js 40/40 (15 new).
- Conformance vs main: 6 UNSUPPORTED→PASS, 0 PASS→FAIL (identical to the PR's first head).
- Corpus (3150): 0 newly-rejecting vs main; vs first head only 17 W-SCHEMA-001 cascade removals.
- CI checks (types, snippet, claim, floor, md-shim, severity --check): green.
