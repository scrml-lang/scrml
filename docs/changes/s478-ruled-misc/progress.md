# s478-ruled-misc — progress (crash-recovery anchor)

Lane: user-voice S478 open-Qs ruling items 23–32, 55–56 (57 noted), 58, 59, 61, 62.
Worktree: .claude/worktrees/s478-ruled-misc (base origin/main b04fdc27a).
Base conformance: PASS 614 / FAIL 18 / UNSUPPORTED 601 / NOT-TWINNED 635 / CRASH 0.

## Items
- [x] 23 print-asis-arg
- [x] 24 print in pure fn
- [x] 25 refinement/base-type-reject-rt rewrite
- [x] 26 export-form1 library entry
- [x] 27 foreign-in-header comment
- [x] 28 durations SPEC
- [x] 29 §42.3.6 amend
- [x] 30 quoted rule= named code
- [x] 31 §51.0.R onIdle example
- [x] 32 debounce RMW lint
- [ ] 55 barrel per-name supply (INTERIM) — NOT BUILT, residue in gap
- [ ] 56 parseVariant intrinsic — NOT BUILT, residue in gap
- [x] 57 noted (deferred PERMANENT fork)
- [x] 58 glued-eq §23.2 sentence
- [x] 59 file-scope (SPEC + (a) query limb; rest residue g-boot-file-scope-init-eval-s478) binding (a)(b)(c)
- [x] 61 contradictory validators
- [x] 62 mcp-shim helpers move

## Log
- batch 1 (items 23,24,25,27,28,29,31,58): SPEC + bootstrap + cases + gaps. Foreign 5 cases UNSUPPORTED→PASS, base-type-reject-rt FAIL→PASS (bootstrap); impl#1 still passes all 6. Residue gap g-boot-foreign-slice-checks-after-analysis-s478.
- batch 2 (items 30, 61, 32): E-ENGINE-RULE-QUOTED, E-VALIDATOR-CONTRADICTORY, W-TIMED-READ-MODIFY-WRITE (SPEC + §34 + severity regen + bootstrap + tests).
- batch 3 (items 62, 26, 59): mcp helpers moved; library entry; file-scope initializer SPEC + (a) query limb. Conformance head: PASS 621 / FAIL 14 / UNSUPPORTED 596 / NOT-TWINNED 637, 0 PASS->FAIL.
- fix r1 (#1947 review s478-1947): merged origin/main (05d05383d; known-gaps markers take main's provenance order + this branch's status — F8). F1 RMW lint on field / self-spread writes; F2 quoted `->` rule= stays E-ENGINE-RULE-LEGACY-SYNTAX; F3 §21.5 "Which declarations make a library" — non-exported top-level cell / function → E-PROGRAM-MISSING; F4 gap g-boot-asis-plus-operand-s478; F5 §23.2 bind-first advice only; F6 RULE-QUOTED message echoes the quote char, no `rule=*` advice; F7 E-FN-004 in a lambda names the `fn`; F9 `req` = length >= 1 in §55.12; rename E-FILE-SCOPE-SERVER-REACH → E-FILE-SCOPE-SERVER-ONLY-REACH. Conformance main→head unchanged from r0 (621/14/637/596); corpus pre-fix→post: 0 newly-rejecting, 3 files regain E-PROGRAM-MISSING; main→post newly-accepting 21 (all library files).
