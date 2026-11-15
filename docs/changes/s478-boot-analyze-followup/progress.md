# s478-boot-analyze-followup progress

- base: origin/main cc0b2a78e (#1867 merged)
- input: the #1867 S239 review (F1–F4) and the #1865 re-review's orphanElse note; probes in
  `~/.cache/scrml/review/s478-1867/probe/` re-run first, and each finding reproduced.

## F1 — C13 suppression masked an arm's E-TYPE-031 (MED-LOW)
analyze.scrml typer (`match` value): a coverage-refused match (`coverageRefused`) now returns
`rvt(vt, ts)`, not `rvt(VType.Unknown, ts)`. Only the `| not` widening is dropped. The
reviewer's suggestion was verified:
- `refusedArmMaybe` → E-TYPE-020 + E-TYPE-031, where it was E-TYPE-020 alone.
- `refusedMaybeSubjectArmMaybe` → E-MATCH-012 + E-TYPE-031.
- The C13 tests in analyze-checks-s478.test.js still pass (25/25). A missing arm on its own
  still draws no E-TYPE-031.

## F2 — W-STYLE-CONFLICT-POSSIBLE wording (LOW)
`styleWinner`: the (ids, classes, tags) specificity of the most specific arm of each rule that
matches the shared element. On a tie the message says "source order alone: the later rule".
Otherwise it says the higher-specificity selector wins, and adds "although it comes first" when
that selector is the earlier rule. Cited: §65.2 (S473 D20) and §65.8.

## F3 — capitalised `<EngineName/>` (LOW)
- resolveElem: a capitalised tag that names an imported non-declaration (`mountsImportedNonDecl`)
  and has no §52 state-type attribute goes to `unknownElement`, which gives
  E-ENGINE-MOUNT-NOT-ENGINE instead of E-COMPONENT-035.
- The message names the tag by its opener, `<helper>`. The AST (AElem) does not record whether
  the source was `<helper/>` or `<helper></helper>`. Adding a flag would change the AST struct
  for a message string, so the opener form, which is true of both, is used instead.

## F4 — `Étoile` (LOW)
parse.scrml `parseVariants`: after the "expected a variant name" token, the parser skips the
tokens that touch it (no whitespace between them, up to `,` / `}` / `(`), along with a payload
`( … )` that touches them. The leftover is part of the failed variant, so it never becomes a
variant of its own.
- `Étoile` → 1 E-PARSE-TYPE.
- `日本` → 1 E-PARSE-TYPE, where it was 2.

## orphanElse in handler blocks
Not reproducible on main. The reviewer's errors come from #1865's branch alone: its base,
ba56382e9, predates #1867 and has no `orphanElse`. Running #1865's parse/lex diff on top of this
lane, in a scratch copy, gives E-STMT-UNEXPECTED-TOKEN for all three forms:
- `onclick={ if (@ok) { bump(); }; else { bump(); } }`
- its `${…}` twin
- `${ bump(); else bump(); }`

So no parse.scrml change was made for this item. Tests cover the braced handler forms, which
main parses. The `${…}` forms need #1865 (on main, `onclick=${…}` is still E-PARSE-TRAILING).

The handler-block test file has a self-enabling case for the `${…}` forms. It returns early
while a clean `onclick=${ … }` is still refused on main, and starts asserting once #1865 lands.
It was verified against the merged scratch copy.

## Gates
- `slice-m4/analyze-checks-followup-s478.test.js`: 16 tests. `analyze-checks-s478.test.js`:
  25/25, so the C13 tests still hold.
- Bootstrap conformance, `bun scripts/bootstrap-conformance.ts --json`, per-case diff of
  bucket and emitted codes:
  - Before (origin/main cc0b2a78e): PASS 366 · FAIL 239 · NOT-TWINNED 624 · UNSUPPORTED 639.
  - After: identical, with 0 cases changed (no PASS→FAIL).
- severity.scrml: no code set changed; `gen-bootstrap-severity.ts --check` reports it is current.
- Newly rejecting, by construction: none.
  - F1 adds an E-TYPE-031 only beside an existing E-TYPE-020 / E-MATCH-012 Error.
  - F3 re-codes a tag that was already E-COMPONENT-035.
  - F4 removes reports.
- Slices: m1 167, m2 619, lowered m1 167, m3 60, m4 6191, codec 166, e2e-render-map 259, all with 0 failures. The pre-commit hook passed: 54,908 pass, 0 fail.
