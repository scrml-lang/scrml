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

## Merge step with lane A (design §10 step 6)
- flip host-surface.scrml `runtimeGuardsBuilt` / `brandChecksBuilt`;
- emit the guard calls from print.scrml hostBindJs (descriptor for an interface is `{ k: "handle", name: "<Interface>" }`);
- add the now-admitted guarded typings to the parity test's ADMITTED_BY_DESIGN list.
