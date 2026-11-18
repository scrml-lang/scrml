# s479-ruled-endpoint-stdlib — progress

Ruling: user-voice-scrml.md "⭐ RULED — S478 hand-off §3.A and §3.B, PA recs adopted (S479, 2026-11-18)", items 5 and 6.

- [ ] SPEC: §61.7 E-ENDPOINT-PATH-INVALID + `/_scrml_local/` reserved; §61.3 duplicate keys → Malformed; §61.9; §34 rows
- [ ] SPEC: §41.13 strict keys + E-TYPE-080; alias accepted; §19.3.3 OPEN marker
- [ ] bootstrap: analyze endpointPass (PATH-INVALID code, `/_scrml_local/`)
- [ ] bootstrap: server-runtime duplicate-key detector
- [ ] bootstrap: resolveParseVariant accepts alias
- [ ] tests + conformance cases; corpus measure; gates; PR

Base conformance (origin/main 8341538ba): PASS 645 / FAIL 12 / CRASH 0.
