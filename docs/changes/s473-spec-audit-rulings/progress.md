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
- [ ] bootstrap-spec-coverage.md row changes — #1673 not on main; listed below for a follow-up

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
E-ASSIGN-POSITION (D10), E-DECL-SLOT-MISSING / E-DECL-SLOT-MULTIPLE / E-DECL-SLOT-OUTSIDE-RENDERS (D11),
I-TAILWIND-NOT-BUILT (D13), E-FIXED-RETIRED (D26), E-SQL-SLOT-IN-LITERAL (D31/S468).
Retired: E-TYPE-012 (D17), E-TYPE-026 (D19), E-REACTIVE-004 (D22).
Code names for D11 / D13 / D26 are PA readings for bryan's veto.

## Flags (ambiguous — not decided)
- D7: the ruling's parenthetical puts "`authority=` server cells" under Tier 2 (retired); decisions.md D7 (a) keeps Tier 1 type-level authority owed. §52.3 left as written; flagged in §52's amendment.
- D15: whether legacy `export { count }` stays E-EXPORT-001 — left as written (minimal reading). decisions.md says "re-pin conformance case `e-export-001-*`"; NOT done (case `conformance/cases/module/e-export-001-export-state-cell-reject` is the legacy form and still holds under the minimal reading).
- D31 §6.5.3 (`key=` on lifted element) vs §17.4b (header `key`): "needs one canonical form" is a semantics choice; not made.
- D31 §14.12: already carries an S435 supersession marker; nothing added.

## Follow-ups outside this lane (no SPEC text)
- D29 bootstrap re-codes: E-AUTH-001, E-STATE-UNDECLARED, E-TYPE-043, E-FN-004 (compiler work).
- D30: fix the module conformance cases' semicolons (case edits — not done here); grader change in scripts/bootstrap-conformance.ts.
- D19: build E-ATTR-UNQUOTED-OPERATOR in the bootstrap.
- D31: bootstrap emits E-SQL-SLOT-IN-LITERAL and E-PARAM-TYPE-REQUIRED instead of E-BOOTSTRAP-UNSUPPORTED.

## Conformance cases whose expected code may change (not edited)
- D18: none found expecting E-TYPE-042 (it was retired S305).
- D29: cases expecting E-SYNTAX-042 / E-EQ-004 are met by the bootstrap's E-PARSE-NO-NULL / E-PARSE-STRICT-EQ only if the grader treats the parser spelling as the same rule; under D30 strict grading they would FAIL. Not decided here.

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
