# s482-meta-runtime — progress

Lane: `^{}` phase 2 — RUNTIME meta blocks in the bootstrap (gap g-boot-meta-runtime-unbuilt-s481).
Brief: ~/.cache/scrml/review/s482-briefs/meta-phase2.md. Rulings: ruling:user-voice-scrml.md-S481-meta-four.
Base: origin/main ba34ad0ba (contains #2045). Scratch: ~/.cache/scrml/review/s482-meta-runtime/.

## Design (decided at start)
- AST: a runtime block at a MARKUP position becomes `ANodeK.Run(b, meta: <scopeId>)` (meta "" = an ordinary
  body-top run). Its body is wrapped in a bare `{ … }` block so its locals are per run (never hoisted to file scope).
  Analysis then treats it as a run (names, types, DG reads, lin, sql) — exceptions keyed on `meta != ""`.
- meta.scrml rewrites the body before analysis: `meta.get("x")` → `@x`; `meta.set("x", v);` → `@x = v;`;
  `meta.bindings.x` → `@x` (cell) / `x`; `meta.scopeId` → the string literal; `meta.emit/cleanup/interval/timeout/
  clearInterval/clearTimeout(…)` → a call on the reserved receiver `^` (no identifier spells it).
  Refused by name (INTERIM): computed names (ruling item 2), `meta.subscribe`, `meta.types` / runtime `reflect`,
  a runtime block at a logic position, in an `<each>` row (E-META-001, Q7), in a component / `if=` region.
- Core: `View.Meta(id, body)`; PrimOps for the meta calls. Print: placeholder `<span data-scrml-meta="id"></span>`
  + `rt.metaEffect(scope, "id", (meta$) => {…})`.
- Runtime: impl#1 runtime-meta-emit-gate.js + markup-attr-allow-list.js + form-member table + css-attr guard copied
  VERBATIM between markers (sync script + drift test); `metaEffect` on the runtime's tracking.

## Done (committed)
- [x] afe42a411 runtime: impl#1 gate verbatim between markers (scripts/sync-bootstrap-meta-emit-gate.ts, drift test
      compiler/tests/unit/bootstrap-meta-emit-gate-verbatim.test.js; url-guard test excludes the block) + MetaEffect.
- [x] compiler: ast ANodeK.Run(b, meta); core View.Run(…, meta) + Meta* PrimOps; meta.scrml runtimeBlock / rtForm /
      rtSetStmt (MC.rt / MC.wh); analyze resolveMetaCall / typeMetaCall / resolveMetaCallback / resolveRunNode /
      lamEvalWhy; lower runView / methodExpr; print runHole / runOrMetaJs / primJs.
- [x] tests: slice-m4/meta-runtime-s482.test.js (30 + 2 Chromium) — red on base (28 fail); meta-s481 updated (2 tests).

## Findings
- impl#1 tracks ONLY meta.get (+ bindings getters): a direct `@x` read or one in a called function is no dependency
  (probe p/track.scrml: "direct 1 / get 5 / fn 1"). Bootstrap matches (body untracked; meta$.get thunks tracked).
- Q11 probe: impl#1 "run1;meta1;run2;meta2;" — bootstrap the same (first run inline). Not a STOP.
- Emits during a mount's render are held until the placeholder is in the page (the gate's page-form judgement needs it).
- conformance meta: 64 PASS / 1 FAIL (meta-proto-cell-name-pos: `"<p>" + meta.get("constructor")` with an int cell —
  E-OPERATOR-OPERAND-TYPE, S440 Gotcha Q1; the bootstrap types meta.get as the cell) / 1 UNSUPPORTED (log) / 2 NOT-TWINNED.
- corpus (71 `^{` programs, migrated as s481): base 19 OK → head 27 OK.

## Remaining
- SPEC §22 status notes; known-gaps (resolve g-boot-meta-runtime-unbuilt-s481, file g-boot-meta-runtime-residue-s482,
  bindings snapshot, timer id type); bootstrap-spec-coverage rows.
- final gates (pretest, full conformance base vs head, impl#1 -t meta, byte-compare non-meta, corpus, CI checks).
