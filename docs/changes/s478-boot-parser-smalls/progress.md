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
- [ ] C8 type alias `type Id = int`
- [ ] C15 nested `<program>` diagnostics
- [ ] C13 cascades
- [ ] C19 misc
