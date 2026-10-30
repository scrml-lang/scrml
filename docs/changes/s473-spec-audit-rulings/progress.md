# s473-spec-audit-rulings — progress

Lane: SPEC amendments for the S473 coverage-audit rulings D4–D31
(user-voice-scrml.md "⭐ RULED — S473 SPEC-coverage audit decisions D1–D34", "your recs on all").
Branch: s473-spec-audit-rulings (from origin/main 3d8a05cf1). SPEC text only (+ regenerated SPEC-INDEX, severity.scrml).

## Status
- [x] D4 §47 annex + §14.4.1 toEnum (in-place "impl#1 annex" marking, not a physical move — keeps every §47.1.x cross-ref valid)
- [x] D5–D13 scope rulings
- [x] D14–D27 contradictions
- [x] D29–D30 diagnostics / conformance (SPEC halves only)
- [x] D31 record-lag sweep (except §6.5.3 vs §17.4b — see Flags)
- [x] regen SPEC-INDEX + severity; s34-census --check-new, delta-lint, SPEC-INDEX --check pass
- [x] merged origin/main after #1673 landed; bootstrap-spec-coverage.md: 65 rows annotated with their S473 ruling, statuses flipped as listed below (§47.1–§47.5 → N/A etc.); `spec-coverage-check.ts --write` totals refreshed; check passes (76 SILENT, all gapped; was 91)
- [x] known-gaps.md: resolved g-boot-output-name-encoding-unbuilt-s473, g-spec-toenum-lookup-table-output-form-s473 (D4), g-boot-component-shape-constraints-unchecked-s473 (D25), g-boot-verbose-closers-absent-s473 (D31); deferred g-boot-emit-machine-tests-absent-s473 (D8), g-spec-54-substates-no-s66-spelling-s473 (D9); gap-counts regenerated (state.ts; master-list.md change discarded)

## Sections changed, per ruling
- D4: §47 intro + banner; §47.1–§47.5 markers; §47.5 test-bind cross-ref; §19.12.6 / §19.12.7 re-keyed (server-fn identity); §6.14.5 O-061-3; §58.7 note; §14.4.3 toEnum table SHALL demoted; §5 bind:value enum note.
- D5: §63.5 amendment (named refusal + replacement hint is conformant for the ruled dialect).
- D6: §66.3 O31 + O33 RULED (canonical empty; `single` enum → first variant + W-ENGINE-INITIAL-MISSING; bootstrap interim compile-time refusal E-BOOTSTRAP-UNSUPPORTED); §66.22 rows.
- D7: §52 head amendment; §52.4 RETIRED banner; §52.14 sentence struck.
- D8: §51.1 amendment; markers on §51.2, §51.9, §51.11, §51.12, §51.13, §51.14, §14.4.0.
- D9: §54 SUPERSEDED-PENDING / BANKED banner.
- D10: §50 amendment + §50.1; §50.11 table (W-ASSIGN-001 superseded, E-ASSIGN-POSITION row); §34 rows.
- D11: §66.15.2 slot multiplicity (three errors).
- D12: §66.6.8 O51 interim (refuse both); §66.22 row.
- D13: §26.2 amendment (one Info diagnostic).
- D14: §7.6 statement; §7.3.3 bullet; §7.6.1 bullet.
- D15: §21.2 amendment; §34 E-EXPORT-001 row.
- D16: §3.1 row struck; §9.2 struck.
- D17: §10.4 bullet struck; §34 E-TYPE-012 retired.
- D18: §42.3.2 sentence; §42.6 E-TYPE-042 row.
- D19: §18.9 table + amendment + statement; §18 code table; §34 E-TYPE-026 retired; E-ATTR-UNQUOTED-OPERATOR row note (bootstrap owes it).
- D20: §65.2 flatness scoped to component scopes.
- D21: §19.11.2 rewritten (handled form); §19.11.3 statements.
- D22: §6.6.5 amendment, old text struck; E-REACTIVE-004 retired (§6.6 table + §34).
- D23: §6.5.12 amendment + statements superseded.
- D24: §19.9.6 scope note.
- D25: §15.4, §24.3 RETIRED banners.
- D26: §15.7 RETIRED banner; §66.15.1 `fixed` row; §34 E-FIXED-RETIRED row.
- D27: §41.17 last statement amended.
- D29: §34.2 E-PARSE-NO-NULL / E-PARSE-STRICT-EQ rows point at E-SYNTAX-042 / E-EQ-004; §42.6 + §45.7 rows added.
- D30: §62.2 grading paragraph.
- D31: §14.4.1 E.parse; §52.6.8 banner; §13.9 status; §14.8.9 / §14.8.10 "Implemented in impl#1"; §2.4 SAB/Atomics restated (S440 R7); §8.1.1 mongo struck; §9.3 stale banner; §4.5 retired; markers §14.9, §5.4.1, §5.5.5; O54 RULED (§66.6.3, §66.22, inline markers); §66.12.8 index read built; §66.20 — 16 rows corrected to "emitted by the bootstrap", 3 (W-GRANT-REDUNDANT, E-FOREIGN-REPLACE-PRIVATE, E-CELL-NO-RENDER-SPEC) to "the bootstrap does not emit it either"; §55 header, §55.17 banner, four §55.15 rows; §8.1 E-SQL-SLOT-IN-LITERAL sentence + §34 row (S468); §7.5 / §34 E-PARAM-TYPE-REQUIRED re-code recorded with gap.

## New §34 rows
E-ASSIGN-POSITION (D10), E-DECL-SLOT-OUTSIDE-RENDERS (D11; rules 1–2 reuse E-COMPONENT-021 / -020),
I-TAILWIND-NOT-BUILT (D13), E-FIXED-RETIRED (D26), E-SQL-SLOT-IN-LITERAL (D31/S468).
Retired: E-TYPE-012 (D17), E-TYPE-026 (D19), E-REACTIVE-004 (D22).
Code names for D11 / D13 / D26 are PA readings for bryan's veto.

## Flags — status
- D7: RESOLVED — Tier 1 `authority=` / `protect=` stay owed and refused (decisions.md D7 (a)); the user-voice D7 parenthetical was a PA summary error, corrected in user-voice (cited in §52's amendment).
- D15: the legacy `export { count }` stays E-EXPORT-001 (minimal reading, left as written); the §66 `export let <x/>` is not E-EXPORT-001. The owed re-pin is a clean §66 twin case (follow-up below); the legacy case `conformance/cases/module/e-export-001-export-state-cell-reject` still holds.
- D31 key form: RULED (review-surfaced 5) — the loop-header `key` (§17.4b) is canonical; §6.5.3 `key=` is legacy (bootstrap refusal with a hint owed); W-KEY-001 takes the header meaning; its duplicate-`key=` meaning is impl#1's carried divergence.
- D31 §14.12: already carries an S435 supersession marker; nothing added.
- Open for bryan (raised by the PA): ruling-1 read-then-write snapshot consistency (reads are not rolled back; one SELECT + one UPDATE no longer gets the envelope).

## Review round 1 (#1682 FIX-FIRST) — done
(Round 2, re-review r1: §50.2.1 / §50.4.1 / §50.4.2 marked; §8.9 head + §8.9.2 bold trigger marked superseded; "or a write in a loop" moved to the bootstrap interim only; §20.3 reach = written in the block or in a function it calls (impl#1 refuses only the written case — g-impl1-navigate-via-peer-inside-transaction-not-refused-s473); E-TRANSACTION-CONTROL-FLOW says THREE limbs, navigate a refused navigation; W-KEY-001 duplicate meaning = impl#1 carried divergence; key gap retitled; §16 code table extended to `<slot/>`; D7 cites the user-voice correction; direction-of-change note on writes vs queries with the PA flag.)
- D10: §50.1 restated; §50.2.3, §50.3.2, §50.8.1, §50.8.3, §50.9 bullets struck/marked; §50.10.2 / §50.10.3 / §50.10.4 flipped to Invalid (E-ASSIGN-POSITION); E-ASSIGN-002 rows marked unreachable.
- D14: limited to function-body LOCALS; "impl#1 already refuses it" removed (false).
- D7: Tier 1 `authority=` / `protect=` stated as OWED AND REFUSED (decisions.md D7 (a)); the "not decided" flag dropped.
- D11: rules 1–2 reuse E-COMPONENT-021 / E-COMPONENT-020 (rows extended); E-DECL-SLOT-MISSING / -MULTIPLE removed; E-DECL-SLOT-OUTSIDE-RENDERS kept, flagged.
- §6.5.3 / §17.4b "canonical key pending a ruling" markers + W-KEY-001's two meanings; gap g-spec-key-canonical-form-s473 filed.
- §62.2: a §34.2 parser spelling counts as the expected code (PA reading, D29).
- §58.12 bullet annotated (D4); two "`fixed` carries over" record lines annotated (D26); the `flush()` example marked retired — a call is E-SCOPE-001 on the bootstrap (probed), flagged for a D28 named refusal.
- g-impl1-sql-slot-inside-quoted-literal-dropped-s468 filed verbatim from S468 item 3.
- D23 owed-case note flags the handler that awaits a server call partway; D13 "once per compile" flagged as a PA reading.

## Review-surfaced rulings (user-voice "⭐ RULED — S473 review-surfaced decisions, all PA recs", scrml-support f648b65) — done
1. §8.9.2 + §19.10.5: implicit-envelope trigger = TRANSITIVE write set; interim bootstrap refusal (E-BOOTSTRAP-UNSUPPORTED).
2. §8.9.2 + §14.8.10 allow-list: `PRAGMA journal_mode = OFF` reaching a `!` connection → E-SQL-JOURNAL-OFF (new; name is a PA reading).
3. §66.6.6: element-named program cell colliding with a tag use → E-DECL-ELEMENT-NAME-COLLIDES at the declaration (new; reading).
4. §20.3 + §19.10.3: `navigate()` inside `transaction {}` → E-TRANSACTION-CONTROL-FLOW (reused existing code — reconciled with impl#1 lane #1679; PA reading).
5. §6.5.3 / §17.4b: loop-header `key` canonical; `key=` legacy (bootstrap refuses with a hint, owed); W-KEY-001 takes the header meaning. The "pending" markers are replaced; g-spec-key-canonical-form-s473 marked RULED (bootstrap refusal still owed).

## Follow-ups outside this lane (no SPEC text)
- Bootstrap: build E-SQL-JOURNAL-OFF, E-DECL-ELEMENT-NAME-COLLIDES, the transitive-write-set refusal, and the legacy `key=` refusal with a hint.
- D15: the owed re-pin — a clean §66 twin conformance case (`export let <x/>`, E-EXPORT-001 absent).
- D29 bootstrap re-codes: E-AUTH-001, E-STATE-UNDECLARED, E-TYPE-043, E-FN-004 (compiler work).
- D30: fix the module conformance cases' semicolons (case edits — not done here); grader change in scripts/bootstrap-conformance.ts.
- D19: build E-ATTR-UNQUOTED-OPERATOR in the bootstrap.
- D31: bootstrap emits E-SQL-SLOT-IN-LITERAL and E-PARAM-TYPE-REQUIRED instead of E-BOOTSTRAP-UNSUPPORTED.

## Conformance cases whose expected code may change (not edited)
- D18: none found expecting E-TYPE-042 (it was retired S305).
- D29/D30: DECIDED in review round 1 — §62.2 now says a §34.2 parser spelling counts as the expected code (PA reading, D29 "one code per rule"), so cases expecting E-SYNTAX-042 / E-EQ-004 are met by E-PARSE-NO-NULL / E-PARSE-STRICT-EQ. No case edited.
- D10: no case edited; cases relying on chained / value-position assignment would now expect E-ASSIGN-POSITION (none located in this lane — the grader change is a follow-up).

## docs/bootstrap-spec-coverage.md row changes (apply once #1673 lands)
- §47.1.1a, §47.1.2, §47.1.3, §47.1.4, §47.1.5, §47.3, §47.4 (.1–.3), §47.5 (name-encoding half): SILENT-ABSENT → N/A (impl#1 annex, D4). §47.1.6 and §47.2: REFUSED-LOUD → N/A (annex, D4). §47.1.1b and §47.6 unchanged (normative).
- §14.4.1 / §14.4.3 toEnum table output form → N/A (D4).
- §4.5 verbose closers: SILENT-ABSENT → N/A (retired, D31). §9.3: → N/A (stale, D31).
- §14.4.0, §51.2, §51.9: → N/A (dropped, D8). §51.11, §51.13, §51.14: → N/A (banked, D8). §51.12: → points at §51.0.M (D8).
- §54: → N/A (banked, D9). §52.4 Tier 2: → N/A (retired, D7).
- §15.4 / §24.3 shape inheritance, §15.7 `fixed`: → N/A (retired, D25/D26); `fixed` row now needs E-FIXED-RETIRED (gap stays).
- §6.6.5 flush(): → N/A (retired, D22). §3.1 / §9.2 `<style>`: → N/A (struck, D16).
- §2.4: DEFERRED-RULED → N/A (restated non-normative).
- Gaps resolved by a ruling: g-boot-output-name-encoding-unbuilt-s473 and g-spec-toenum-lookup-table-output-form-s473 (D4); g-boot-component-shape-constraints-unchecked-s473 (D25, superseded); g-boot-verbose-closers-absent-s473 (D31); g-spec-2-4-and-43-5-1-restatements-owed (§2.4 half only; §43.5.1 half still owed).
