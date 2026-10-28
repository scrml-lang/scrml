# s472-boot-db-body-mode — progress

Lane A of the `<db>` body design (scrml-support/docs/deep-dives/db-body-and-client-reads-design-2026-10-28.md §5).
Ruling: scrml-support/user-voice-scrml.md "⭐ RULED — `<db>` body + client reads, Q1–Q6 = PA recs" (S472), item 3
(body mode) and item 6 (Lane A before Lane B). Lane B (db cells as per-request server cells) is NOT built here.

## Governing sentences

- Ruling item 3: "The `<db>` body is code-default and ITEM-ONLY (declarations, `function`/`fn`, `type`, markup,
  `"…"` literals); a bare statement is refused (`E-DB-BODY-STATEMENT`), loose prose is `E-UNQUOTED-DISPLAY-TEXT`."
- SPEC §8.1.1: a `?{}` resolves to the closest ancestor database scope — a `<db src=>` is one.

## Done

- [x] parse.scrml — `finishDb` / `parseDbBody`: the `<db>` body is read as items. Markup and display literals stay
      in the element (render in place); `function`/`fn`/`type` items are read by the logic parser and HOISTED into
      the nearest item list (new MP fields `hoist`, `dbFns`; drained by `parseMarkupItems`). Declarations stay
      refused by name (`refuseDbDecl`, reworded: a server-authoritative cell, §52, not in the bootstrap). Statements
      (`${…}`, `<effect>`, `on mount`, a non-fn logic item, any run that parses as one statement) →
      E-DB-BODY-STATEMENT; prose → E-UNQUOTED-DISPLAY-TEXT, one report per run of consecutive prose lines, in source
      order. The old free-text path (`tag == "db" && dbDeclAt` in parseKids) is gone.
- [x] Tier-0 gather (`${ for … }` rows): `backToMarkup(m, t)`, so a hoist read inside a row is never dropped.
- [x] ast.scrml — `ADbFn` + `FileAst.dbFns`: which `<db>` each hoisted function was declared in.
- [x] analyze.scrml — dbsPass: a `<db>`-owned function takes THAT block's scope (dbsInElem), not the program's
      (dbsInItems skips it). A `<db>` with no `src=` registers no scope, so its functions' queries resolve to nothing
      (never an outer db; resolveDb's own refusal is the one report). A `<db>` taken over by a user declaration
      refuses a function in its body (E-BOOTSTRAP-UNSUPPORTED).
- [x] SPEC — §4 bullet (db exception), §4.18.1 table row + normative statements + S472 amendment note, §4.18.7,
      §66.2.5 cross-ref, §34 rows E-DB-BODY-STATEMENT (new) and E-UNQUOTED-DISPLAY-TEXT (db locus). SPEC-INDEX regen.
- [x] severity.scrml regenerated (adds E-DB-BODY-STATEMENT; also E-IMPORT-003/008/009, stale on main — were
      fail-closed Error already, same answer).
- [x] Tests: slice-m4/db-body-s472.test.js (33), parse-batch-s471 prose test updated, acceptance db-body/* (3).

- [x] known-gaps: `g-bootstrap-fn-in-db-body-ships-as-page-text-s472` filed + resolved; the s469 db/channel gap's
      "Open: the semantics" sentence now cites the S472 ruling (db: Lane A landed, Lane B owed).

## Verified

- Probe (two sibling-level dbs): `fa` (program's direct-child `<db src=a>`) queries a.db, `fb` (`<db src=b>` in
  `<main>`) queries b.db; client artifacts carry no SQL / connection string.
- Red-proof: with origin/main's ast/parse/analyze/severity in the tree, db-body-s472.test.js is 1 pass / 32 fail
  (the one pass is the control: prose inside a `<p>`); the PA probe verbatim compiles at exit 0 on main.
- Pre-commit hook (full, sharded): 50490 pass / 0 fail. CI `slices`: m1 100, m2 613, m1 lowered 100, m3 60,
  m4 2761 — 0 fail. e2e-render-map 259 / 0. `checks`: types-gate OK (unchanged), claim gate 0 fail, snippet gate
  0 fail, compile floor PASS, md shim current, bootstrap-conformance --check current (no movement), conflict
  markers 0, SPEC-INDEX --check OK, delta-lint PASS, ci-shards needs OK, s34-census --check-new PASS (2 rows).

## Round 1 (S239 review of 4d8a33f32: LAND-WITH-FOLLOWUPS — no leak, no wrong DB)

- Merged origin/main (7907231dc; SPEC-INDEX regenerated from the merged tree).
- **Function visibility — RULED S472** (user-voice-scrml.md "⭐ RULED — functions in a `<db>` body: visibility",
  *"your recs on <db> functions"*). A db-body function is a PROGRAM-LEVEL function, and its `?{}` binds to its
  declaring `<db>`. A name collision is E-SCOPE-010, which the review verified, W01/W04. A function in a `<db>` nested
  in an `<each>` row, a component's renders/body, an engine state child or a `<match>` arm is refused for now. This is
  what the bootstrap builds. The SPEC sentence lands with Lane B (§8.1.2); the §4.18.1 S472 note only points at the
  ruling.
- **MED-1.** Under that reading, a function in a `<db>` that stands inside a name-binding scope would lose those names,
  or bind the program's names of the same spelling. So it is refused by name there: E-BOOTSTRAP-UNSUPPORTED, from
  analyze.scrml `nameScopeHere` in resolveDb and `refuseStateChildDbFns` in phaseB. The scopes covered are:
  - an `<each>` row (rows);
  - a loop or arm binder (locals; a Tier-0 row);
  - a child field's renders (own);
  - a declaration's renders or state child (ctx not program);
  - a program-level engine's state child, including its `:`-shorthand body.

  Nesting under `<main>`, plain markup and another `<db>` is unchanged. This fails closed under either ruling.
- **LOW-2.** A user declaration named `db` still takes db-body mode. That is the fail-closed choice: the parser cannot
  know declarations, and a free-text guess would reopen the page-text leak for a real `<db>`. Filed
  `g-bootstrap-user-db-decl-takes-db-body-mode-s472`.
- **LOW-3.** Fixed:
  - an item head is judged by its shape (`dbItemHeadAt`: `function`/`fn` NAME `(`, `type` NAME `:`/`=`), so prose
    starting with `function` / `type` / `export` is prose;
  - `lift <p>…</p>;` is E-DB-BODY-STATEMENT;
  - a prose line is capped at its newline (an apostrophe no longer takes the file);
  - the suggested literal escapes `"` and `\`.

  Literal-recovery residue filed: `g-bootstrap-db-body-literal-recovery-s472`.
- **LOW-4.** The SPEC sentence now reads "No source text of a function, a type, a declaration or a statement written in
  a `<db>` body SHALL ship as page text; only markup elements (d) and display-text literals (e) render, as markup."
- **LOW-5.** Filed `g-pure-fn-sql-compiles-as-server-fn-s472` (MED).
- Tests: db-body-s472.test.js is now 44 tests. All 9 new ones are red on 4d8a33f32; the controls stay green.

## Not done / follow-ups

- Lane B (db cells as server cells) — not built (ruling item 6).
- The impl#1 §34 rows `W-STATE-BLOCK-BARE-WRITE-DECL` / `E-STATE-BLOCK-STATEMENT-FORM` still say "a state-block
  body is markup context" — accurate for impl#1 (frozen), now contradicted for `<db>` by §4 / §4.18.1. Not edited.
- A runaway display literal in a `<db>` body is not given the s471 runaway recovery (it is read closed, fails
  closed with a cascade); only the unterminated-to-EOF case gets E-CTX-001.

## S473 landing-front — 2026-10-28
- Merged origin/main (3a7d1d223) into origin/s472-boot-db-body-mode (c342ef178), branch land-s472-boot-db-body-mode.
- Conflicts: analyze.scrml / parse.scrml ast import lists (union: AConst from main + ADbFn from branch);
  severity.scrml (generated) regenerated via gen-bootstrap-severity.ts (210 codes = both sides' new rows);
  known-gaps.md auto-resolved by the merge driver, no @gap id lost (checked main ∪ branch ⊆ result); FACTS.md = origin/main.
- MERGE-FORCED: main's new AItemK.ConstItem made the branch's parse.scrml `fnIdOfItem` / `isTypeItem` matches
  non-exhaustive (E-TYPE-020 bundle build failure). Added `.ConstItem(c: c) :> -1` / `:> false` arms — a
  `const` item in a `<db>` body is therefore neither fn nor type (→ E-DB-BODY-STATEMENT if it reaches that path).
- docs/bootstrap-conformance.md regenerated (--write).
- Merge committed 0c45f95d8 (hook: 50644 pass / 0 fail, SCRML_HOOK_SHARDS=6 after a 1200s load timeout on the first try).
- CI checks-job gates run locally on the merged head: types-gate, compiler/tests/*.test.js, snippet-gate, claim-gate,
  corpus-compile-floor, md-shim, conflict-marker, spec-index, delta-lint, s34-census, bootstrap slice (lint + m1/m2/m1-lowered/m3/m4/codec),
  bootstrap-conformance --check — all PASS.
- PR probes (review probes in .tmp/db + a landing probe set): bare statements → E-DB-BODY-STATEMENT; prose → E-UNQUOTED-DISPLAY-TEXT;
  ?{} binds to declaring <db> (sibling, program-db, use-before); collisions → E-SCOPE-010; fn-in-db under each / renders / engine
  child / Tier-0 for → E-BOOTSTRAP-UNSUPPORTED; <match> arms refused upstream (no <match>/markup-lift-in-arm in the bootstrap); no page-text leak.

## S473 landing-front round 2 — 2026-10-28
- Merged origin/main again (gained #1619, bootstrap gate fail-opens). Textual conflict only in compiler/SPEC-INDEX.md
  (generated; resolved by `git-merge-generated.ts --regen`, `--check` OK). severity.scrml regenerated (main was stale for
  E-FORM-OWNER-UNRESOLVED). known-gaps: no id lost. FACTS.md = origin/main (auto). bootstrap-conformance.md regenerated.
- Semantic: the bootstrap bundle builds under impl#1 (no E-TYPE-020 from InstRef.Kid / InstRef.HandleOf / View.Reach);
  mountedInstances moved to core.scrml, no branch-side use.
