# s480-channel-supersede — progress

Lane: an honest channel client closed 1008 by the queued-replace supersede (#1987 r2 review M-pre, L1, L2).

- [x] branched from origin/main 2ec9f76d7 (after #1987 merged)
- [x] reviewer repro supersede.test.js red on main (closes 1008), green with the fix
- [x] fix: runtime.js channelPacer — a frame is superseded only by the NEXT frame of its cell, when that is a `replace` (push + release)
- [ ] served tests (M-pre, L1) + fuzz
- [ ] SPEC §38.4.2/§38.4.3 amendments
- [ ] known-gaps INTERIM (per-address socket-order unfairness)
- [ ] gates, PR
