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

## Final gates (head 7b556a288)
- `bun run pretest` exit 0.
- bootstrap-conformance --json base a7f50def5 vs head: identical except the timing line;
  PASS 772 / FAIL 3 / NOT-TWINNED 628 / UNSUPPORTED 555 / CRASH 0.
- Emitted output (compileSource, 3031 non-self-host files incl. all conformance cases): js / html /
  server identical everywhere; ok 315 = 315; diagnostics differ in 73 files, each only by the added
  W-LOG-SHADOWED (Info) for a `function log` declaration.
- Parse-level corpus (3059 files): newly rejected 0, newly accepted 0 outside analyze.scrml.
- Self-host analyze.scrml: :6596–:6613 now parses; E-PARSE-LOCAL 0 → 2 because the parser now reaches
  :10431 `const lin` and :27687 `let of` (previously swallowed) — g-boot-self-host-parse-residue-s482.
- s34-census --check-new PASS; types-gate OK (182, unchanged); snippet-gate 0 fail; claim-gate 0 fail;
  corpus-compile-floor PASS; gen-md-shim current; gen-bootstrap-severity --check current.
