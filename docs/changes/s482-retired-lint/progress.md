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

## Gates (head 4eba4013e vs base 84e602f40; artefacts in ~/.cache/scrml/review/s482-retired-lint/)

| gate | result |
|---|---|
| pre-commit (both commits) | PASS — 58,299 / 58,315 pass, 0 fail (8 shards, ~6–8 min wall) |
| pretest | exit 0 (13 samples + todomvc compiled) |
| bootstrap-conformance --json base → head | identical: PASS 849, FAIL 3, NOT-TWINNED 628, UNSUPPORTED 491, CRASH 0; 0 bucket moves, 0 emitted-code changes, 0 record diffs |
| corpus differential (2975 files) | head compiler on base files: 0 newly rejected / 0 accepted / 0 byte / 0 code diffs. Head compiler + migrated head files vs base: 0 newly rejected, 0 newly accepted, 0 byte diffs; 43 code diffs, all in migrated samples (every one rejected before and after) |
| impl#1 on the 52 migrated samples | 52/52 same exit code |
| s34-census --check-new --base origin/main | PASS (4 new/changed rows) |
| snippet-gate | 120 pass / 0 fail / 9 spec-ahead |
| claim-gate | 26 pass / 0 fail (72 skip, 36 snippet, 16 spec-ahead) |
| types-gate --check | OK — 182 (115 distinct), unchanged |
| e2e-render-map | 259 pass / 0 fail |
| retired-forms gate on head | OK (exit 0) — 5432 hits scanned, pending HARD debt 820 |
| retired-forms gate on main (head ledger + baseline) | FAIL (exit 1) — the 177 retired closer lines in 52 sample files |
| gate runtime | ~0.55 s (`--quiet`, warm) |

## Fix round r2 (#2101 r1 re-review: ~/.cache/scrml/review/s482-2101-r1rev/review.md; artefacts ~/.cache/scrml/review/s482-2101-r2/)

- **0 — merge.** origin/main merged (#2103 `::` deprecation, #2096). severity.scrml regenerated; known-gaps
  both entries kept. `variant-colons` row = the colons lane's row text (`enforcedBy: bootstrap`); baseline
  154 → 15 (`--update`). #2103 rewrote `::V ->` / `| ::V` arms to `.V`, which match-arrow-arm / arm-pipe see
  (they never read `::V`): those keys and the colons case's 2 rhs-decl are recorded at their counts.
- **1 — MED-1.** §19.15–§19.17 moved back into §19 (a pure move, numbers and headings unchanged). Regions are
  the ledger's `migrationRegions` (exact heading line, exactly once, own children only). SPEC :24709 counted.
- **2 — MED-2.** Blockquoted fences and `scrml…` info strings read; SPEC :8621 (rhs-decl), :13443
  (component-const — an EXECUTED-measurement quote) baselined; :10780's `::` was migrated by #2103.
- **3 — MED-3.** `--base-ref` runs the BASE ledger's rules over the head tree (`baseRulesOnHead`).
- **4 — E-CONTRACT-003 (owner ruling, ruling:user-voice-scrml.md-S482-contract-003-derived-check).** The
  INTERIM notes became the ruled derived-check advice (§34, §53.1, §53.3.2 incl. the table cells, §53.8.3,
  §53.11, §53.12.4); bootstrap message updated + pinned; gap resolved; impl#1's "use <engine>" filed
  (g-impl1-contract-003-engine-advice-s482, open).
- **5 — LOW-5.** Every .md read except EXCLUDED (reasons) / node_modules / dist / dot-dirs; `archive` not
  skipped. FRICTION.md's 2 HARD fences are deliberate quotes of the code tried then → `retired-neg`
  marked; 11 SOFT baselined. PIPELINE.md excluded (TS listings, no scrml fence).
- **6 — LOW-6.** Case budgets (one hit per expected occurrence, shared by rows sharing a code; own files only).
- **7 — LOW-1/2.** String-aware foreign brace count; unclosed raw body to the next closing tag (exposed
  samples/api-dashboard.scrml past a `<pre>…</>`: 10 SOFT baselined); `}`+`/` division; `<` operand;
  bootstrap binaryOpLast `.GreaterThan` (not `:>`). Left as §63 known limits: `xs["push"](1)`,
  `if (a) xs.sort()`, a closer inside an unclosed raw body.
- **8 — NITs.** Bad `--base-ref` → exit 2 + message; hook-reads-working-tree documented.

| measure | before (r1rev, 9253aff) | after (r2) |
|---|---|---|
| harness2, 60 attempts — escaped | 38 (20 undocumented) | 17 (0 undocumented: 9 by design, 4 documented, 2 now in §63 limits, #29 artefact, #59 legal) |
| r0 harness, 100 | 94 caught | 94 caught (same 6: path words ×3, `<pre>` body, `.pop()` / `.shift()`) |
| FP set, 20 | 1 | 1 (`throw` in `^{}`) |
| `--base-ref` scenarios | narrow / codewiden / heading exit 0; bad ref = stack trace | all 12 exit 1; bad ref exit 2 |

| gate (r2 head) | result |
|---|---|
| pre-commit (4 commits) | PASS each (58,394–58,406 pass, 0 fail) |
| pretest | exit 0 |
| bootstrap-conformance base (origin/main) vs head | identical: PASS 851 / FAIL 3 / NOT-TWINNED 628 / UNSUPPORTED 491 / CRASH 0 |
| lint unit test / slice retired-lint / slice refinement | 63/63 · 35/35 · 22/22 |
| gate head / `--base-ref origin/main` | exit 0 (5,464 hits, debt 907) / exit 0 |
| corpus differential (2,976 files) | head on base files 0/0/0/0; head files: 0 newly rejected/accepted, 0 byte, 43 code diffs = the migrated samples |
| s34-census --check-new | PASS (5 rows) |
| snippet-gate / claim-gate / types-gate | 120/0 (9 spec-ahead) · 26/0 · OK 182 unchanged |
| host-global-scan 1/2, 2/2 | 0 violations each |
| e2e-render-map | 259/0 |

## Fix round r3 (review ~/.cache/scrml/review/s482-2101-r2rev/review.md)

- **F1 (HIGH) + F3.** The hand fence parser is gone: markdown is read by `marked`'s lexer (a declared
  devDependency, ^14.1.3) — fenced blocks with lang empty / `scrml…` / `{.scrml}`, blockquoted, list-item and
  quoted-list fences included, each ending where CommonMark ends it. Each block is placed back on its source
  lines (opener + every body line, in order); an unplaceable block throws (fail closed). `retired-neg`
  markers count only at the fence's blockquote depth (kept "directly above", not "after blank lines").
  Parity unit test over every read .md (fence set == marked's; mapped lines verified). Both F1 reproducers
  (SPEC `let <series…/>` + `while`; synthetic `> ```scrml` lazy end) exit 1.
- **F2.** Ruled derived-check advice scoped to the cross-cell case: §53.3.2 transition row -> §66.13.2
  `rule=` (S435 Q6); struct row -> §53.8.1 `<engine for=Struct>` guard (§53.8.1's `<engine>` is §66.21
  Stage-1 soft, not removed, so the row is made consistent, not struck); §53.1 "not type rules" -> "not inline
  predicates", one mechanism per example; stateless test / §53.3.2 intro point at the table.
- **F4.** Appendix E region dropped (0 hits exempted); §63 / §66.21 bound to `after` / `before` neighbours,
  §63 to its `firstChild`.
- **F5.** `corpus` (scrmlRoots / excluded / skipDirs) in the ledger; `--base-ref` runs the base corpus.
- **NITs.** caseOwns = case.scrml + its in-code imports, exact paths; bootstrap example `<over=(@cell > @m)/>`
  (the type is read before its cell's name is known).
- No baseline count moved (`--update` not run).

| measure | r2 | r3 |
|---|---|---|
| harness2 (60) escaped | 17 | 17 (identical rows) |
| r0 harness (100) | 94 caught | 94 caught (same 6) |
| FP (20) | 1 | 1 |
| baseref (12 + badref) | all 1 / 2 | all 1 / 2 |
| r2probe (34) + 6 new | 10 exit 0 that should fail (F1 ×2, F3 ×4, `{.scrml}`, bq marker, relocate E, EXCLUDED) | all caught except by-design (child in §63, retired-neg on a positive, codeCounts inflate, budget 2/2, shared x2) and the indented-``` case: CommonMark-correct now, but the stray ``` is an unterminated template literal to scrml (new §63 known limit) |

## Fix round r4 (S482)
- **F1.** Fence / heading lines come from marked's own cursor: every `blockTokens` call is a frame, a token
  starts at `frame.length - remaining.length`; blockquote segments / list items map line for line; a re-read
  container keeps the replaced token's start. The placed line is checked against the source; an unplaceable
  block throws `PlacementError` → exit 2, clean message. Old vs new placement over the corpus: 1443 fences,
  0 diffs. mapcheck is a unit test; decoys a01–a04, a09, a25 are unit tests.
- **F2.** `migrationRegions` dropped from the ledger and the script; a ledger listing them fails; §63 says no
  region is exempt.
- **F3.** §53.1 bullet + §53.3.2 struct row ⚑ OPEN (g-spec-struct-invariant-form-s482, owner question);
  §53.6.1 "Cross-field via predicate args" ⚑ CONTRADICTED (g-spec-refinement-cross-cell-arg-s482 — S458 R4
  already ruled the example corrected; correction owed).
- **NITs.** Transition row cites ruling:S435 (PA proposal text answered "a", L488); unplaceable → exit 2; the
  stray-``` limit tagged INTERIM with the capable form.
- No baseline count moved.

| measure | r3 | r4 |
|---|---|---|
| r3rev line-mapping (24) | 7 escaped | 0 (all exit 1; a16/a17 now read, not fail-closed) |
| f4 region (7) | 2 escaped | 0 fence escapes (heading-only edits exit 0: no region exists) |
| r2probe (40) | 6 exit 0 by design | 5 by design + 2 heading-only (level_change, swap_63_child); child_in_63 now caught |
| harness2 (60) | 17 | 15 (§63.4 / §66.21 fences now caught) |
| r0 harness (100) | 94 | 94 |
| FP (20) | 1 | 1 |

## Fix round r5 (S482)
- **HIGH-1 — option (b), commonmark.js cross-check.** Importers of `marked`: scripts/retired-forms-lint.ts, its
  unit test, and docs/build.ts (no inputs since S469 — the lint is the only live user). ~~Option (a) was not
  available: the first agreeing marked, 18.3.0, was published 2026-11-24 (one day old; no version ≥ 18.3.0
  is two weeks old).~~ *(r6: false — marked 18.0.0, published 2026-04-07, already agrees; see Fix round r6.)*
  Option (b) taken. So `commonmark` 0.31.2 (exact pin, published 2024-09-19) reads every markdown file too,
  and `readFences` throws `PlacementError` (exit 2) when the multiset of READ fence texts (lines trimmed)
  differs between the readers. §63's lazy-continuation sentence corrected; the exit-2 class is INTERIM, the
  capable form a single CommonMark-agreeing reader (~~marked ≥ 18.3.0 once it is two weeks old~~ r6: marked ≥ 18.0.0
  once the placement wrappers are re-proven on it).
- **LOW-1.** §53.6.1 "Cross-field via predicate args" rewritten per S458 R4: no cross-cell argument in type
  position (E-CONTRACT-003); the ruled derived check; the §55.11 state-cell validator keeps its cross-field
  argument. ⚑ CONTRADICTED removed; g-spec-refinement-cross-cell-arg-s482 resolved. The duplicate §53.6.1
  heading (S458 R5 renumber) is not touched.

| measure (r4rev probes) | r4 | r5 |
|---|---|---|
| classify fuzz, seeds 11+23 (40,000) — fail-open (gate < commonmark) | 161 + 159 | 0 + 0 |
| classify fuzz — exit 2 | 129 + 132 | 290 + 291 (= r4 exit 2 + r4 escapes; gate = commonmark unchanged 19,710 / 19,709) |
| fuzz2 vs marked 18 (r4: 20,000; r5: 4,000) | 161 escaped | 0 escaped, 49 exit 2 |
| b-set (34) | b04/b04b escape | b04/b04b exit 2; rest identical (b27 = probe construction error) |
| r3rev a-set (24) | all exit 1 | all exit 1 |
| corpus parity (53 files, 1,443 fences) | 0 differ | 0 differ; gate exit 0 |

## Fix round r6 (S482)
- **MED-1 — the INTERIM's reason corrected.** marked 18.0.0 (2026-04-07) through 18.1.3 already agree with
  commonmark.js on the 40,000 r4 fuzz documents and the lazy reproducers (17.x and earlier do not; r5rev
  `probe/mver2.out`). Option (b) stays in this PR. The single-reader form is not used yet because the placement
  wrappers hook marked internals (`blockTokens`, tokenizer methods) and must be re-proven on marked ≥ 18.0.0.
  Corrected: §63, the script header, the `crossCheck` doc comment, the r5 entry above. Filed
  g-tool-retired-lint-marked-bump-s482 (INTERIM; capable form: bump + re-prove with the unit suite, a-set,
  b-set, fuzz).
- **LOW-1 — BOM.** `normalizeEol` drops a leading U+FEFF, so both readers (it runs before marked and
  commonmark.js) read a BOM-prefixed file's fences as cmark / GitHub do. Unit test: a BOM-prefixed .md with a
  retired fence is read by `readFences` and exits 1 through the gate (fails without the fix).
- **NIT-1.** §63: "exits 2 when the two readers' multisets of read fence texts (each line trimmed) differ";
  no claim about info strings or positions.
- **INFO-1.** PR body: run `bun install` in the main checkout after merge (new devDependency `commonmark`).
