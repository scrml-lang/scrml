# s483-q8-fu2 — progress

Source: #2133 review (~/.cache/scrml/review/s483-2133/review.md). Branch s483-q8-fu2 off origin/main 3428efda9 (contains #2133).

- [x] item 1 MED-1 analyze.scrml: replaceAllTrapWhat / replaceAllFits / litLenOf (replaceAll a site unless receiver + replacement are literals proven to fit)
- [x] item 1 MED-1 print.scrml: primTraps StrReplaceAll → replaceAllFitsCore mirror
- [x] item 1 audit: runtime.js requireFits callers = strRepeat, fillTo (padStart / padEnd), strReplaceAll (×2); no other ScrmlTrap from a length-producing helper
- [x] item 2 LOW-1 numberOnly: `.Partial` → false (g01 / g02 refused; base accepted)
- [x] item 3 `%`: a site only when neither operand is proven `number` (q19 / x01 / f09 accepted); message names the `int` result
- [x] item 5 trapShown: a string literal is shown quoted, cut at 16 units
- [ ] SPEC §7.6 rule (b) site list + `%` sentence
- [ ] gap note (concat / template / join / replace host RangeError)
- [ ] tests (slice-m4, conformance, Chromium)
- [ ] gates
- [ ] PR

Finding: w01 is NOT a Partial divisor — the typer joins `y : u()` (number / int) to Known(number), so under item 3's rule (`int % number` is a `number`, no trap) it is accepted on head as on base; true Partial divisors (g01 / g02, `v(2)` a recursive fn) are refused on head, accepted on base.
