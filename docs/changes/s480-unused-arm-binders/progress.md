# s480-unused-arm-binders — progress

Lane: S480 ruling `ruling:user-voice-scrml.md-S480-unused-binding-six` (user-voice "⭐ RULED — six
W-UNUSED-BINDING population/reading questions (#2004), PA recs adopted (S480, 2026-11-19)").

- [x] analyze.scrml: LocDecl.arm; addArmLoc in bindArm / bindArmTyped / bindWhole (every `match` /
      `!{}` / `<match>` arm binder); unusedBindings gives arm binders their own message (the `_` fix)
- [x] slice-m4/unused-binding-s480.test.js: arm-binder describe; the old "arm binder not reported" test removed
- [x] SPEC §7.3.5: lane-reading paragraph converted to ruled text; `<each>` / nested `function` stay a lane reading;
      §34 row matched
- [x] known-gaps: g-boot-unused-binding-self-write-read-interim-s480 (LOW, open) — item 4 INTERIM
- [x] conformance fn/unused-binding-arm-{pos,neg}
- [x] slice fixtures that now warn incidentally: 9 slice-m4 tests use slice-m2/no-unused-lint.js; acceptance
      cases match/payload-bind, security/failable-fails, grants/enum-payload-ungranted-accepted,
      request/body-client-wrapper rename the unread binder to `_`; server-artifact.test.js SQL-slot fixture `_`
- [x] corpus (bootstrap single-file front end, 5256 files, 646 clean): 22 arm hits / 19 files, all hand-checked
      genuinely unread (16 are `.Transport(t) :> return`); conformance: 28 cases newly carry the warning
      (unexpected Warning, still PASS), all genuinely unread
- [ ] full gate set on final head
