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
- [x] 1 SPEC  - [x] 2 relay  - [x] 3 client  - [x] 4 tests (channel-ops-s478 H–K; 35 red on b04fdc27a)  - [x] 5 docs (known-gaps, tutorial §8); PR pending
Base conformance (b04fdc27a): PASS 614 FAIL 18 CRASH 0 (~/.cache/scrml/review/s478-ruled-channel-sync2/conf-base-cases.json)
Head conformance (c5729242f): PASS 614 FAIL 18 CRASH 0 — per-case identical to base.

## Fix round 1 (#1941 review, ~/.cache/scrml/review/s478-1941/review.md)
- [x] HIGH-1 epoch reset of a truncated channel at 0 subscribers; relay stops logging past the bound; residue item 2 → HIGH + PA rec (owner Q: relay-computed compaction fold)
- [x] MED-1 held edits before the replay (sent after it, via `send`); `onclient:open` after the replay (§38.10.2 amended)
- [x] MED-2 non-channel `reset-on=` made only when the trigger's SHOWN value changes across a unit (runtime `resetGuard`, no print change)
- [x] MED-3 replay text cached per channel; limits are PR #1942's
- [x] LOW-1 bound counted in UTF-8 bytes; LOW-2 seam = `Symbol.for("scrml.test.channelLog")`; LOW-3 `<onTimeout>` not built (refused everywhere) — residue item 8
- Tests: channel-ops-s478 L (10 tests; 10 red on f7d0a01f3 runtime except the two behaviour-preserving ones)
- [ ] gates, conformance, hook, push

## Integration round (#1941 × #1942, after #1942 merged to main)
- [x] merge origin/main (SPEC §38.4.2/§38.4.3/§38.10.4 both rule sets kept; runtime.js, server-runtime.js resolved)
- [x] one subscriber count: #1942's `ch.subs` (reserved at upgrade); epoch reset at 0, or at open holding the only reservation
- [x] pacing: `send(p)` → `channelPacer.push(…, ref)`; superseded `replace` drops its pending entry; close drops queued pending
- [x] replay: one message, not a client frame (no bucket, no frame bound); a replay `send` → 0 closes 1011 unsubscribed
- [x] tests: channel-ops-s478 K (8 tests); #1942 bounds tests adapted to the `__replay` / `__seq` / `__own` protocol
- [ ] probes, conformance, CI gates, hook, push
