# s478-boot-durations — progress (crash-recovery anchor)

Lane: C9 of the S478 conformance triage — duration literals (`debounced=300ms`, `<onIdle after=5m>`).
Branch `s478-boot-durations` (from origin/main af7fe4bab).

## Steps
1. [x] parse: `AAttrValue.Dur(text)` — a number+letters / `${…}`+letters value of `debounced=` / `throttled=` /
       `after=` (parse.scrml parseDurationValue; never a declaration's own value or a typed attribute's default).
       63 `.Dur` arms added mechanically (copy of each `.Quoted` arm); the three that would misread a Dur
       (quotedHasInterp ×2, quotedNoInterp, quotedInterpDiag) set to "not a quoted string".
2. [x] analyze: durationOf (§51.12.3 literal grammar, lowercase units, fraction, round to ms) → E-SYNTAX-DURATION;
       computed `${…}ms` refused by name; a Dur on any other element refused by name (strayDurationDiags).
3. [x] debounced= / throttled= on program cells (timingPass): E-REACTIVITY-ATTR-CONFLICT, E-DEBOUNCED-WITH-SERVER,
       E-DEBOUNCED-WITH-DERIVED; Core Field.timing; print `rt.timed`; runtime `timed` / `timedWrite` (Cell.set →
       Cell.write). Refused by name (INTERIM, g-boot-timing-compositions-s478): user-decl field, locked cell,
       persist=, <db> / pending cell, request target/dep, reset-on target, reset(@x).
4. [x] <onIdle> (ADeclChild.Idle): E-IDLE-DUPLICATE / -INVALID-VARIANT / -MISPLACED; Core TransitionGraph.idle;
       print `rt.idleWatch`; runtime watchdog (arm at construction, re-arm on committed change, fire via
       `transition`). Derived-value <onIdle> refused by name.

## Measurements
- Step 1 alone (parse only): the 9 cases move FAIL → UNSUPPORTED (the words are then refused by name).
- Full lane: conformance PASS 422 → 431, FAIL 142 → 133, UNSUPPORTED 665 → 665, 0 PASS→FAIL.
  8 C9 cases FAIL → PASS; engine/onidle-misplaced-pos UNSUPPORTED → PASS; reactive/debounce-on-server
  FAIL → UNSUPPORTED (its `server` cell is refused by name). ontimeout cases lose only E-PARSE-TRAILING.
- Corpus (samples/examples/acceptance files with a duration attr or <onIdle>: 7 files): 0 newly rejecting —
  each was rejected on base too; head only drops E-PARSE-TRAILING.
- Gates: gen-bootstrap-severity (regenerated + --check), snippet-gate 0 fail, claim-gate 0 fail (4 spec-ahead
  pins dropped E-PARSE-TRAILING: README.md:27, NERDME.md:135, llm-kickstarter-v2:747/1629).

Tests: compiler/self-host-v2/slice-m4/durations-s478.test.js (41).
