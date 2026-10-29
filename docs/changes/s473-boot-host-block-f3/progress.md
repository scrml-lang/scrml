# s473-boot-host-block-f3 — progress (append-only)

Lane: build DRAFT SPEC §21.3.3 `<host>` typed host bindings in the bootstrap (`compiler/self-host-v2/`).
impl#1 untouched (S471 policy). Gap: `g-boot-host-block-f3-unbuilt-s473`.

Rulings (verbatim, `scrml-support/user-voice-scrml.md`):
- "⭐ RULED — S473 PA recs, all" item 4: *"F3 typed host binding Q1–Q5: a `<host>` block; `-> waiting T`; `! HostError`; closed `:host` handles; checked results."*
- "⭐ RULED — S473 owner questions round 2, PA recs" item 3: *"Server-side `<host>` bindings: allowed only in compiler-bundled stdlib modules"*; item 7: *"DOM members stay open (Q10 — DOM types do NOT become closed `:host` handles)"*; item 8: *"E-HOST-DUPLICATE folded into E-SCOPE-010"*.

## 2026-10-29T20:15Z — slices 1–3 (parse/typecheck, src= refusal, client emission)

Governing sentences implemented (SPEC §21.3.3):
- rule 1 *"`<host>` SHALL appear at file top level or as a direct child of `<program>`. A `<host>` anywhere else SHALL be `E-HOST-BINDING-PLACEMENT`. It emits no HTML."*
- rule 2 *"Each body line SHALL be a blank line, a `//` comment, a `host-type` line, a `host-binding` line, or a continuation line beginning with `=`. Any other line SHALL be `E-HOST-BINDING-MALFORMED`."*
- rule 3 *"Exports are read statically … The compiler SHALL NOT load, import, or evaluate a `src=` file"* — the static read is NOT built: a valid `src=` is refused by name (E-BOOTSTRAP-UNSUPPORTED); the syntax half (E-HOST-SRC-INVALID / E-IMPORT-005) is built.
- rules 4, 5, 6, 8, 11 (target shape / roots / parameter use / no target / sinks / `fn` roots).
- rule 7 *"A target SHALL be emitted as literal JavaScript at the call site. It SHALL NOT be built with the `Function` constructor"*.
- rule 9 (a binding is a file-scope function; E-CALL-ARITY / E-TYPE-031 / E-SCOPE-010 by construction).
- rule 10 (adopter binding client-only → E-ROUTE-005 / -002; stdlib `<host>` refused by name).
- rule 13 (checked results; N1 struct decode; `Array.isArray` tapes; thenable mismatch with a rejection handler).
- rule 15 (closed handles: E-HOST-TYPE-OUTSIDE, E-HOST-HANDLE-MEMBER, E-EQ-003, E-HOST-HANDLE-NOT-DATA at struct fields / server functions; cells and enum payloads holding a handle refused by name).
- rule 18 (E-HOST-THROW-RT; payload read once, no conversion; `! HostError` refused by name).

Design (proven path, no new reader): a binding line is lexed by the scrml lexer (`lexFrom`, `LexStop.Line`)
over the source CUT at the line end, parsed with `parseParamList` (factored out of `parseFn`), `parseType` and
`parseAssign`; desugared into an ordinary function item (empty body) + a `FileAst.hosts` record; analyze makes
it host-backed (the existing `FnInfo.host` / Core `Fn.host` path, extended with `HostFn.bind`); the printer
emits `rt.hostCall(() => <target>, <descriptor>, at)` with roots read through `rt.hostRoot(…)` (unshadowable).
The import:host loader is never reached for a binding (scrml-boot.ts hostFilesOf and host-files.js skip
`h.bind`), so no host JS is loaded at build time.

Tests: `compiler/self-host-v2/slice-m4/host-block-f3-s473.test.js` — 50 tests. Red on base: all (the file
imports `hostCall` / `hostThrownParts`, absent on base; and on base `<host>` at file top is
E-BOOTSTRAP-UNSUPPORTED, inside `<program>` it silently compiled as an HTML element with page text).

## 2026-10-29T21:10Z — commit 1 landed (cbb872a02); slice 2: SPEC status, §34 rows, gaps, hardening

- SPEC §21.3.3: status banner + an "Implementation status (S473)" paragraph (built / refused by name / not
  expressible / not emitted). §34: the 12 codes the bootstrap now emits name their emitter (parse.scrml /
  analyze.scrml / runtime.js), E-HOST-HANDLE-NOT-DATA as partial, the E-HOST-VALUE-MISMATCH-RT, E-EQ-003 (both
  rows) and E-SCOPE-010 `<host>` clauses updated. No new code minted (s34-census PASS).
- severity.scrml regenerated (13 codes gained rows); SPEC-INDEX regenerated; known-gaps counts by state.ts.
- Gap `g-boot-host-block-f3-unbuilt-s473` NARROWED (remaining list (a)–(k)). Filed:
  `g-spec-host-tape-array-proto-pollution-s473`, `g-spec-host-decode-throw-code-s473`,
  `g-spec-host-sink-aliases-reflect-s473`, `g-boot-host-result-then-getter-raw-s473`.
- Hardening (fail closed, PA readings): rule 8 judged over every chain segment with `document` / `window` aliases
  (`ownerDocument`, `self`, `top`, `parent`, `defaultView`, `contentWindow` …); `Reflect` / `Object.assign` /
  `defineProperty` calls refused by name; a binding the parser accepted that does not convert into Core is
  refused (defect guard), never left an empty-bodied function.
- Gates (local): s34-census, claim-gate, snippet-gate, SPEC-INDEX, delta-lint, conflict-marker, md-shim, severity
  --check, types-gate, corpus-compile-floor: PASS. Slices: no-default-arm, dup-fn, m1 (109), m2 (619), m1
  lowered (109), m3 (60), m4 (3679), codec (166), e2e-render-map (259), bootstrap-conformance --check: PASS.
