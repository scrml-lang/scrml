# s478-boot-channel — progress

Lane: build SPEC §38 `<channel>` (WebSocket channels) in the bootstrap (`compiler/self-host-v2/`).
Branch `s478-boot-channel` from `716265978` (includes #1916 `<endpoint>`).

## Design (as built)

- **Parse** (`parse.scrml` `channelItem` / `onchangeItem` / `onchangeArms`): a `<channel>` in a
  `<program>` body is read like a `<page>` (§40.8 S441 "A `<page>` body … and a `<channel>` body …
  are the same locus") — its body items join the program's items in place (§38.1 rule 4: channel
  state is program-scope, read with `@`), and the channel is recorded in `FileAst.chans` (opener,
  attributes, extent). `onclient:*` / `onserver:*` are attribute names (§38.3), not typed attributes
  (`isChannelHookNs`). A `<onchange>` in a channel body is recorded in `FileAst.onchs` with its arms
  (the §18.0.1 arm grammar, incl. the deprecated after-`>` placement + W-COLON-SHORTHAND-LEGACY-
  PLACEMENT). `@shared x = …` → E-CHANNEL-SHARED-MODIFIER (`sharedModItem`).
- **Analyze** (`analyze.scrml` `channelPass`): E-CHANNEL-001 / -003 / -004 / -005 / -006 / -007 /
  -HANDLER-SHADOW / -SERVER-CELL-READ, the §38.13 `watches=` codes (DRIVER, UNKNOWN-TABLE,
  CLIENT-WRITE, BROADCAST, W-NO-PK, W-NO-CONSUMER) and `<onchange>` arm validity
  (E-MATCH-NOT-EXHAUSTIVE / E-MATCH-SUBSET-DEAD-ARM / E-TYPE-023 / E-SYNTAX-010 / E-TYPE-021;
  E-STRUCTURAL-ELEMENT-MISPLACED outside a `watches=` channel). By-name refusals (INTERIM):
  `auth=`, reactive `topic=`, `onserver:*`, an `onclient:*` call binding the event, `broadcast()` /
  `disconnect()` themselves, a non-`let` channel cell, markup in a channel body, nested / exported
  / non-entry channels. A clean channel → `CoreChannel` (ServerFacts → Core). Channel cells are
  exempt from E-DG-002 (read by the sync).
- **Emit**: client — `print.scrml` `channelBoot` prints `rt.channel(program$.scope, { name, reconnect,
  cells: [{ key, cell, table }], open, close, error })` (runtime.js `channel`: send on write with echo
  dedup, strict inbound decode, fixed reconnect, `onclient:*` hooks). Server — `print-server.scrml`
  `channelConsts` + `rt.server(host$, routes, conns, endpoints, [rt.channel(channel$0)])`; the upgrade
  route `/_scrml_ws/<name>` is answered by the existing `fetch` (no second router): §40.2 Origin check,
  403 (Origin) / 404 / 405 / 426, then `upgrader.upgrade` (#1928 r1: the prefix is intercepted only when the program has a channel; `/_scrml_ws` reserved for `<endpoint>`); `srv.websocket` handlers relay a strictly decoded,
  re-encoded `__sync` to the channel's other subscribers (per-channel `[name, topic]` key); any other
  frame closes the sender (1003/1007/1008/1009). `channelRefusal` refuses `watches=` emit, a cell with
  no wire table / persist / timing, a waiting or server-only hook. `scrml-boot dev` routes
  `/_scrml_ws/` to the program server with delegating `websocket` handlers.

## Status

- [x] parse + analyze (commit 1, b01287a59)
- [x] emit + runtime (commit 2)
- [x] tests `slice-m4/channel-s478.test.js` (A, B, D0) and `slice-m4/channel-served-s478.test.js` (C, D)
- [x] severity regen
- [x] conformance: 574 → 586 PASS (+12: channel/onchange-* ×3, shared-modifier, watches-* ×8), 0 PASS→FAIL
- [x] corpus (5117 files: samples, examples, conformance, acceptance, stdlib, benchmarks, docs): 0 newly-rejecting
- [x] CI gates: severity --check, types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim
- [x] gap `g-boot-channel-s478` (owner questions); `g-bootstrap-let-decl-in-db-channel-body-refused-s469` narrowed
- [ ] PR

## Fix round 1 (review ~/.cache/scrml/review/s478-1928/review.md)

- [x] HIGH-1: a channel cell syncs only with `replace` and no `rule=` graph / lifecycle / `replace`-less inner tape (`chSyncWhy`); others refused by name (INTERIM, gap g-boot-channel-capability-sync-s478). Tests: channel-s478 B2, channel-served replace-tape e2e.
- [x] MED-1: `/_scrml_ws` reserved in endpointPathRefusal; server().fetch intercepts the prefix only when `channels.length > 0`.
- [x] LOW-1: Origin check first (403 → 404 → 405 → 426), comment made true; test.
- [x] LOW-7: the createServer channel sentence printed only with a channel.
- [x] LOW-2..6 filed as gaps.
- [x] conformance: PASS 601 / UNSUPPORTED 615 / FAIL 17 / CRASH 0 — identical per case to the PR head; vs base 46196f62c the same 12 UNSUPPORTED→PASS, 0 PASS→FAIL (all 12 channel cases still pass)
- [x] corpus: vs base 0 newly-rejecting; vs PR head the append-tape channel snippets docs/tutorial-snippets/07-channel-chat.scrml and 10-all-together.scrml are refused again (spec-ahead pins restored in docs/tutorial.md and the kickstarter article)
- [x] LOW-7: the 100 base-PASS cases that print, client + server, are byte-identical to base 46196f62c (24 of them have server artifacts)
- [x] gates: severity --check, types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim
- [ ] hook / push
