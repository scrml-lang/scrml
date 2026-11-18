# s479-ruled-endpoint-stdlib — progress

Ruling: user-voice-scrml.md "⭐ RULED — S478 hand-off §3.A and §3.B, PA recs adopted (S479, 2026-11-18)", items 5 and 6.

- [x] SPEC: §61.7 E-ENDPOINT-PATH-INVALID + `/_scrml_local/` reserved; §61.3 "A repeated key" → Malformed; §61.9; §34 rows (new PATH-INVALID, ROUTE-DUPLICATE amended)
- [x] SPEC: §41.13 strict keys + E-TYPE-080 (was E-MATCH-NOT-EXHAUSTIVE); "An alias of an enum" accepted; §19.3.3 OPEN marker narrowed (the `!` error-type position stays OPEN)
- [x] bootstrap: analyze `endpointPass` (PATH-INVALID code), `endpointReservedWhy` (`/_scrml_local/`)
- [x] bootstrap: server-runtime `jsonRepeatedKey` (after JSON.parse in `handleEndpoint`)
- [x] bootstrap: `resolveParseVariant` follows the alias chain (`aliasedTypeSym`)
- [x] slice tests: endpoint-s478.test.js (B path grammar + `/_scrml_local/`; C repeated keys; E seeded fuzz vs a reference reader), parse-variant-s478.test.js (alias accepted, chain, cross-file, non-enum alias refused, E-TYPE-080, runtime through an alias)
- [x] conformance: 11 new cases (7 endpoint, 4 parse-variant); 8 xfail impl1-ts pinned to 3 new carried gaps
- [x] gaps: g-impl1-endpoint-path-rules-s479, g-impl1-parsevariant-strict-keys-s479, g-impl1-parsevariant-enum-alias-s479 (carried); NARROWED notes on g-boot-endpoint-residue-s478 (item 1), g-boot-endpoint-review-1940-s478 ((2), (4)), g-boot-stdlib-data-residue-s478 ((3), (5), (6))
- [ ] PR

Conformance: base PASS 645 / FAIL 12 / CRASH 0 → head PASS 656 / FAIL 12 / CRASH 0 (+11 new cases, 0 PASS→FAIL).
Corpus: no corpus file (outside the new cases) emits E-ENDPOINT-PATH-INVALID, the `/_scrml_local/` reservation, or names an alias in `parseVariant` — newly-rejecting 0, newly-accepting 0.

Owner question (not ruled, not built): should §41.13 `parseVariant` on a STRING input also refuse a repeated key as `::Malformed`? §61.3 says the endpoint body is decoded "via parseVariant" and impl#1's endpoint literally calls the parseVariant decode, so the two semantics now differ by one rule. Rec: yes — one sentence in §41.13; the bootstrap's `jsonRepeatedKey` is reusable as-is.
