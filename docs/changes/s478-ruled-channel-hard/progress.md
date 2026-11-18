# s478-ruled-channel-hard — progress

Lane: S478 open-Qs rulings (user-voice items 41–49) on `<channel>` + the dev server.

- [x] SPEC: §38.3 rows, §38.4 (Q4 no-write cell), new §38.4.3 (Q1 strict decode+close, Q2 frame bound, Q3 topic scope, item 49 bucket + cap, E-CHANNEL-LIMIT-INVALID), §38.9 + §34 rows, §38.10.4 (Q5 teardown), §40.2 (item 48 dev Host).
- [x] bootstrap: analyze channelPass + topProgramAttrDiags read/validate the bounds; CoreChannel limits; print-server emits `limits`.
- [x] runtime: server-runtime.js token bucket (1008), subscriber cap (503 / open race 1013), frame size in UTF-8 bytes (1009).
- [x] scripts/scrml-boot.ts: devHostAllowed + `--allow-host`, 403 before any other check.
- [x] tests: slice-m4/channel-limits-s478.test.js
- [x] Q7 onchange desugar (parse onchangeDesugar)
- [x] known-gaps markers, severity regen, CI gates (all OK), conformance: PASS 614→613 (watches-broadcast-member-call-ok PASS→UNSUPPORTED, explained), 0 PASS→FAIL
- [ ] commit (hook), PR
- Q6 OPEN (not touched). impl#1 parity of Q1 recorded as impl#1-owed.
