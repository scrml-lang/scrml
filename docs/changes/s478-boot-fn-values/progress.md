# s478-boot-fn-values — progress

Lane: function values in the bootstrap (`compiler/self-host-v2/`). Branch `s478-boot-fn-values`.

## Sub-item A — the §5.2.1 `${(e) => …}` listener (an event-taking handler) — BUILT

- `parse.scrml` parseDollarValue: an arrow of ONE parameter (block or expression body) is the
  listener; `AAttrValue.Braced(b, ev)` carries the event parameter's name (`ev` = "" everywhere
  else). Two or more parameters, a function expression, a body that only names a function:
  refused by name.
- `analyze.scrml` eventHandler / resolveEventMember / resolveEventCall: the event is bound by
  scope. Built uses are the Appendix H `Event` members (H-047 `type` and H-048 `timeStamp` reads;
  H-050 `preventDefault()` and H-051 `stopPropagation()` as statements). Every other use is
  refused by name. Inside a lambda in the handler the event is sealed (refused by name).
- `analyze.scrml` planEventBraced / eventAfterAwait: §13.2 `E-EVENT-CONTROL-AFTER-AWAIT`.
- `core.scrml` HostCall.EventRead / EventCall; `lower.scrml` (a VHost member read lowers to
  Host); `print.scrml` (the listener is `(task$, event$)` when its body uses the event).
- Tests: `slice-m4/fn-values-s478.test.js`.

## Measurements (base 213dd1203)

- Conformance: PASS 552 → 554 (error/handler-guard-in-arrow-rt, markup-handler/s457-event-arrow-parameter-pos);
  FAIL 11 → 14 (three event cases UNSUPPORTED → FAIL on E-ERROR-002, g-boot-event-cases-unhandled-server-call-s478);
  UNSUPPORTED 670 → 665; PASS→FAIL 0; CRASH 0.
- Corpus (3211 .scrml in samples, examples, conformance, acceptance, stdlib, benchmarks): newly rejecting 0,
  newly accepting 0.
- CI checks-job gates green; severity.scrml regenerated (E-EVENT-CONTROL-AFTER-AWAIT).
- New tests red on base: 18 of 23 fail on 213dd1203.

## Sub-items B (arrows as general values) and C (naming a function without calling it)

- Not built: Core has no function type (`core.scrml` Type). See the final report.
