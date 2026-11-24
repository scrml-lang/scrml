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

## Commit 2 — the gate, the baseline, the sample migration, R4, SPEC + gap text

- `scripts/retired-forms-lint.ts` (the gate) + `scripts/retired-forms-baseline.json` + tests
  `compiler/tests/unit/retired-forms-lint-s482.test.js` (16 pass). Wired into CI `checks` and the pre-commit hook
  (`--quiet`). Runtime ~0.5–0.7 s over the whole corpus (5432 hits scanned).
- R3 narrowed: a cell name starts lowercase or `_` (`let p = <Point>;` is a §48.2.1 struct instance, not a read) —
  bootstrap `angleCellReadEnd` and the lint agree.
- H1 MIGRATED: the 177 retired closer lines in 52 sample files (the 145 the bootstrap names, the 24 of the gap's §5b,
  and 8 more the gate found — admin-panel 252–254 and five `/   // closes …` lines) rewritten `/` → `</>` by
  `~/.cache/scrml/review/s482-retired-lint/gen/migrate_h1.py` (log: `h1-migration.log`). Verified by recompiling
  every sample: bootstrap — 0 verdicts worse, 0 better (all 52 were and stay rejected for other reasons), every
  E-SYNTAX-050 gone, error counts mostly drop (kanban-r11 299→149) — four files show codes their newly-read
  remainder carries (E-STYLE-001 ×2 files, quiz-app E-CTRL-001 / E-PARAM-TYPE-REQUIRED, rust-dev-lin-lift-edge-cases
  E-PARSE-CLOSER/UNCLOSED); impl#1 — 52/52 same exit code (13 accepted, 39 rejected, before and after).
- Every other HARD row with hits is `pending` (dated 2026-11-24, reason per row) — chosen because the ruled R1
  sequencing is "after the `/}` cleanup and the gate, chapter group by chapter group", and most remaining sites are
  in stdlib / conformance positives that impl#1 compiles (it refuses the ruled spellings: g-selfhost-while-migration-
  blocked-s481). SOFT rows: starting counts per file.
- R4: SPEC §6.6.1 text, the W-CONST-AT-DEPRECATED and E-CONST-AT-DEPRECATED §34 rows now name `<name=(expr)/>`
  (the bootstrap's refusal already did — refusals.scrml). claim-gate.js header: `->` arms are deprecated, not invalid
  (quoted W-MATCH-ARROW-LEGACY: "All three forms parse").
- SPEC: §63 "The retired-forms ledger (S482)" normative paragraph; Appendix E cross-reference; :14 banner rewritten to
  be exactly true after item 0; E-SYNTAX-050 row; O35 notes `<x>` read RULED.
- Gap g-boot-retired-closer-unread-s482: LOW-3 recorded as INTERIM shape (2) with the capable form (re-balancing
  reading); NIT-1 cause note corrected; the 8 newly found unread lines added; notes the samples are migrated.
