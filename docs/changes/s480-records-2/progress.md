# s480-records-2 — progress

Records only: review markers, gap markers in docs/known-gaps.md, SPEC wording. No compiler source.

- [x] Review markers: #1994 #1996 #1998 #1999 #2000 #2001 #2002 #2003 #2004 #2005 #2006 #2007 #2009 (review-debt 13 OWED → 0)
- [x] Gaps: 19 new (S480 ledger + S479 q-records2 leftovers), 1 duplicate resolved (g-impl1-dbvar-tag-mutates-shared-builtin-type-s479), 1 residue item added (g-boot-shared-graph-walk-residue-s480 item 6). Reproduced on b14387ac9: keywordless `${}` in nested markup, `path="/a\b"` mounts `/ab`.
- [x] SPEC wording: §4.15 endpoint locus, §7.6 (a) tool limb, §7.6 S479 provenance, §7.6 item-59 by-name list, §7.2.2 prose-`not` INTERIM row, §51.0.R rule 3 + onTransition
- [x] CI checks job (s34-census, types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim, conflict-marker, delta-lint) green; state.ts only gap-counts STALE (bot-owned)
- [ ] PR
