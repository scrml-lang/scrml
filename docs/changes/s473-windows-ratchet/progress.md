# s473-windows-ratchet — progress

Ruling: scrml-support/user-voice-scrml.md, "RULED — S473 Windows: impl#1 routeMap fix exception + CI ratchet guard", item 2.

## Plan
- [ ] scripts/windows-ratchet.ts (validate · retry-list · judge · report) + unit tests with fixture junit
- [ ] .github/windows-baseline.json (each entry tied to a gap id in docs/known-gaps.md)
- [ ] ci.yml windows job: junit, one retry of failed files, ratchet step; drop continue-on-error
- [ ] gate needs windows (skipped allowed only on merge_group, where the job never runs)
- [ ] checks: baseline validate step; ci-shards NON_BLOCKING drops windows
- [ ] nightly windows-main-report.yml (latest conclusion + first red SHA)
- [ ] .github/CI.md section
- [ ] dispatch CI on branch, PR

## Findings
- bun 1.4.3 junit OMITS a test file that throws at load. The console counts it as "1 error" and there is no
  `<testsuite>` for it in the report. A junit-only ratchet would wave that through, so the judge also enumerates the
  expected test files and treats an unreported file as a failure.
