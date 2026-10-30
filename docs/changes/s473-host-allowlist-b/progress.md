# s473-host-allowlist-b — `<host>` rule 8 allowlist, LANE B

Base: `origin/s473-boot-host-block-f3` (PR #1659, the INTERIM fail-closed denylist).
Brief: `~/.cache/scrml-agent-tmp/pa-s473/allowlist-brief.md`.
Design: `scrml-support/docs/deep-dives/host-binding-allowlist-design-2026-10-29.md` (§5, §6, §8, §9, §10).
Rulings: user-voice-scrml.md S473 "⭐ RULED — `<host>` rule 8 moves from a sink denylist to an allowlist"
and "⭐ RULED — S473 PA recs: host allowlist Q1–Q4, …" item 1 (Q1–Q4).

Lane B scope: DRAFT SPEC (§21.3.3 rule 8, Appendix H, §34 codes, regen); `host-surface.scrml` +
Appendix-H diff test; the typed chain walk (replaces hostSinkWords/hostDocWord/hostWinWord/
hostReflectWord/hostSinkWhy once refusal parity is proven); Appendix H names as built-in host
types; one shared sink source with url.scrml; compile-side must-refuse tests (R1, R2, every H1 row).
Lane A (s473-host-allowlist-a) owns slice-m1/runtime/runtime.js and the `src=` static export read.

## Log
- [ ] SPEC DRAFT
- [ ] host-surface.scrml + diff test
- [ ] built-in host types
- [ ] typed chain walk (parity, then delete the denylist)
- [ ] tests re-coded; R1 / R2 / H1 must-refuse
- [ ] gates (m1–m4, lane tests, types-gate, s34-census, e2e-render-map, claim gate)
