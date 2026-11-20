# s480-trap-attr-hole — progress

Ruling: user-voice-scrml.md S480 "⭐ RULED — what a trap renders when "nothing" is not safe (#2008, item 20 follow-up)" (`ruling:user-voice-scrml.md-S480-trap-attr-hole`). Gap g-boot-mount-trap-attr-hole-unruled-s480.

- [x] runtime.js: `rt.attr` is an Effect hole; blank = remove the attribute + hold the ELEMENT out (placeholder comment, `holdElement`); recovery re-runs every attribute writer of the element, returns it only if none traps (`releaseElement`); no writes while held; `insert` cleanup removes a held element's placeholder / a restored element (`holeMate`).
- [x] Other attribute writers audited: `bind` (property), `visibility` (`show=`), `cssVar` already holes; `class:` not in the bootstrap; data `style` refused; `hostAttrValue` is an imperative host call (not a view effect) — unchanged.
- [x] #2008 tests that pinned INTERIM (top-level attr trap ends mount; row attr trap blanks the whole list; iframe-in-arm blanks the arm) updated to the ruled shape.
- [x] New tests: slice-m4/attr-hole-s480.test.js (19 red on base across both files).
- [x] SPEC §19.17: OPEN note replaced by two ruled bullets (item 1, item 2) with provenance.
- [x] known-gaps: gap resolved (marker + resolution note).
- [ ] final gates, byte-compare, conformance, PR.
