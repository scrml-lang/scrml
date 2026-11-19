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
- [x] 1–5 built (commit 4355237fd); per-address frame bucket switched from parked buckets to ONE shared
      address bucket of 4 connections' worth (the brief: parallel sockets must not bypass the bucket).
- [x] 6 SPEC §38.4 / §38.4.2 ("The relay's fold", `__base`, compaction, memory) / §38.4.3 ("Per-address bounds (INTERIM)").
- [x] 7 tests: slice-m4/channel-fold-s479.test.js (A judge, B compaction, C per-address, D chFoldWhy, E client);
      S478 channel tests moved to the new replay shape; truncation tests run on a fold-less channel (CONV_NOFOLD).
- [x] 8 probes re-baselined in ~/.cache/scrml/review/s479-channel-relay-fold/probes (fuzz settle-wait, attack A1–A4, bigreplay B1–B2): all pass.
- [x] 9 gaps: relay-order-residue + client-bound resolved; residue g-boot-channel-relay-fold-residue-s479, g-boot-channel-client-bound-residue-s479.
- [ ] 10 gates (comp.sh), base/head conformance, merge origin/main, PR.

## Review fix r1 (#1967; branch s479-relay-fold-r1 → pushed to s479-channel-relay-fold)
- [x] HIGH-1: fold value = decode(JSON.parse(the relay's own outbound `__val` text)) (`onWire`); the relayed /
      own / `__refused` frames splice that same text; foldOf checks init/reset values read back as themselves.
      Tests F (-0 forger; lone surrogate, int past 2^53, duplicate key; 1e400 → 1007). Commit eb16f89e3.
- [x] MED-1: runtime.js `channelStep` = `channelJudge` (shared rule) + client copy; relay applies in place on a
      ring buffer (`FoldTape`, `foldApply`). Tests G (op-for-op vs channelStep; cost 10k vs 1M). 1M append:
      7.5 ms → 0.05 µs per frame.
- [x] LOW-2: SPEC §38.4.3 who-pays + g-boot-channel-client-bound-residue-s479 (c) IPv6 /64 rotation.
- [x] LOW-1: g-boot-channel-relay-fold-residue-s479 item 1 quantified (~1 µs CPU / refused frame).
- [x] conformance vs 89af3f69: identical (PASS 645 / FAIL 12 / CRASH 0; 0 PASS→FAIL). comp.sh gates all green.

## Decisions taken (report as owner-visible choices)
- Fold refusal: close 1008 only when no concurrent edit can explain the frame; else `__refused` to the sender
  (an honest client that lost a race is not closed). Forged frames are never relayed or logged either way.
- Foldable channel = literal initializers, no body-top / <request> write of a cell, reset-on= among the channel's own
  cells with a literal value. Others: no fold (S478 behaviour), reason printed as `noFold`.
- Base over half the byte bound → truncate + drop fold (bounds relay memory; avoids re-encoding a huge base often).
- Per-address: share = max(1, ⌊cap/10⌋) (429); upgrade bucket = share, refill share/10 per s (≥1) (429);
  ONE frame bucket per address = 4 × burst / 4 × rate (1008).
