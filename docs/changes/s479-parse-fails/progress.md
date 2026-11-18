# s479-parse-fails — progress

Lane: three bootstrap conformance FAILs in `compiler/self-host-v2/parse.scrml` (base origin/main 79d52018c).
Scratch: `~/.cache/scrml/review/s479-parse-fails/` (probe.ts, corpus.ts, base tree, conformance JSON).

- [x] 1. `body-top/declaration-trailing-tokens-rejected` (g-boot-body-top-type-alias-region-s478)
  - `parseMarkupItem`: `[export] type` at a body top → `LexStop.Decl` (was `LexStop.Statement`).
  - `parseTypeDecl` alias: `aliasTrailing` / `declRestEnd` skip the rest of the alias's line after a missing `;`
    (cascade quiet, ruling item 2) and name the skipped text in the `;` report (§40.8 coverage). A refused
    `:kind` (`:union`, `:error`) skips its rest the same way.
  - a general union alias (`number | string`) is read whole and refused by name (E-BOOTSTRAP-UNSUPPORTED),
    not a misplaced `;` after its first member.
  - case edited: `"a" | "b"` (not a §7.5 type form) → `number | not`; `console.log("after")` (a 3rd
    rule-1 `;`, and `.log` not in the bootstrap) → `@count = 2;`. impl#1 xfail signature unchanged.
- [x] 2. `sql/query-not-readable-neg` — `sqlInCondition` re-codes the not-ONE-template E-SQL-003 in an `if`
  condition (statement + value `if`) to E-SQL-QUERY-NOT-READABLE.
- [x] 3. `type-state-codes/e-type-045-prefix-not-negation-pos` — `notPrimary`: `not` + an operand on its line
  → E-TYPE-045, operand read, Recovered. INTERIM same-line (legacy `@a = not⏎@b = not` keeps its `;` report).
- [x] severity.scrml regenerated. Conformance: 3 FAIL→PASS, 0 PASS→FAIL. Corpus: 0 newly-rejecting / accepting.
- [x] SPEC: §34 E-SQL-QUERY-NOT-READABLE row reword; §34 E-TYPE-045 bootstrap emitter; §7.2.2 newline table rows (alias remainder, `not⏎x`).
- [x] gaps resolved + residue gap g-boot-sql-query-not-readable-positions-s479; CI gates green locally.
- [x] commit (hook), push, PR (#1963).

## Fix round r1 (review s479-1963) — branch s479-parse-fails-r1 off c75c7eaa
Scratch: `~/.cache/scrml/review/s479-parse-fails/r1/` (base = c75c7eaa tree, main0 = c75c7eaa^, probes, corpus2.ts).
- [x] MED-1 — `notCode`: a statement OPENING with a prefix `not` whose E-TYPE-045 is at its first token is
  not code (body-top prose `It does not need a validator.` → one E-UNQUOTED-DISPLAY-TEXT). md-article back to 38.
- [x] LOW-2 — not covered (markup read as an expression); filed g-boot-e-type-045-in-misread-markup-s479.
- [x] LOW-3 — `aliasTrailing` / `aliasSkipEnd` / `aliasStopAt`: skip only tokens that cannot start a statement;
  a group skipped whole to its matching closer; a never-closed opener bounds the skip to the line and is reported.
  §7.2.2 row sentence restored + amended.
- [x] LOW-4 — `for (cond)` head through `sqlInCondition`; §34 row notes the widened scope (D29).
- [x] INFO — body-top gap notes the "after `"b"`" wording drift.
- [x] tests (8 red on c75c7eaa), conformance 0 bucket/code changes vs c75c7eaa, corpus 0 newly rejecting,
  severity --check, s34-census, claim/snippet/types/corpus-floor/md-shim gates.
- [ ] commit (hook), push to s479-parse-fails.
