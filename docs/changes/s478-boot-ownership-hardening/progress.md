# s478-boot-ownership-hardening progress

- started at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-a8fee3c1ce937de6a (base 314bad402)

## 1. g-boot-ownseq-op-allowlist-s477 — print.scrml `ownSeq`
- `ownSeq(o, sq, f)` now exempts a bare-local receiver only when `seqKeepsNoReceiver(o)` (membership in
  `receiverSafeSeqs()`) AND `f` is a lambda of <= 2 params. Not listed -> ordinary read (fail closed: copy).
- Classification (core.scrml `SeqFn` = Filter, Map, SortBy, Some, Every — all five safe, all listed):
  - Filter: host Array.prototype.filter, new array; receiver not kept
  - Map: host Array.prototype.map, new array of lambda results; receiver not kept
  - Some / Every: host, boolean result
  - SortBy: runtime.js sortBy sorts copyOf(xs); comparator called as cmp(a, b)
  - (lambda arity <= 2 keeps the host's third `array` argument unbound — unchanged gate)
- Ops the change stops exempting today: 0 of 5.

## 2. g-boot-ownedlocals-kids-blind-spots-s477 — walk.scrml `kids`
- The three positions are `Sym` fields, not Nodes: `kids` returns Node[] and has no Node kind for a Sym
  (a Sym is a leaf of the walk). Making `kids` "descend" would mean synthesizing `Expr.Local` nodes, which
  changes every allNodes consumer — notably check.scrml C-S7 (checkClientCalls) counts FSettled separately
  and requires the Suspend bind to be "read nowhere else (no Expr.Local …)"; a synthetic Local would trip it,
  and print.scrml blockLocals / walk sharedRefs etc. would see phantom reads. So `kids` is unchanged and the
  owned-locals scan (the only consumer that needs it) handles the Sym positions itself, fail closed:
  - `ownStmt` Suspend -> ownBad([bind]); Attempt -> ownBad(attemptSyms(...)) = result, FSettled outcome,
    ok.bind, each arm's `whole`.
- All of them are binders minted by analyze/lower (never a statement Let), so no owned local changes today.

## Tests
- slice-m4/ownership-hardening-s478.test.js: 13 tests. On base (with only `export` added to ownedLocals so
  the test can call it): 8 pass / 5 fail — exactly the hypothetical-op test and the four Sym-position tests.

## Emit differential
- (see below)
