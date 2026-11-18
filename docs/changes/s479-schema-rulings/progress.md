# s479-schema-rulings — progress

Ruling: scrml-support/user-voice-scrml.md "⭐ RULED — the rest of S478 hand-off §3.B, PA recs adopted (S479, 2026-11-18)", items 3, 4, 15.

- [x] SPEC: §39.2 case paragraph, §39.4 bullet, §38.5.1 E-SCHEMA-018 bullet, §39.7 sentence, §39.12 + §34 E-SCHEMA-018 rows, §4.15 / §24.4 / §34 `db` reserved.
- [x] item 3 — schema.scrml readColumn: lowercase type + constraint words; tests (schema-s479.test.js; two s478 pins flipped).
- [x] item 4 — E-SCHEMA-018 replaces the by-name refusals (readColumn, readTable, readDdlCol, readDdl); severity.scrml regenerated. Raw-DDL composite `PRIMARY KEY (a, b)` already read — no residue.
- [x] item 15 — analyze.scrml reservedElementName += db; resolveElem routes `<db>` before decl lookup; isDbElem drops the decl check; INTERIM refusal removed.
- [x] conformance cases: schema/schema-type-case-pos, schema/schema-018-second-pk-neg (xfail impl#1), schema/schema-018-composite-key-pos, components/name-collides-reserved-db-neg (xfail impl#1).
- [x] known-gaps: 3 resolved, 2 carried impl#1 gaps added.
- [x] corpus: 480 candidate files (mention `db` or `<schema`), old vs new bootstrap: identical (0 newly-rejecting, 0 newly-accepting).
- [ ] commit (hook), CI gates, conformance after, comp.sh, PR.

Base measurements: ~/.cache/scrml/review/s479-schema-rulings/{conf-base.json,corpus-base.json,corpus-head.json}.
