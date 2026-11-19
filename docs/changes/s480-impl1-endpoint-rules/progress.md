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
