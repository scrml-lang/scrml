# s482-as-adjacency — progress

Lane: build the owner ruling (user-voice-scrml.md "RULED — `as.value`: adjacency decides",
ruling:user-voice-scrml.md-S482-as-adjacency): a `.` touching `as` is member access; a spaced
`as .V` stays the §14.12.6.2 bare-variant cast. Plus the #2058 review follow-ups (LOW-1..3, INFO-1).

Base: origin/main a7f50def5 (contains #2058).

## Log
- lex.scrml: `dotLastKind` — classifyCode reads `as` as a name for the `.` decision only when the
  `.` touches it (span.end == cursor pos). `/` after `as` unchanged. Probe: `as.value`,
  `as.f()`, `as.value.deep` lex Dot+Ident and compile/run; `a as .P`, `x as\n.V`, `as /*c*/.V`,
  `as //c\n.V`, imports unchanged.
- parse.scrml: LOW-1 (parseKeywordPrimary `function <word>` → bindNameTok), LOW-2 (givenArmHead,
  parseGivenPresence, markupGivenAhead → bindNameTok), LOW-3 (parsePattern bare binder,
  armStartsAt `_ x` / bare `x :>` / legacy `.V x` → bindNameTok), INFO-1 (shadowLint in
  parseFnDecl: W-RENDER-SHADOWED / W-LOG-SHADOWED, impl#1 messages). severity.scrml regenerated.
- SPEC §14.12.6.2 sentence + §7.2.2 rule 4 cross-ref; gap g-boot-contextual-as-member-s482 resolved;
  new gap g-boot-self-host-parse-residue-s482 (the analyze.scrml remainder is now parsed).
- Test: slice-m4/as-adjacency-s482.test.js — 16 pass head; base 5 pass / 11 fail.
- Parse-level corpus diff (3059 files): analyze.scrml 931→4051 (remainder now reached; <6590
  identical), 73 files + W-LOG-SHADOWED (Info only). No other change.
