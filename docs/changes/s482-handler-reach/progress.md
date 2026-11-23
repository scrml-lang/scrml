# s482-handler-reach — progress

Gap: g-boot-handler-reach-runs-binding-early-s482 (MED). Brief: ~/.cache/scrml/review/s482-briefs/handler-reach.md.
Scratch: ~/.cache/scrml/review/s482-handler-reach/ (base = archive of the #2063 head 7d4dca2f8 — compiler-identical to
origin/main ce6d500b0, which differs only in generated docs; head = this worktree; h/run.sh, h/all.sh Chromium harness).

- [x] #2063 merged (ce6d500b0); branch rebased onto origin/main
- [x] base probe values (Chromium): handler direct / via fn / via seed / each row / gather row / component / two handlers all `1`
- [x] fix: print.scrml reachOf walks runsNowNode copies (no On attribute, no bind: write-back)
- [x] FINDING: a `<request>` body runs DURING the body (rt.requestOn's first load is synchronous where it stands): skipping
      it showed `NaN 5` (r1-request) — kept walked, fail closed; new gap g-boot-request-runs-in-body-s482 (owner question).
      `<effect>` left exactly as it was (g-boot-effect-fires-in-body-before-place-s482, open owner question).
- [x] tests slice-m4/handler-reach-s482.test.js (10 red on base, 15 green on head); seed-reach-s482 handler test 1 -> 5;
      runorder-followups-s482 "function value in an event handler" asserts 5
- [x] gap record resolved; new gap; SPEC §7.6 provenance INTERIM names effect/request bodies
- [x] final gates on f0d87b9b9: pretest exit 0; bootstrap-conformance base = head (PASS 817, FAIL 3 — the same 3, CRASH 0,
      no verdict changed); corpus 2969 files (examples, samples, benchmarks, conformance cases): 0 newly rejected,
      0 code changes, 0 output diffs (no corpus program has a handler before a place reaching the binding); probe diffs
      (h-direct etc.) are init order only (`const k = n + 0;` at module init → `let k;` + `k = n + 0;` at its place);
      s34-census --check-new, types-gate --check, snippet-gate, claim-gate, corpus-compile-floor --check, gen-md-shim
      --check, lint-no-default-arm, lint-duplicate-fn all pass; ci-slices legs 1/2 and 2/2 (slice-m1/m2/m3/codec/m4 +
      e2e-render-map) 0 fail
- [ ] push, PR
