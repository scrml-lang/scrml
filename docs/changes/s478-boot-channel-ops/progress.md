# s478-boot-channel-ops — progress

Ruling: user-voice-scrml.md S478 "⭐ RULED — §38.4 op-based channel sync".
Base: origin/main 28fc2d031 (#1928 merged).

- [x] SPEC §38.4 / §38.4.2 (new) / §38.7 amended
- [x] runtime.js: op sink on Cell.land; op-tagged rt.append/prepend/removeEnd/removeFront; channel send/receive with checks
- [x] server-runtime.js: op frame validation + relay
- [x] print.scrml channelBoot / print-server.scrml channelConsts: per-cell ops (+ edges)
- [x] analyze.scrml chSyncWhy: admit append/prepend/pop/shift tapes and rule= fields; residue refused by name
- [ ] tests (served + attack probes), conformance delta, corpus, CI gates, gaps

- tests: slice-m4/channel-ops-s478.test.js (new), channel-s478 B2 rewritten, channel-served frames updated — all green locally
- gaps: capability-sync resolved; op-residue + op-order-joiner filed
- next: commit (hook), head conformance, corpus, CI checks gates, PR
- committed d4697b91f (hook PASS). Conformance base vs head: 614 PASS / 18 FAIL both, 0 case changes. Corpus (73 `<channel` files): 0 changes.
- gates: severity/types/corpus-floor/md-shim OK; snippet-gate + claim-gate needed the stale channel spec-ahead markers removed (tutorial 07, kickstarter 11.3) and 10-all-together re-pinned to [E-TYPE-031]

## Fix round 1 (review ~/.cache/scrml/review/s478-1937/review.md)
- [x] HIGH-1: fixed-length tape — chSyncOps drops length ops (growsFixed), chSyncWhy refuses a cell left with no op; receiver (lengthBound "fixed") + relay refuse length ops. Tests: channel-s478 B2 "FIXED-length", channel-ops G (relay, receiver) — red on c16e69503.
- [x] MED-1: `let` + `rule=` channel cell refused by name; sink sends `transition` only for a tagged rt.transition or an edge move from the replaced value (else warn, not sent). Tests: B2 "`let` `rule=`", G "only when it is a move".
- [ ] MED-2 / MED-3 / LOW docs (SPEC §38.4.2, tutorial §8, kickstarter, gaps)
- [ ] verify: probes, conformance, corpus, CI gates
