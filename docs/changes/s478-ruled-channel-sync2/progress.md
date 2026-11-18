# s478-ruled-channel-sync2 — progress (crash-recovery anchor)

Lane: user-voice S478 open-Qs rulings 50–54 (scrml-support ccb6b40), on top of #1937 (op-based channel sync).
Gaps: g-boot-channel-op-order-joiner-s478, g-boot-channel-derived-write-resend-s478 (+ residue (7) of g-boot-channel-op-residue-s478).

## Plan
1. SPEC §38.4 / §38.4.2 / §38.10.4 text (ruling 50 ordering, 51 frame log + bound, 52 rate-limited report, 53 derived writes local).
2. server-runtime.js: per-channel sequence, echo to all incl. sender (`__own`), bounded frame log, `__replay` on open.
3. runtime.js: confirmed state + pending edits, rebase on each relayed frame, replay on open, fail closed on gap / incomplete log,
   `applying` over the whole received batch, rate-limited refusal report.
4. Tests over real Bun WebSockets (channel-ops-s478 harness): convergence per op kind, late joiner / reconnect, 4-client reset-on, forged frames in the log.
5. Tutorial §8, known-gaps markers, PR.

## Status
- [x] 1 SPEC  - [x] 2 relay  - [x] 3 client  - [x] 4 tests (channel-ops-s478 H–K; 35 red on b04fdc27a)  - [ ] 5 docs/PR
Base conformance (b04fdc27a): PASS 614 FAIL 18 CRASH 0 (~/.cache/scrml/review/s478-ruled-channel-sync2/conf-base-cases.json)
