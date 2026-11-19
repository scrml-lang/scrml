# s480-ruled-followups — progress

Ruling: user-voice-scrml.md S480 "⭐ RULED — four open S480 questions (endpoint attrs, onIdle no-op
fire, tool initializers, trailing-dot origins), PA recs adopted" (`ruling:user-voice-scrml.md-S480-four-recs-2`).

## Items

1. **E-ENDPOINT-ATTR-INVALID** (item 1) — built.
   - impl#1 (carve-out 1): `compiler/src/ast-builder.js`, the `block.name === "endpoint"` dispatch,
     after the repeated-attribute checks; `readEndpointOpenerAttrs` marks a name flush against a
     dropped character (`method='POST'` reads `POST` as a name) `inDropped`, which is skipped (that
     run is already E-ATTR-001).
   - bootstrap: `compiler/self-host-v2/parse.scrml` `endpointItem` — the generic refusal, `csrf=` and
     validator calls move from E-BOOTSTRAP-UNSUPPORTED to E-ENDPOINT-ATTR-INVALID. (`x:cors="*"` is a
     typed attribute there, so the opener is a declaration — E-NAME-COLLIDES-RESERVED; refused either way.)
   - SPEC §61.2 sentence, §61.9 entry, §34 row; severity.scrml regenerated.
   - conformance `endpoint/attr-invalid-misspelled-cors`.
   - corpus: 0 of 33 `<endpoint>`-bearing files newly rejected (impl#1).
   - tests: compiler/tests/integration/endpoint-{opener-closed-grammar,attrs-path-rules,cors-multifile}-served
     (`note=` controls moved to the new code); slice-m4/endpoint-s478.test.js.
2. **Tool initializers** (item 3) — built: `print-server.scrml` `printTool` prints every
   `CoreProgram.consts` entry; `serverReach(…, everyInit)`. SPEC §7.6 rule (a)/(b) sentence + §64.1.
   Test slice-m4/tool-init-s480.test.js (red on base: exit 32 / 0).
3. **Markers** — (a) §51.0.R + §6.13.5 onIdle no-op fire ratified, gap resolved; (b) §61.7
   trailing-dot citation; (c) §38.4.3 already RULED on main (no marker left) — dropped.

## Status
- [x] implementation + tests (touched tests green)
- [ ] commit / final gates / PR
