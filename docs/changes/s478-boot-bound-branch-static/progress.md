# s478-boot-bound-branch-static progress

- started at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-a953669d558129a03 (base 314bad402)
- gap: g-boot-bound-branch-literal-static-s477 (LOW)

## Governing text (quoted)

SPEC §66.11.7, the O36 ruling (S477):

> A write that PROVABLY violates a sequence invariant (a length bound or a per-position type, §66.11.2 / §66.12)
> stays a compile error, `E-WRITE-INVARIANT` (§66.20). A write whose effect the compiler cannot prove is checked
> at RUN TIME and TRAPS on violation.

SPEC §66.12.2, "A bounded length (S477, with O36)":

> A write that provably leaves the bound is `E-WRITE-INVARIANT`; one the compiler cannot prove is checked at run
> time and traps with `E-WRITE-INVARIANT-RT`.

## The rule implemented

A value written into a bounded tape position that is a CHOICE (a ternary `c ? a : b`, a value-`if`, a value
`match`; nested choices recurse) is judged branch by branch. Each leaf uses the same test `boundValue` already
applies to a plain value: a plain array literal by its length, a spread literal by its length range, a read by its
declared bound, `not` as not breaking the length.

- EVERY value-yielding branch is provably outside the bound: the write breaks the bound whichever branch runs, so it
  is provable. Compile error `E-WRITE-INVARIANT`.
- EVERY branch is proven inside: no run-time check is emitted (a MAY under §66.11.7; the behaviour is the same).
- Otherwise (SOME branches outside, or any branch of unknown length): the result depends on which branch runs, so
  it is not provable. The write compiles and traps at run time (`E-WRITE-INVARIANT-RT`), as before.

Edge cases:
- A `match` arm whose block diverges (`return`, `fail`) yields no value and is skipped. A choice where no branch
  yields a value counts as not provable.
- A `!{}` guard and a `?` are not choices among written branches (the subject's success value is also a result), so
  they are not judged this way.
- An arm that is a write is not provable.
- A statically known constant CONDITION (`true ? a : b`) is NOT folded: every branch counts as reachable. The
  bootstrap folds constant conditions nowhere else, and folding would make this one judgement the only
  reachability-aware one. So `true ? [1,2,3] : [1]` into `int[1..=2]` traps at run time. That is sound but not
  maximal; the test is in tape-bounds-s477 I.
- A constant VALUE branch (a `const` local holding a literal) is judged by its declared type only, exactly as the
  direct write is. An unannotated `const big = [1,2,3,4,5]` is unknown, so it is not provable.

## Ruling question (not implemented)

The "any violating literal branch is an error" reading is consistent with three neighbouring bootstrap checks:
struct-literal fields in branches (`checkLitFields`), the per-position type (`@c ? "s" : 1` into `int` is
E-TYPE-031), and an edit inside an `if` branch. Per the brief I did not implement it. It is filed as
g-boot-bound-branch-any-literal-ruling-s478. The every-branch rule is a subset of the any-branch rule, so it holds
under either ruling.

## Locus

PA locus `analyze.scrml boundValue` HELD (now ~:25405). The new code is `isChoice`, `ternaryBranches`,
`valueMatchArms`, `lengthVerdict`, `choiceLengths` and `armVerdict`, after `boundValue`. Note: the name
`matchArmsOf` already existed (:14941, `AHow -> AArm[] | not`). My first draft reused it and shadowed it, which broke
every value `match` with E-TYPE-020. It is renamed `valueMatchArms`; `lint-duplicate-fn` did not catch the clash.

## Corpus measurement (newly rejecting)

The frontEnd (bootstrap analyze) was run over every tracked `.scrml` file in conformance/cases, samples, examples and
compiler/self-host-v2/acceptance (`git ls-files`, a throwaway bun test under .tmp/): 3,141 files, 0 crashed, 2
E-WRITE-INVARIANT diagnostics in total. The only "choice whose every branch" hit is the new neg case. Newly rejected:
0 files. Files with bounded tape types (`grep -rlE "\[[0-9]+ *\.\.=? *[0-9]+"`): 5 (4 conformance cases + examples/28-flux.scrml).

## Tests

- slice-m4/tape-bounds-s477.test.js, describe I (7 tests): 130 pass / 0 fail.
- conformance reactive/tape-bound-branch-literal-neg: bootstrap PASS; impl#1 xfail signature captured with
  `bun conformance/run.ts --xfail-signature`.
- pre-commit hook (full): 54613 pass, 0 fail, 238 skip.
