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

## Not done / follow-ups

- Lane B (db cells as server cells) — not built (ruling item 6).
- The impl#1 §34 rows `W-STATE-BLOCK-BARE-WRITE-DECL` / `E-STATE-BLOCK-STATEMENT-FORM` still say "a state-block
  body is markup context" — accurate for impl#1 (frozen), now contradicted for `<db>` by §4 / §4.18.1. Not edited.
- A runaway display literal in a `<db>` body is not given the s471 runaway recovery (it is read closed, fails
  closed with a cascade); only the unterminated-to-EOF case gets E-CTX-001.
