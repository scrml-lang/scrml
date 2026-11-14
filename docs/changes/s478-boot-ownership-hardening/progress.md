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

## Emit differential (base 314bad402 vs branch, the bootstrap via scripts/scrml-boot.ts compileSource)
- Inputs: 3,126 .scrml — conformance/cases 1,899 + samples 881 (excluding dist/) + slice-* 57 (excluding
  bundle.scrml) + acceptance 289. Each artifact = client.js + client.html + server.js + tool module, or the
  diagnostics when the compile is refused.
- Result: 3,126 / 3,126 byte-identical. Per side: OK 216, ERR 2,905, HANG 5 (identical on both sides).
- HANG (>90 s, killed by the watchdog — same on base): slice-m1/{counter,dropdown,valuesem}.core.scrml,
  slice-m3/css.core.scrml, slice-m3/css-bundle.scrml — bootstrap SOURCE modules (impl#1 scrml), not
  bootstrap-language programs; pre-existing, out of scope.
- COVERAGE CAVEAT (base §8): 0 of the 3,126 artifacts contain an owned writer (`…Owned(`), and only 2 OK
  artifacts use a SeqCall at all — the corpus barely reaches the in-place path, so "identical" here says
  little about this change. The in-place shapes are pinned by slice-m4/tape-inplace-s476.test.js (31 tests,
  printed `tapeAppendOwned(` / `rt.tapeAppend(` shapes + runtime behaviour), unchanged and green, and by
  the new test's per-op in-place assertions.

## Gates
- pre-commit hook: 54,618 pass / 0 fail.
- CI slices job locally: lints 0/0; slice-m1+m2+m3+codec 1,012/0; m1 lowered 167/0; m4 6,110 (113 skip, 1 todo) / 0 fail.
