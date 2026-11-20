# s480-impl1-css-url — progress

Ruling: user-voice-scrml.md S479 "⭐ RULED — the rest of S478 hand-off §3.B" item 21
(`ruling:user-voice-scrml.md-S479-3B-rest-item-21`) — impl#1 carve-out 2 (CSS-url attributes and
data-written stylesheet `href` only). Gap: g-impl1-svg-css-url-attr-and-link-stylesheet-href-unguarded-s473.

## Done
- [x] runtime: `compiler/src/runtime-css-attr-guard.js` (+ .d.ts) — `_scrml_css_attr_set`, `_scrml_link_href_set`;
      bootstrap reader ported verbatim; new chunk 'cssattrguard' (→ urlguard, errors), post-emit gated.
- [x] codegen: `url-attr-guard.ts` `dataAttrWriteGuard` / `guardedAttrWrite`; every data-attr writer
      (emit-lift ×6, emit-each, emit-bindings, emit-event-wiring `emitValueAttrApply`, emit-variant-guard,
      emit-html stamps) emits the setter for a guarded write; byte-identical otherwise.
- [x] SSR rows: a guarded attr makes the each fall back (SsrUnsupported).
- [x] compile: E-ATTR-STYLESHEET-HREF in `attr-injection-sink.ts`, asked by `collectExecutableSinkErrors`
      (VP-3 / post-meta / CE definitions); api.js dedupe (`SH|`).
- [x] tests: `compiler/tests/integration/s480-impl1-css-url-attr-guard.test.js` (63); chunk count 46→47.
- [x] conformance: 3 new `attr-executable-sink/` cases — PASS on the bootstrap; impl#1 base fails the
      runtime + neg ones.
- [x] SPEC §5.2 / §34 provenance; gap resolved; new LOW gap g-impl1-link-bound-attr-dropped-s480.

## Final gates (head ffe361808)
- [x] pretest exit 0; bootstrap-conformance PASS 737→740 (the 3 new cases), FAIL 0, CRASH 0.
- [x] s34-census, types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim: all pass.
- [x] host-global-scan 1/2 + 2/2: exit 0.
- [x] byte-compare (impl#1, all 1935 conformance cases, fixed tmp path): 4 differ — 2 new cases;
      bound-svg-animation-runtime-guard (computed `attributeName` → `_scrml_css_attr_set(…, "")`, runtime
      gains the cssattrguard chunk); components/missing-required-slot-reject (build id is
      nondeterministic run-to-run on head itself — noise).
- [x] corpus newly-rejecting: 0 (only docs/changes/s473-spec-coverage probes p21/s09/s10, written to show the hole).
- hook flake fixed: the integration test now unregisters happy-dom at file end (it broke the
  security-await-pack CSRF probes later in the same process).
