# s483-q8-fu2 — progress

Source: #2133 review (~/.cache/scrml/review/s483-2133/review.md). Branch s483-q8-fu2 off origin/main 3428efda9 (contains #2133).

- [x] item 1 MED-1 analyze.scrml: replaceAllTrapWhat / replaceAllFits / litLenOf (replaceAll a site unless receiver + replacement are literals proven to fit)
- [x] item 1 MED-1 print.scrml: primTraps StrReplaceAll → replaceAllFitsCore mirror
- [x] item 1 audit: runtime.js requireFits callers = strRepeat, fillTo (padStart / padEnd), strReplaceAll (×2); no other ScrmlTrap from a length-producing helper
- [x] item 2 LOW-1 numberOnly: `.Partial` → false (g01 / g02 refused; base accepted)
- [x] item 3 `%`: a site only when neither operand is proven `number` (q19 / x01 / f09 accepted); message names the `int` result
- [x] item 5 trapShown: a string literal is shown quoted, cut at 16 units
- [x] SPEC §7.6 rule (b) site list (replaceAll), `%` clause (both operands), §34 row, provenance q8-fu2 (corpus measured)
- [x] gap note in g-boot-trapping-construct-init-s482 (concat / template / join / replace / case change: host RangeError, outside the trap-site model; owner question)
- [x] slice-m4 trapping-construct-init-s483.test.js: 86 pass (q8-fu2 describes added; the q8-fu `7.0 % (n - 2)` refusal test flipped to accepted)
- [x] conformance body-top: 3 new cases (2 neg, impl#1 xfail g-impl1-init-in-construct-s482; 1 pos) — impl#1 runAll body-top 32 pass / 18 xfail / 0 fail / 0 xpass
- [x] bootstrap-conformance --json: CRASH 0/0; PASS 875 → 878; FAIL 3 = 3; only the 3 new cases differ
- [x] corpus differential (3001 files): 0 crash, 0 newly rejected/accepted, 0 diag/msg diffs, 0 byte diffs over 331 both-ok
- [x] Chromium s482/s483 (15 files): 105 pass / 0 fail (3 new q8-fu2 tests)
- [x] commit 1 hook: 58800 pass / 0 fail
- [x] commit 2 hook: 58800 pass / 0 fail
- [x] host-global-scan --check mode-shard 1/2 and 2/2: exit 0, 0 violations; throws all pinned (none from the new cases)
- [x] slice-m4 set (28 s482/s483 files: every E-FILE-SCOPE-INIT-IN-CONSTRUCT / runBootstrapArtifact test): 735 pass / 12 skip / 0 fail
- [ ] PR

Finding: w01 is NOT a Partial divisor — the typer joins `y : u()` (number / int) to Known(number), so under item 3's rule (`int % number` is a `number`, no trap) it is accepted on head as on base; true Partial divisors (g01 / g02, `v(2)` a recursive fn) are refused on head, accepted on base.
