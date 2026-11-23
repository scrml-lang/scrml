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

- [x] 9535ff6d1 the compiler half (hook PASS 57848/0).
- [x] records: SPEC §22.5 bootstrap status, §22.7 note (Q9), §22.11 E-META-001 (Q7); known-gaps:
      g-boot-meta-runtime-unbuilt-s481 RESOLVED, new g-boot-meta-runtime-residue-s482 (MED) +
      g-boot-meta-get-typed-cell-s482 (LOW owner Q), g-fix-seed-refuses-meta-block-s481 S482 note; coverage §22 rows.
      meta.bindings of a let / body-top local refused by name (no per-run snapshot) + 2 tests.

## Final gates (working tree = final content)
- pretest rc 0. Bootstrap conformance base ba34ad0ba 816/3/628/517/0 → head 841/4/628/491/0 (PASS/FAIL/NT/UNSUP/CRASH):
  25 UNSUPPORTED→PASS (all meta runtime), 1 UNSUPPORTED→FAIL (meta-proto-cell-name-pos), 0 PASS→other, CRASH 0.
- impl#1 `conformance-corpus.test.js -t meta` 68/68. Emitted output (1964 cases, as written) base vs head: 26 diffs,
  all meta runtime cases; 0 non-meta.
- corpus (71): base 19 OK → head 28 OK; newly-rejecting 0 (every changed file was refused on base); E-SCOPE-001
  literal-no-cell: 0.
- CI checks: s34-census --check-new PASS, types-gate --check OK, snippet-gate 0 fail, claim-gate 0 fail,
  corpus-compile-floor --check PASS, gen-md-shim current, e2e-render-map 259/0; gen-bootstrap-severity --check
  exit 4 on base and head alike (bot-owned; no new codes).

## Remaining
- commit records; push; PR.
