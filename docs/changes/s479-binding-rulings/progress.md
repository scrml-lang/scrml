# s479-binding-rulings — progress

## A — g-boot-kw-unread-must-use-s478 (ruling: user-voice "⭐ RULED — S478 hand-off §3.A and §3.B", §3.B; upholds S422 Call 3)
- [x] analyze.scrml `withKwUnread` (INTERIM E-BOOTSTRAP-UNSUPPORTED naming E-MU-001) removed; `NsAt` sym/name/end fields dropped.
- [x] slice-m4/scope-builtins-s478.test.js: MED-2 test now asserts keywordless == `const` (no error, no E-MU-001).
- [x] conformance linear/must-use-unread-{pos,neg} re-pinned: no E-MU-001, no error; pos xfail on impl#1 (carried gap g-impl1-e-mu-001-unread-binding-s479).
- [ ] STOPPED: the unused-binding lint itself — the SPEC names no W- code. Filed g-spec-unused-binding-lint-code-s479 with rec (W-BINDING-UNUSED).

## B — g-boot-match-duplicate-binder-s478 (ruling: S478 open-Qs item 14)
- PA redirect mid-lane: use E-SCOPE-REDECLARE (§7.3.3), widened — not a minted code.
- [x] SPEC §7.3.3 bullet, §18.7 bullet, §18.15 row, §34 row widened (emitter note).
- [x] parse.scrml `patBinds` (match / !{}) + `parseArmBinds` (<match>) report E-SCOPE-REDECLARE at the repeated binder; `_` exempt.
- [x] cases match-codes/e-scope-redeclare-arm-binder-{value-pos,element-pos,neg}; pos cases xfail on impl#1 (E-CODEGEN-INVALID-LOGIC; carried gap g-impl1-arm-binder-redeclare-s479).
- [x] slice-m4/arm-binder-redeclare-s479.test.js.

## Measurements
- scratch: ~/.cache/scrml/review/s479-binding-rulings/
- bootstrap conformance: PASS 645 -> 649, FAIL 12 -> 12, UNSUPPORTED 576 -> 575, CRASH 0; 0 PASS->FAIL.
- corpus (samples/ examples/ conformance/ acceptance, 3152 base files): 0 existing files change verdict
  besides linear/must-use-unread-pos (E-BOOTSTRAP-UNSUPPORTED -> clean). Newly-rejecting: 0 existing files.
- commit 1 hook: PASS (56205 pass, 0 fail) after two load-timeout runs (load avg 28, other lanes).
- host-global-scan: the two new -pos cases pinned in scripts/host-global-scan.known-throws.txt.

## Fix round r1 (S239 review of #1961)
- [x] MED-1: a keywordless `x = …` inside a function (any scope that does not see a body-top run's locals)
  where `x` is the FILE-SCOPE keywordless binding is now a write to it (E-ASSIGN-004 after the re-read),
  not a second declaration of a dead local. analyze.scrml `keywordlessName` + `fileKwDeclAt` (the first
  `x = …` at the top of a body-top run is the declaration; §50.8.5, §7.6). Local / loop / nested-fn /
  handler / arrow variants: keywordless == `const` (slice-m4/keywordless-outer-write-s479.test.js; 6 red on base).
- [x] LOW-1: E-SCOPE-REDECLARE message names a qualified pattern as written (`E.Bad(…)`, `Pair.Loaded(…)`,
  `E::V(…)`); parse.scrml `patBinds` takes the written separator.
- Residue (pre-existing on base and head, fails closed): `${ count = 0; function … }` inside a NESTED element
  (`<div>${ … }</div>`) parses as an interpolation (E-PARSE-EXPECTED …) while the `const` spelling parses.
- conformance base (d78500135) vs r1: identical (PASS 649, FAIL 12, UNSUPPORTED 575, CRASH 0; 0 verdict changes).
