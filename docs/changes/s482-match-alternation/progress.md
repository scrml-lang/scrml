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
- [ ] final gates, byte-compare, corpus differential, self-host counts, PR
