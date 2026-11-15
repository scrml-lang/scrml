# s478-boot-parser-smalls — progress

Lane: S478 bootstrap parser small clusters (triage C6, C8 alias, C15, C13, C19).
Branch `s478-boot-parser-smalls` from origin/main af7fe4bab. Base conformance JSON:
`~/.cache/scrml/review/s478-parser-smalls/base-cases.json` (PASS 422 · FAIL 142 · UNSUPPORTED 665).

## Items

- [x] C6 `given` arm + markup guard (§42.2.3) — parse.scrml `givenArmHead` / `givenArms` /
  `parseMarkupGiven`; slice-m4/given-arm-s478.test.js; gap g-boot-given-guard-arm-unbuilt-s478.
  The 4 conformance cases still FAIL only on case dialect (newline-terminated statements /
  newline-separated arms: E-STMT-MISSING-SEMICOLON / E-MATCH-ARM-SEPARATOR, C1). With the
  terminators written in, all 4 PASS (runtime included) — checked against scratch copies.
- [x] C8 type alias `type Id = int;` — ast `ATypeBody.AliasBody`, parse.scrml `parseTypeDecl`,
  analyze.scrml `aliasRhs` / `aliasCycles` / `resolveTypeName` / `typeInfos`;
  slice-m4/type-alias-s478.test.js. `cg-export-enum-library-rep` still FAILs only on its
  newline-terminated `type Id = int` (§7.2.2 rule 1 — an alias is not a `type … = { … }` item, so
  it takes `;`). `type E : error` NOT built (owner question). `body-top/declaration-trailing-tokens-rejected`
  is the body-top lane's (program-level reader).
- [x] C15 nested `<program>` through markup — parse.scrml `markupProgram` (hoisted via MP.hoist;
  file-top-level wrapped program still E-PARSE-PROGRAM), analyze.scrml `nestedProgramDiags` (no
  refusal beside a §4.12.2 Error); slice-m4/nested-program-markup-s478.test.js; program-shape.test.js
  pins updated. `program-nested-auth-through-div-pos` PASS; `program-nested-lifecycle-attr-neg`
  UNSUPPORTED (workers unbuilt, honest); `program-nested-app-attr-pos` still FAIL on the worker body
  `when message(d) { … }` → E-PARSE-ITEM (parseLogicItem — body-top lane / §43 workers; not touched).
- [ ] C13 cascades
- [ ] C19 misc
