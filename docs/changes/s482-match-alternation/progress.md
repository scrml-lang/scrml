# s482-match-alternation — progress

Gap: g-boot-match-alternation-unbuilt-s482 (MED). SPEC §18.2 alternation `.A | .B :> r`.
Branch `s482-match-alternation` from origin/main ce6d500b0.

## Design (chosen)
- `APat.PAlt(alts)` (ast.scrml) — NOT a parse-time expansion: expansion would duplicate the body
  (its node ids, the analyze facts keyed by them, and its emitted JS) once per alternate, and type
  the body N times (N copies of every body diagnostic). One arm, one body, N cases.
- parse.scrml: parseArms re-reads an arm head as `parseAltHead` once a `|` + pattern follows the
  first pattern; `parseAlternate` reports E-MATCH-ALT-BINDING (one per arm, first offender) for a
  payload in parens other than positional `_`, a paren-free binder, `_ err`; the alternate is kept
  without binders and the arm body becomes a Recovered placeholder (no E-SCOPE-001 cascade).
  Literal / `not` patterns end at `|` as well as at the separator. A line break is whitespace.
- analyze.scrml: FArm(idx, alts) — idx -7 = alternation, `alts` per-alternate index; an alternation
  with a wildcard alternate is the wildcard arm (-1). Plain match: plainAltArm; failable/`!{}`:
  resolveAltArm/failAltIdx. Coverage / E-TYPE-023 per alternate. `.Ok` alternate on a failable
  `match`: E-BOOTSTRAP-UNSUPPORTED (INTERIM).
- core.scrml Pattern.PAlt(pats); print.scrml altTest = `||` of tests; lower plainAltPat / errArms.
- meta.scrml (compile-time evaluator), check.scrml C-E2, walk, measure: PAlt arms.

## Status
- [x] build + slice test green (31/31), red on base (30/31 before strictening)
- [x] commit af4eaa5ef (full hook PASS 57916/0)
- [x] conformance cases match-codes/{match-alternation-rt, e-match-alt-binding-pos, e-match-alt-binding-neg}:
      impl#1 corpus-bridge 3/3; bootstrap PASS (non-twin, runtime executed); base FAIL x3
- [x] host-global-scan --check 1/2, 2/2 exit 0
- [x] gap record resolved; new gap g-boot-match-alt-ok-alternate-s482; SPEC §18.2 / §34 status notes
- [x] commit 0b8059be4 (hook PASS)
- [x] bootstrap-conformance base 817 PASS / 3 FAIL / 0 CRASH -> head 820 / 3 / 0; only moves: the 3 new
      cases (absent -> PASS); no emitted-code change on any other case
- [x] bootstrap byte-compare (conformance/cases + examples + samples, 2962 shared .scrml): 0 artifact
      diffs, 0 newly rejected, 0 newly accepted, 0 error-code-set changes (the two corpus alternation
      sites — samples/compilation-tests/match-pipe-alternation.scrml, examples/14-mario-state-machine.scrml
      — fail earlier on legacy-dialect forms, unchanged)
- [x] self-host parse: alternation refusals 7 -> 0; front-end E-TYPE-020 13 -> 9 (the 4 lex.scrml
      alternation cascades gone; the 9 left are not alternation). E-PARSE-ARM +69 = the named-field
      patterns this lane's own new self-host code is written with (impl#1 dialect; +71 such patterns)
- [x] s34-census --check-new, types-gate --check, gen-bootstrap-severity --check, gen-md-shim --check,
      corpus-compile-floor --check, claim-gate, snippet-gate, host-global-scan 1/2 2/2: all pass
- [ ] push + PR
