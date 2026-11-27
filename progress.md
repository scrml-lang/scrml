# s483 fix r4 — PR #2123 progress (lane copy; dropped before merge)
- base: origin/s483-host-render-request 12eaf0162, merged origin/main 35e69d88c (f193a273c)
- runtime.js: HIGH-1 rAF yield signal (askFrame, one pending), MED-1 stallRetryLater (unref'd setTimeout ~bound later, sawYield first),
  LOW-1 stallLong (2x bound skips the count from an effect's 2nd re-run; zero override exempt), LOW-2 comments
- test: MED-1 (ii) loop test updated (laps once per bound)
- TODO: new r4 tests, SPEC/gap text, probes, gates
- commit 1 (runtime + loop-test update) hook PASS 58826/0
- compiled Chromium tab (31 probes) r4 vs r3 vs base: all equal r3 (tab-r4.out / tab-r3.out in ~/.cache/scrml/review/s483-2123-r4/)
- Chromium rt: stream 2000/2000 0 logs; taskwrite timer/mc/fetch 100; taskreq fetch1 108 (visible + hidden)
- node/bun exit with the delayed-retry timer pending: 83-126 ms, exit 0 (unref/u4.mjs)
- tests added (5 happy-dom + 2 Chromium rt pages); SPEC §6.7.4 r5 note, §6.15 x2, §22.5; gaps (render-host-call-hang r4 para, P6 "may", meta-set body-top)
