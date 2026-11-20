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
- [x] Conformance case `sql/driver-text-returned-withheld-rt` (pins the carried impl#1 gap; FAIL on base, PASS on head).
- [x] Final verification: pretest; bootstrap conformance base 734 PASS / 1 FAIL (the new case) → head 735 PASS,
  CRASH 0, no PASS→FAIL; s34-census, types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim all
  exit 0; host-global-scan 1/2 + 2/2 clean (new case pinned in known-throws). Byte-compare over 1921 conformance
  cases: html / client / codes identical; the 36 server artifacts differ ONLY in the createServer comment line.
  Corpus: no new refusal (diagnostic codes identical on every case) — newly-rejecting 0.

## r1 fix round (security review #2011, LAND-W-F/U)
- [x] F1 (MED): a DEVELOPMENT build (`scrml-boot dev`, `compile --dev`) defaults to `dist/<name>.dev/`
  (scripts/scrml-boot.ts `defaultOutDir(entry, dev)`), never the production `dist/<name>/`; a dev
  artifact's server logs "scrml server: DEVELOPMENT build — do not deploy …" once at createServer
  (server-runtime.js `server`); production logs nothing new.
- [x] F2+F3 (LOW): no AsyncLocalStorage → `server` throws (fail closed); the UNSCOPED process-wide
  fallback is removed. SPEC §19.9.1 "Every value a route delivers": one sentence.
- [x] F4 (INFO): note on g-boot-refinement-runtime-checks-s478.
- Tests: build-mode-s480.test.js describe F (4 tests, all red on d5fda3557).
