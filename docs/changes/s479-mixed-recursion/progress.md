# s479-mixed-recursion — progress

Gap: g-boot-mixed-recursion-escalation-s479 (review #1966).

## Finding
Not a cycle defect. Trigger-5 placement (`inheritedFns` / `positionRefs` in analyze.scrml) did not count
a `<request>` body — author-written or a pending cell's compiler-written one (§13.9.2) — as a client
referrer. A helper the load calls that a server function also calls was placed by inheritance; its
handled server call was judged server→server (false E-ERROR-013) and the load lowered as a ServerCall
of a non-server function (C-R2/C-S3/C-S7 → E-BOOTSTRAP-CORE-ILL-FORMED). Reproduced acyclic too.

SPEC: §12.2 T5 "A function with at least one client-classified caller SHALL remain ambient";
§19.9.10 item 2 (a `<request>` body is client). So the SCC must NOT escalate; per-function placement.

## Done
- analyze.scrml `positionRefs`: request bodies are client positions (commit a8d7d6bed).
- waitingCallees refusal names the new gap g-boot-waiting-helper-server-copy-s479.
- slice-m4/mixed-recursion-s479.test.js (8 tests).
- conformance: reactive/{mixed-recursion-inherited-rt, mixed-recursion-3cycle-rt,
  client-recursion-calling-server-rt} PASS on bootstrap; reactive/mixed-recursion-client-caller-rt
  (the probe) UNSUPPORTED (server-copy INTERIM). impl#1 xfail g-impl1-pending-cells-unbuilt-s477.
- known-gaps: resolve the gap, file g-boot-waiting-helper-server-copy-s479; SPEC §31.2 ⚑ rewritten.

## Owed (not this lane)
- The server copy of a waiting client helper (g-boot-waiting-helper-server-copy-s479).
