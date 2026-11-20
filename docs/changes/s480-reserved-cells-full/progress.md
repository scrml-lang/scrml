# s480-reserved-cells-full — progress

Ruling: user-voice-scrml.md "⭐ RULED — stored driver text, reserved names on program cells (S480)"
(`ruling:user-voice-scrml.md-S480-driver-text-reserved-cells`).

- [x] item 1 (ruling item 2): programFields uses `reservedElementName` (the userDeclStub list); `reservedCellName` removed.
      parse.scrml `isThemeOpener` skips a declaration opener (as `page` does), so `let <theme:int=1/>` gets the code.
- [x] item 2 (ruling item 1): SPEC §19.9.1 "Stored driver text is the author's data (S480)"; gap resolved.
- [x] census base 0f6637ac4 vs head: 0/1015 newly rejected (raw); 7 grep candidates twin-compiled: 0 newly rejected.
- [x] conformance base vs head: one PASS→FAIL (lifecycle/effect-writes-state-direct-pos twin) → case renamed `page`→`pageNo`.
- [x] tests: reserved-cells-full-s480 (18 red on base); migrated page cells in reset-on/effect/persist/request-surface/page-s476/failclosed tests.
- [ ] final gates, PR
