# s478-boot-match-element — progress

Lane: the block-form `<match for=Type on=expr>` (SPEC §18.0.1) in the bootstrap.
Branch `s478-boot-match-element` (from origin/main f23824dbb).

## Design (built)
- parse.scrml: `finishMatch` reads a `<match>` body as ARMS (variant tag / `<_>`), each
  opener via `parseOpenerB(mp, true)` which also reads the positional binders `(a, b)`;
  bodies read like a declaration state-child (`:`-shorthand, or `parseCodeBody` — code-default).
  AElem gains `binds: ABind[]`, `parens: boolean` (empty everywhere else).
- analyze.scrml: `resolveMatchBlock` (for= / on= / if= chain attrs; arms judged by the §18
  plain match's `plainArm`; E-MATCH-NOT-EXHAUSTIVE / -INVALID-ARM / -ON-REQUIRED /
  -EFFECT-FORBIDDEN / -ONTRANSITION-FORBIDDEN, W-MATCH-RULE-INERT, E-TYPE-021/023,
  E-SYNTAX-010, W-MATCH-001); ElemFact.MMatch; `typeMatchBlock` (subject vs for=:
  E-TYPE-VARIANT; `T | not` subject refused); `mkMatch` (the mount `<div>` judged as a
  div, §24.5); E-MATCH-BLOCK-IN-LIFT in `resolveRow`.
- lower.scrml: `matchView` — `<div data-scrml-match-mount>` + View.Cond (variantIs tests,
  `<_>` = true); each payload binder is the row of a one-row `<each>` over
  `match subj { .V(..) :> [field k], _ :> [] }` (no printer / runtime change).
- missing `for=` refused by name (SPEC REQUIRED, no code) — owner question.

## State
- [x] parse / analyze / lower / severity regen
- [x] slice tests (slice-m4/match-block-s478.test.js, 31 tests; 28 red on base f23824dbb)
- [x] conformance: PASS 525 -> 538, UNSUPPORTED 698 -> 685, FAIL 10 -> 10, PASS->FAIL 0
      (3 dialect.s66 "expect" overrides: engine/match-in-state-child-warns,
      match-codes/e-match-block-in-lift-{neg,pos})
- [x] corpus (65 files holding `<match`): newly-accepting 0, newly-rejecting 0
- [x] §66.15.2 slots: `<match>` arms exclusive (slotPathElem)
- [x] docs: spec-ahead pins / stale markers (README, NERDME, tutorial, kickstarter article)
- [x] gates: severity --check, types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim
- [x] commit (hook), merge origin/main (849fe5c18, clean), PR #1909 (owner questions: `for=` omission, the mount div, `on=` implied by a `single`)
