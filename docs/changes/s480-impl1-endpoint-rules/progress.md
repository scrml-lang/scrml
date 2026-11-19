# s480-impl1-endpoint-rules — progress

Lane: impl#1 carve-out 1 (endpoint 415 / strict keys + cors= exclusion), widened by
ruling:user-voice-scrml.md-S480-four-recs item 1 (§61.2 placement + §61.7 duplicate routes).

## Plan
1. ast-builder: tighten ENDPOINT_CORS_ORIGIN_RE (serialized origin); refuse a repeated `cors=`
   (E-ENDPOINT-CORS-INVALID); `endpoint` joins STRUCTURAL_ELEMENT_PLACEMENT (`${}` locus);
   TAB markup-locus placement walk (page / channel / nested program / element / outside program).
2. new compiler/src/endpoint-program-rules.ts: build-level §61.2 non-entry rule + §61.7
   duplicate path+method (within a file and across files); wired in api.js after the
   implied-ancestor stamp.
3. emit-server: route export name from method+path (app-unique); Max-Age from the entry program.
4. tests (served multi-file via `scrml build` + `_server.js`), SPEC §34/§61 provenance, gaps.

## Log
- C1: ast-builder (origin tightening, repeated cors=, endpoint placement walk + `${}` locus),
  endpoint-program-rules.ts (non-entry + duplicates, wired in api.js), emit-server (method+path
  route names; Max-Age from the entry program), index.ts plumbing; tests updated + new served file.
  (Hook: first run red on dbvar-tag-shared-type-singletons — a fixture `<endpoint>` outside a
  `<program>`; wrapped. Full unit+integration+conformance then 0 fail; hook PASS.)
- Verified: new tests red on origin/main (29 fail across the two served files); byte-identity over
  2,215 `<endpoint>`-free programs (examples/, samples/compilation-tests/, conformance cases) —
  0 differing output files; newly-rejecting corpus = 0 of 33 `<endpoint>`-bearing files
  (examples/, samples/, benchmarks/, conformance/, docs/).
- C2: SPEC §61.2 / §61.7 / §61.9 provenance + §34 rows (E-STRUCTURAL-ELEMENT-MISPLACED,
  E-ENDPOINT-ROUTE-DUPLICATE, E-ENDPOINT-CORS-INVALID); known-gaps: resolve
  g-impl1-endpoint-route-name-collides-across-files-s480, narrow g-boot-endpoint-residue-s478
  item 3, file g-impl1-endpoint-entry-ambiguous-app-s480 (INTERIM). Gates: s34-census
  --check-new PASS, types-gate unchanged, snippet-gate / claim-gate 0 fail, corpus floor PASS,
  gen-md-shim current, bootstrap conformance CRASH 0 / FAIL 0.
