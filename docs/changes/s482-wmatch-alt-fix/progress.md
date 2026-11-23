# s482-wmatch-alt-fix — progress

Lane: remove the false W-MATCH-001 that #2075 (s482-alt-followups, INFO-1) introduced on legal
wildcard alternations in a plain `match` (#2075 review LOW-1).

- [x] analyze.scrml `plainMatch`: duplicate check (E-TYPE-023) on its own sets (`dCov`/`dNot`/`dLits`);
      a wildcard alternation's named alternates no longer enter `covered`/`notSeen`/`lits`, so the
      W-MATCH-001 reachability judgment is as before #2075 (and consistent with the failable path,
      which keeps them out of `coveredBefore`).
- [x] tests: alt-followups-s482.test.js "LOW-1 (wmatch-alt-fix)" — red on base fd07efcd8 (2 tests), green on head.
- [x] rebased onto origin/main fd07efcd8 (#2075 merged); fix commit fd64187f6 (hook: 58013 pass, 0 fail).
- [x] final gates on head: pretest; bootstrap-conformance --json base vs head identical (PASS 845, FAIL 4,
      CRASH 0; 0 per-case diffs); byte-compare + warnings over 2965 corpus files: 0 diffs (no corpus program
      has the false shape); alt-followups-s482 + match-alternation-s482: 48 pass; s34-census --check-new,
      types-gate --check, snippet-gate, claim-gate, corpus-compile-floor --check, gen-md-shim --check: PASS.
- [ ] push + PR.
