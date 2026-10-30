# s473-windows-ratchet — progress

Ruling: scrml-support/user-voice-scrml.md, "RULED — S473 Windows: impl#1 routeMap fix exception + CI ratchet guard", item 2.

## Plan
- [x] scripts/windows-ratchet.ts (validate · retry-list · judge · report) + unit tests with fixture junit
      (compiler/tests/unit/windows-ratchet-s473.test.js, 18 cases, one reads a report bun itself writes)
- [x] .github/windows-baseline.json — EMPTY: #1681 (s473-windows-red) fixes all five families on main, incl.
      the impl#1 routeMap fix (402e6a1f8). Must land AFTER #1681, or with the 28 main failures baselined.
- [x] ci.yml windows job: junit, one retry of failed files, ratchet step; drop continue-on-error
- [x] gate needs windows (skipped allowed only on merge_group, where the job never runs)
- [x] checks: baseline validate step; ci-shards NON_BLOCKING drops windows
- [x] nightly windows-main-report.yml (latest conclusion + first red SHA). Local run against main: RED,
      first red af34aa328 (run 40754958089), last green e8d2e38cd (run 40726257771) — matches #1681's bisect.
- [x] .github/CI.md section
- [x] dispatched CI: 41082134439 (this branch on main): ratchet FAIL, 25 new (facts 1, spec-coverage 4,
      transport 16, whole-error 4), 4 files retried, none rescued; every other job green.
      41082138775 (this branch + #1681 @402e6a1f8, scratch branch since deleted): ratchet FAIL, 2 new, both in
      #1681's own routemap-native-key-s473.test.js (harness key-shape case + `e.variant` imported). The 20
      impl#1 cases pass there.
- [x] PR #1685 — lands AFTER #1681 (and #1681's two real-Windows failures) with the empty baseline.

## Findings
- bun 1.4.3 junit OMITS a test file that throws at load. The console counts it as "1 error" and there is no
  `<testsuite>` for it in the report; with ONLY such files, no report is written at all. A junit-only ratchet
  would wave that through, so the judge also enumerates the expected test files and treats an unreported file
  as a failure.
- No actionlint locally; workflow YAML parsed by Bun.YAML (ci-shards needs) and reviewed by hand. Gate jq
  expression exercised locally for PR success / merge_group skipped / PR skipped / push failure.
