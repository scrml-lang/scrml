# s479-channel-relay-fold — progress

Ruling: user-voice "⭐ RULED — S478 hand-off §3.A and §3.B, PA recs adopted (S479, 2026-11-18)", item 7.
Gaps: g-boot-channel-relay-order-residue-s478 (items 1–2), g-boot-channel-client-bound-s478.

Locus (verified): relay = compiler/self-host-v2/slice-m1/runtime/server-runtime.js (channel, channelSockets,
upgradeChannel, takeToken); client = runtime.js `channel`; server desc printer = print-server.scrml channelConsts.

## Plan
1. runtime.js: export the receiver's check (3) as `channelStep` (one function, client + relay fold).
2. server-runtime.js: fold (judge + compaction base), `__refused` to the sender, close when provably not concurrent.
3. runtime.js client: `__replay.__base`, `__refused`.
4. server-runtime.js: per-address INTERIM bounds (requestIP): parked buckets, per-address share, upgrade bucket.
5. print-server.scrml: fold desc (init, edges, resets) + print.scrml chFoldWhy (foldability).
6. SPEC §38.4 / §38.4.2 / §38.4.3 text. 7. tests. 8. probes. 9. gaps. 10. gates.

## Status
- started
