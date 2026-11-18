# s479-records — progress (crash-recovery anchor)

Lane brief: S479 records lane (§3.B items 12/14/18/19/22/23/26; #1963 follow-up item 2; PA-cleanup; review-LOW gaps).

- [x] A item 12 — SPEC §13.9.1 rule 4 / §66.11.6 item 3 / §66.9 rule 3 markers; gap g-spec-derived-lifecycle-refusal-unnamed-s479 (bootstrap double report measured)
- [x] A item 14 — §66.15.2 O9 RULED text; gaps g-boot-named-and-per-row-slot-unbuilt-s479 (new), g-boot-named-slot-shapes-not-refused-s473 (narrowed note), g-slot-per-row-scoped-unbuilt-s474 (note)
- [x] A item 18 — g-lift-gate-reads-plain-let-written-later-s469 resolved (§7.4.2)
- [x] A item 23 — §8.1.3 "A failed load" + §52.6.8 note; runtime loadFailedView built; test red on base; residue g-bootstrap-db-cell-load-failure-override-slot-s479
- [x] A item 26 — g-state-undeclared-over-fires… carried + acceptance plan
- [x] A #1963 item 2 — §8.1.2 bullet + §8 table row reworded
- [x] C eq-oneof resolved (built S475, re-measured); veto markers (5 §34 rows + 4 prose); m.card already resolved (no-op); E-PA-004 fires on impl#1 → resolved + orm-trap sentence fixed; SqlError fail-site carried
- [x] B item 19 — s34 census code-shaped string occurrences (5 tests red on base; --check-all stale count 2 → 2)
- [x] B item 22 — url(#ident) (browser check: Chromium 152, 0 fetches under static <base> on another origin, control url(x.svg#g) fetched; opt-in test url-fragment-chromium-s479; runtime cssAttrValue; 12 tests red on base)
- [x] D new gaps (#1962 LOWs ×4, #1957 LOW-2, body-top let after type alias — reproduced with corrected shape; + hook flake g-impl1-dbvar-tag-mutates-shared-builtin-type-s479, bisected to endpoint-415-strict-keys-served + snippet-slot)
- [ ] CI gates + comp.sh + PR

Hook note: commit 1 needed SCRML_HOOK_SHARDS=12 — the default/4/6 plans put endpoint-415-strict-keys-served.test.js and snippet-slot.test.js in one process (deterministic failure, pre-existing on main).
