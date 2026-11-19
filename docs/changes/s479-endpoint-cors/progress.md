# s479-endpoint-cors — progress

Rulings (scrml-support/user-voice-scrml.md):
- "⭐ RULED — program `cors=` does not cover `<endpoint>` routes; per-endpoint `cors=` (S479, 2026-11-18)"
- "⭐ RULED — #1962 file-scope questions 1–4 + `parseVariant` duplicate keys" item 5

## Done
- SPEC: §39.2 table row, §39.2.1 scoping sentence + `cors-max-age=` sentence, §61.2 `cors-attr`, §61.5 rationale, §61.7 `cors=` bullet + OPTIONS clause, §41.13 "A repeated key" + Malformed semantics.
- impl#1 (carve-out): ast-builder.js reads `cors=` on `<endpoint>`; emit-server.ts — endpoint CORS table, `_scrml_endpoint_preflight`, `_scrml_is_endpoint_route`, per-endpoint header wrapper, OPTIONS route per endpoint path; program CORS stage/`/*` route/headers skip endpoint routes.
- Test: compiler/tests/integration/endpoint-cors-served.test.js (11/15 red on base).
- Bootstrap: `cors=` on `<endpoint>` refused by name (parse.scrml); `jsonRepeatedKey` moved to runtime.js, used by `parseVariant` string path; server-runtime re-exports.
- Tests: endpoint-s478.test.js (cors refusal), parse-variant-s478.test.js (repeated key).
- Conformance: endpoint/cors-attr-clean, parse-variant/error-repeated-key (impl1 xfail).
- Gaps: g-impl1-endpoint-cors-scoping-s479 (resolved), g-boot-endpoint-cors-unbuilt-s479, g-impl1-parsevariant-repeated-key-s479, g-impl1-endpoint-double-parse-no-body-ceiling-s479.

## Next
- pretest, bootstrap tests, conformance before/after, gates, commit, PR.
