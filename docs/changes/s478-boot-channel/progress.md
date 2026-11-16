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
- **Emit** (next commit): client half on the existing client runtime, server half mounted on the
  existing `rt.server` fetch (`/_scrml_ws/<name>`), strict `__sync` decode.

## Status

- [x] parse + analyze (commit 1) — client printer refuses a channel by name until commit 2
- [ ] emit + runtime (commit 2)
- [x] tests `compiler/self-host-v2/slice-m4/channel-s478.test.js` (A, B)
- [x] severity regen
- [ ] conformance before/after, corpus, CI gates, PR
