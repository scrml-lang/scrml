# s483 fix r4 — PR #2123 progress (lane copy; dropped before merge)
- base: origin/s483-host-render-request 12eaf0162, merged origin/main 35e69d88c (f193a273c)
- runtime.js: HIGH-1 rAF yield signal (askFrame, one pending), MED-1 stallRetryLater (unref'd setTimeout ~bound later, sawYield first),
  LOW-1 stallLong (2x bound skips the count from an effect's 2nd re-run; zero override exempt), LOW-2 comments
- test: MED-1 (ii) loop test updated (laps once per bound)
- TODO: new r4 tests, SPEC/gap text, probes, gates
