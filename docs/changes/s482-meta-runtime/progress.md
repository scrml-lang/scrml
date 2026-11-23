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

## Remaining
