# s478-boot-bound-any-branch progress

- start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-a6872c167ab07b166
  (ff-merged to origin/main e6f5c4d9c first; the worktree base was one merge (#1853, impl#1) behind).
- baseline hook: 47512 pass, 0 fail, 125 skip (bootstrap slices skipped on a docs-only diff).
- gap: g-boot-bound-branch-any-literal-ruling-s478 (LOW) -> resolved.

## Ruling (verbatim, ruling:user-voice-scrml.md S478, "⭐ RULED — bounded branch literals …" item 1)

> **Option A (g-boot-bound-branch-any-literal-ruling-s478): ANY branch whose literal provably breaks a tape's
> bound is a compile error** (E-WRITE-INVARIANT), judged per branch the way types already are (E-TYPE-031,
> `checkLitFields`). `const xs: int[1..=2] = @c ? [1,2,3,4,5] : [1]` is refused. Newly-rejecting; measured 0 corpus
> files (#1850 lane). A branch whose length cannot be proven still traps at run time (O36).

## The rule implemented (compiler/self-host-v2/analyze.scrml)

- `boundValue`: a choice (ternary, value-`if`, value `match`, `!{}` guard arms; nested) is judged by
  `choiceLengths`, which now returns `bad` — every value-yielding LEAF branch provably outside the bound, with its
  span, its length and a label naming it ("the true branch (after `?`)", "the `else` branch", "arm 3 of the
  `match`", "arm 1 of the `!{}` guard", nested as "X of Y"). ANY bad branch: E-WRITE-INVARIANT at each bad
  branch's span (`reportBadBranches`). Every branch proven inside: no check. Otherwise: the run-time check.
- Leaf judgement unchanged from #1850 (`lengthVerdict`): plain literal by its length; spread literal by its range
  (wholly outside counts as provably outside); read by its declared bound; `not` as inside.
- Diverging arm (`armValueOf` v -1): skipped. Write arm / other shape: not provable.
- `!{}` guard arms are now judged (#1850 excluded guards because the subject's success value is another
  result — so they could never satisfy "every branch"). Under any-branch an arm literal outside is a branch
  that provably breaks the bound. A guard is never PROVEN inside by its arms (the success value is unknown), so
  an in-bound guard keeps its run-time check.
- Element-level: `[@c ? [1,2,3] : [1]]` into `int[1..=2][]` goes through `boundValue` per element (automatic).
  NEW: `innerBoundValue` judges a CHOICE of values whose ELEMENT type is bounded branch by branch
  (`choiceLeaves`): each leaf literal's elements are checked (E-WRITE-INVARIANT naming "`xs`'s false branch …");
  a leaf that cannot be proven is refused (E-BOOTSTRAP-UNSUPPORTED INTERIM, as before) at that leaf. Before this
  lane every such choice was refused whole with E-BOOTSTRAP-UNSUPPORTED — so `@c ? [[1]] : [[1, 2]]` into
  `int[1..=2][]` is newly ACCEPTED (proven, no check). Corpus: 0 files affected.
- Constant condition still not folded (now: `true ? [1] : [1,2,3]` is E-WRITE-INVARIANT, as a type clash in a
  dead branch would be E-TYPE-031). PA reading, recorded in SPEC.

## SPEC

§66.12.2, new paragraph "A choice is judged branch by branch (S478)" after "A bounded length (S477, with O36)",
with `> **Provenance:** ruling:user-voice-scrml.md S478 (Option A)`. The constant-condition and guard points are
marked PA reading.

## Corpus measurement (newly rejecting)

Command: a throwaway bun test (`.tmp/corpus.test.js`, deleted) running the bootstrap `frontEnd` (slice-m4
harness `loadM2` + `frontEnd`) over `git ls-files -- conformance/cases samples examples
compiler/self-host-v2/acceptance` (`*.scrml`): 3,142 files (main gained one since #1850's 3,141), 0 crashed. Run
once with this lane's analyze.scrml and once with origin/main's (`git show origin/main:… >` then
`git checkout HEAD --`), comparing per-file Error diag `code|span.start` sets.
Result: **0 newly rejecting, 0 newly accepting**; 1 file's diag set changed —
`conformance/cases/reactive/tape-bound-branch-literal-neg` (every branch outside): one E-WRITE-INVARIANT at the
whole choice -> one at each branch. Its `expect.codes` still holds.

## Tests

- slice-m4/tape-bounds-s477.test.js block I rewritten (10 tests): 133 pass / 0 fail.
- conformance reactive/tape-bound-branch-mixed-neg (new): bootstrap PASS
  (`bun scripts/bootstrap-conformance.ts --filter tape-bound-branch --no-twins`); impl#1 XFAIL, signature from
  `bun conformance/run.ts --xfail-signature reactive-tape-bound-branch-mixed-neg`. impl#1 run: 1751/1862.
- hook on the analyze + test commit: 54725 pass, 0 fail, 238 skip.

## Locus

Brief locus `analyze.scrml boundValue` / `choiceLengths` / `lengthVerdict` / `armVerdict` HELD (boundValue :25405).
The element-level extension sits in `innerBoundValue` (same region).
