# s480-build-mode — progress

Rulings: user-voice-scrml.md "⭐ RULED — the rest of S478 hand-off §3.B, PA recs adopted (S479)" items 10 and 16.

- [x] Item 10 — build mode: `scrml-boot compile` production (default), `--dev` / `scrml-boot dev` development.
  Mode reaches the artifact through `compileSource({ dev })` → print-server.scrml `printServerBuild`;
  a dev server wraps its host in `rt.devBuild`; a host `dev: true` flag decides nothing (fails safe).
  Audit of mode-keyed behaviour: driver text on the wire (only one); reload snippet + diagnostics overlay
  are injected by the dev server at serve time; no source maps. `log()` itself stays unbuilt (refused by name).
- [x] Item 16 — withhold driver text from every value a route delivers: route returned value, route failure
  (now type-directed), `<endpoint>` arm answer; endpoint non-JSON body message carries no host parser text
  in production. Channels carry no server author code; the bootstrap has no SSR.
- [x] SPEC §19.8.4 / §19.9.1 / §20.6.5; known-gaps markers; coverage rows.
- [x] Tests: slice-m4/build-mode-s480.test.js (25; 12 red on base).
- [ ] Final verification: pretest, conformance, CI gates, byte-compare, corpus.
