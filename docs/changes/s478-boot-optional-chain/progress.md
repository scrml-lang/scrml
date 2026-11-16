# s478-boot-optional-chain — progress

Lane: `?.` optional chaining (§42.3.6) on the bootstrap, on #1917's member access through `T | not`.

- [x] Applied the s478-boot-syntax-batch WIP patch (`optional-chain-wip.patch`) onto main 3a8f7d645 — clean apply.
- [x] Probed: basic / chained / `.length` / param / E-TYPE-031 / E-SCOPE-001 / E-TYPE-046 per hop / no receiver narrowing / #1917 H1 rebind (refused by memberRecvMismatch) / foreign receiver (refused).
- [x] Found: the WIP built `f?.(…)`, which reopened the s474 H1 guard (`match check?.(p) {…}` compiled past the
      named refusal). Fixed: optional CALL refused by name in optHop + a refusals.scrml row re-labelling it
      (`on` = the parser's own code), so the misread match arms are not reported beside it.
- [x] Tests: slice-m4/optional-chain-s478.test.js (20; red on base 18/19 before the index test was added);
      named-refusals-s473 / foreign-content-s474 updated to the new refusal names.
- [x] Conformance: base 589 PASS / 17 FAIL / 627 UNSUPPORTED → head 594 / 18 / 621 (0 PASS→FAIL; +5 PASS;
      request-body-client-wrapper-rt UNSUPPORTED→FAIL on an unrelated E-ERROR-002 the refusal hid).
- [x] Corpus (samples, examples, conformance, acceptance; 3150 files; base vs head bootstrap): 0 newly-rejecting,
      0 newly-accepting.
- [x] known-gaps: resolved g-boot-optional-member-access-s478; filed g-boot-optional-call-s478,
      g-boot-optional-chain-receiver-s478, g-boot-optional-chain-js-form-s478 (owner Q), g-boot-index-narrowed-optional-s478.
- [x] Commit e79b4ed0a (hook PASS: 55712 pass / 0 fail); CI checks-job gates run locally: severity --check, types-gate,
      snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim — all exit 0. Conformance re-measured at e79b4ed0a: same delta.
- [ ] PR (no merge).

Scratch: ~/.cache/scrml/review/s478-boot-optional-chain/
