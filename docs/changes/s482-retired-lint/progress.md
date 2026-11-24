# s482-retired-lint — progress

Brief: `~/.cache/scrml/review/s482-briefs/retired-lint.md`. Branch `s482-retired-lint` from origin/main 84e602f40
(contains #2095, the closer cleanup).

Rulings (scrml-support/user-voice-scrml.md, verbatim):
- ⭐ "every retirement / deprecation PR adds a retired-forms ledger row and migrates" (S482) — *"every PR that retires
  or deprecates a syntax form must do both: 1. add a row to the retired-forms ledger (`compiler/retired-forms.json`):
  the old form, the new form, its tier, the error or warning code, and the ruling citation; 2. migrate the SPEC
  examples, or for a deprecated form, record the starting count, which then only goes down."* The same answer
  confirmed R3 (*"`<x>` in an expression is not a read form — §4 table: "`@x` reads"; the parser gives one targeted
  error with a fix-it to `@x`"*) and R4 (*"re-point the W-CONST-AT-DEPRECATED fix-it from the deprecated `const <x>`
  to `<x=(expr)/>`"*). Cite: `ruling:user-voice-scrml.md-S482-retirement-ledger-rule`.
- "every SPEC example is in the current language, except labelled negatives and marked deprecated demonstrations"
  (S482, R1) — *"sequenced after the `/}` cleanup and the gate, chapter group by chapter group"*.
- "`::` variant access is deprecated (§63 window: warning + `scrml fix` to `.`)" (S482, R2) — this lane adds the
  ledger row only (starting count); the deprecation build is a later lane.
- PRINCIPLE "corpus usage is not evidence of what the language should do" (S482) — corpus counts here measure
  breakage only.
- Owner: *"if I cant trust that language rulings from that long ago are being honered, how am I supposed to believe
  that we are on the right track?"*

## Commit 1 — item 0 (bootstrap), R3, the ledger, bootstrap-conformance reads it

Item 0 (from the #2095 r1 review, `~/.cache/scrml/review/s482-2095-r1rev/review.md`):
- (a) LOW-4 — `parseMarkupValue` now names its sub-reader's retired closers (`slashDiags(rn.mp)`):
  `${ fn card() { return <div>\n<p>hi/\n</>; } }` → E-SYNTAX-050 at the `/` (was none).
- (c) LOW-1 — fixed, two rules in `parse.scrml` RETIRED CLOSERS: (1) `RSlashes.dry` — an element left unclosed
  with no candidate and no hit inside it stops every element around it from naming candidates (no retired reading
  closes it); (2) `slashDrop` — an element closed by its OWN name drops the candidates inside it, unless a hit was
  already named inside it (then the same-name match may be a coincidence — samples/kanban-r11.scrml). U-and, U-frac,
  U-folder, U-docs-tag, U-nocloser-far: no 050 now. U-code-unclosed keeps its 050: there the retired reading DOES
  re-balance (`/` closes `<p>`, `</>` closes `<code>`), so it is a correct name.
- (c) LOW-2 — fixed in `lex.scrml` `markupExtentFrom` mode 2: not a `*/`, and not when the body reads as a legacy
  expression (`legacyReadBefore`, unless the body starts with a tag). `{<n> > 0 /* c */}` / `{<n> && /x/}` now get
  the R3 error at `<n>` instead of a misattributed 050.
- (b) LOW-3, (d) NIT-1, (e) banner — commit 3 (gap + SPEC text).

R3 — E-CELL-ANGLE-READ (minted; no §34 code fit: searched the E-/W- DECL / STATE / CELL / READ families and
§66.21 — none is "a cell name in read position"). The lexer cuts a legacy read `<n>` to one token
(`angleCellReadEnd`: a bare `<ident>`, not void, followed by `; ) , ] }`, or by an operator / `.` when the element
never closes as markup) — in an operand slot, at a region head, or after `{`; `bareMarkupAhead` leaves it to the
expression reader. The parser (`angleCellRead`) reports one error over `<n>` with the `@n` fix-it and reads on as
`@n`. `<n> = v` (the retired declaration) is excluded. §34 row added; severity.scrml regenerated.

Measured (`~/.cache/scrml/review/s482-retired-lint/`): review probes cases1/2/3/r1 identical to #2095 head; cases-rev
differs only in the intended rows (L-value-legacy-cmt/-rx, U-and/frac/folder/docs-tag, U-nocloser-far, N-comp-fn).
Corpus (2975 files: examples, samples, benchmarks, conformance/cases) base 84e602f40 vs head: newly rejected 0, newly
accepted 0, byte diffs 0, code diffs 0, message diffs 0 — all 145 sample 050 lines still named.

Ledger: `compiler/retired-forms.json` — 50 rows (26 HARD, 24 SOFT). `scripts/bootstrap-conformance.ts`
LEGACY_MARKERS / NO_FIX_RULE_MARKERS now come from the ledger's `legacyMarker` rows (checked: the seven name +
source + flags tuples are identical to the old list).

Tests: `compiler/self-host-v2/slice-m4/retired-lint-s482.test.js` (+ closer-cleanup-s482, parser-lows-fu-s482):
81 pass / 0 fail.
