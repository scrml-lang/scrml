# s480-channel-supersede — progress

Lane: an honest channel client closed 1008 by the queued-replace supersede (#1987 r2 review M-pre, L1, L2).

- [x] branched from origin/main 2ec9f76d7 (after #1987 merged)
- [x] reviewer repro supersede.test.js red on main (closed 1008), green with the fix
- [x] fix: runtime.js channelPacer — a frame is superseded only by the NEXT frame of its cell, when that is a `replace` (push + release)
- [x] tests: slice-m4/channel-supersede-s480.test.js (12; A pacer ×2 and B served ×2 red on main, C fuzz 4 seeds × 2 configs)
- [x] SPEC §38.4.3: queued supersede condition (M-pre), re-send supersede condition (L1), §38.4.2 oldest-pending cross-reference (L2)
- [x] known-gaps: g-boot-channel-address-bucket-unfair-s480 (INTERIM), g-boot-channel-supersede-strands-edit-s480 (resolved)
- [x] gates: pretest, conformance (726 PASS, FAIL 0, CRASH 0 — same as base), channel files one per run, reviewer probes, CI checks job
- [ ] PR
