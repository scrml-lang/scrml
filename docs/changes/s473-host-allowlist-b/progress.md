# s473-host-allowlist-b — `<host>` rule 8 allowlist, LANE B

Base: `origin/s473-boot-host-block-f3` (PR #1659, the INTERIM fail-closed denylist); main merged after #1659 landed.
Brief: `~/.cache/scrml-agent-tmp/pa-s473/allowlist-brief.md`.
Design: `scrml-support/docs/deep-dives/host-binding-allowlist-design-2026-10-29.md` (§5, §6, §8, §9, §10).
Rulings: user-voice-scrml.md S473 "⭐ RULED — `<host>` rule 8 moves from a sink denylist to an allowlist"
and "⭐ RULED — S473 PA recs: host allowlist Q1–Q4, …" item 1 (Q1–Q4).

Lane A (s473-host-allowlist-a) owns slice-m1/runtime/runtime.js and the `src=` static export read.

## Log
- [x] host-surface.scrml (Appendix H as data, lookups, entryConflict against url.scrml's sink table)
- [x] built-in host types (fixed negative Syms; shipped in Core when a binding exists; user struct shadows)
- [x] typed chain walk (analyze.scrml hostWalk); parity test over the denylist's own 87 refused lines; denylist deleted
- [x] tests re-coded; R1 / R2 / H1 must-refuse; #1659 probe decode tests ported to direct hostCall
- [x] SPEC DRAFT: rule 8 (8.1–8.8), rules 4/13/15/16/22 amended, example rewritten, Appendix H, §19.17 trap,
      §21.3.3 + §34 codes; SPEC-INDEX + severity.scrml regenerated
- [x] Appendix H diff test (slice-m4/host-surface-appendix-h.test.js)
- [x] gaps: URL-sink gap re-titled HIGH code-exec + resolved; aliases gap resolved; off-surface lint narrowed;
      filed name-shadowing (fork), dictionary-result (silence), runtime-guards (lane A)
- [x] gates: slices m1–m4 + codec, lane tests, types-gate, s34-census, SPEC-INDEX, claim, snippet,
      bootstrap-conformance --check, delta-lint, conflict markers, e2e-render-map, compiler/tests/*.test.js

## Merge step with lane A (design §10 step 6) — DONE (merged origin/s473-host-allowlist-a @ 752e6861b, #1670)
- known-gaps.md conflict: kept both sides of the url-sink entry (ours resolved, lane A's narrowed note kept below);
  gap ids diffed — none lost.
- host-surface.scrml `runtimeGuardsBuilt` / `brandChecksBuilt` on; analyze hostWalk → `HostBind.guards`;
  print.scrml hostBindJs routes through rt.hostInert / hostUrl / hostSetAttrName + hostAttrValue; interface results
  decode as `{ k: "iface", name }` (brand check).
- runtime.js (lane A's file, minimal merge fix): hostCall passed a guard's E-HOST-RECEIVER-RT through as
  E-HOST-THROW-RT; now guard traps (module-private WeakSet) pass through as themselves.
- H.4 = lane A's HOST_INERT_ELEMENTS (ratified); the diff test reads the runtime export (one list).
- Ratified lane A readings into SPEC: bare src export call is A-world (8.6); broken `export…from` = whole-file
  E-IMPORT-004 (rule 3).
- parity test: the 26 `textContent`-write typings are admitted only because their emitted JS goes through hostInert
  (checked per case).

## #1674 combined review fix round (FIX-FIRST → F1, F2, F3, I1)
- F1: guarded(attr-name) refuses every name the markup walk refuses from data — analyze.scrml
  dataAttrRefusal (navSinkCodeOf / styleAttrFromData / baseHrefFromData / sheetHrefFromData, the markup
  walk's own predicates, now shared), over every H.4 tag, whatever the value. runtime.js: rt.attr's walls
  extracted to refusedDataAttrWrite; hostAttrValue = those walls + writeGuardOf (one write path).
  H-094 CSSStyleDeclaration.setProperty REMOVED (id not reused); entryConflict refuses any CSS value write.
- F2: brand by identity for the Window / Location singletons, a method brand (unobserve on a detached
  div) for ResizeObserver; Chromium test: real passes / 3 fakes fail for all 35 interfaces, other-realm
  window / location fail.
- F3: SPEC 8.5 / §19.17 / §21.3.3 / §34 state the exact-prototype rule; 8.7 the WebIDL brand, the
  singletons, and that a customized built-in fails its base interface (D2).
- I1: createElement result declared as a subinterface of its tag's interface → E-HOST-RESULT-TYPE.
