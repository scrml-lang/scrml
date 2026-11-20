# s480-trap-attr-hole — progress

Ruling: user-voice-scrml.md S480 "⭐ RULED — what a trap renders when "nothing" is not safe (#2008, item 20 follow-up)" (`ruling:user-voice-scrml.md-S480-trap-attr-hole`). Gap g-boot-mount-trap-attr-hole-unruled-s480.

- [x] runtime.js: `rt.attr` is an Effect hole; blank = remove the attribute + hold the ELEMENT out (placeholder comment, `holdElement`); recovery re-runs every attribute writer of the element, returns it only if none traps (`releaseElement`); no writes while held; `insert` cleanup removes a held element's placeholder / a restored element (`holeMate`).
- [x] Other attribute writers audited: `bind` (property), `visibility` (`show=`), `cssVar` already holes; `class:` not in the bootstrap; data `style` refused; `hostAttrValue` is an imperative host call (not a view effect) — unchanged.
- [x] #2008 tests that pinned INTERIM (top-level attr trap ends mount; row attr trap blanks the whole list; iframe-in-arm blanks the arm) updated to the ruled shape.
- [x] New tests: slice-m4/attr-hole-s480.test.js (19 red on base across both files).
- [x] SPEC §19.17: OPEN note replaced by two ruled bullets (item 1, item 2) with provenance.
- [x] known-gaps: gap resolved (marker + resolution note).
- [ ] final gates, byte-compare, conformance, PR.

## r1 fix round (review of #2017, head 9ba5b9c7c)
- [x] F1: the blank holds the element only — no `removeAttribute` (a removed `referrerpolicy`/`crossorigin` on a live img is a refetch).
- [x] F2: writers only EVALUATE; `commitElement` writes once every writer of the element queued in the flush has run and none traps — nothing written to a held element, ever; no `restoring` re-run loop.
- [x] F3: no writer runs inside another's run any more, so a non-trap throw stays with the writer that threw.
- [x] SPEC §19.17: sentence on "evaluated before any is written / nothing written or removed while out" added; the "never in the page with a stale or absent value" sentence holds.
- [x] Tests: r1 F1/F2/F3 unit + F1/F2 compiled (6 red on 9ba5b9c7c incl. the updated "nothing is written" unit test).
