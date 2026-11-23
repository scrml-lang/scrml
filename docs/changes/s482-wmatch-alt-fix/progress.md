# s482-wmatch-alt-fix — progress

Lane: remove the false W-MATCH-001 that #2075 (s482-alt-followups, INFO-1) introduced on legal
wildcard alternations in a plain `match` (#2075 review LOW-1).

- [x] analyze.scrml `plainMatch`: duplicate check (E-TYPE-023) on its own sets (`dCov`/`dNot`/`dLits`);
      a wildcard alternation's named alternates no longer enter `covered`/`notSeen`/`lits`, so the
      W-MATCH-001 reachability judgment is as before #2075 (and consistent with the failable path,
      which keeps them out of `coveredBefore`).
- [x] tests: alt-followups-s482.test.js "LOW-1 (wmatch-alt-fix)" — red on base (2 tests), green on head.
- [ ] rebase onto origin/main once #2075 lands; final gates; PR.
