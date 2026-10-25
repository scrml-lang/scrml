# s470-unit-variant-tag-read — progress

Defect: `x.variant` on a unit enum variant value (bare tag string, §51.3.2) read `undefined`,
so `x.variant == "Gone"` disagreed with `x is .Gone` (a "reject when Gone" gate failed open).
Base: main `d582ae04f`.

## Where the lowering happens
- `is-predicate-lowering.ts lowerVariantTagRead` — the one form: `typeof x === "string" ? x : x.variant`
  (bare name inline; anything else bound once by an arrow IIFE; `?.` kept for an optional chain).
  Narrower than the match dispatcher's `typeof x === "object" ? x.variant : x` on purpose: only the
  receiver JS gets wrong (a string) changes; every other receiver keeps the exact JS member read.
- Structured path: `emit-expr.ts emitMember` — every `.variant` value read. Codegen has no static
  receiver type at a member site, and a unit variant arrives from every value source, so the read is
  lowered wherever it is emitted, not only where an enum type is written. Places (`emitPlace`: an
  assign / `++` / `--` / `delete` target, a method callee, a `new` callee) keep the plain member.
- Client template literal with no `@`: routed through the structured template emitter when it reads
  `.variant` (it was emitted as raw bytes).
- String path: `rewrite.ts rewriteVariantTagReads` — last pass of both client and server pipelines
  (handler attributes, `match` arms lowered from text, function values, server text lowering).
  Masks literal/comment text through `rewriteCodeSegments`; operand by a `?.`-aware twin of
  `_scanChainStartLeft`; skips places, compiler temporaries (`_scrml_*`, `__scrml_is_v`) and reads
  already lowered.
- `emit-reactive-wiring.ts isVariantReadOrphanChain` — the "pure read orphan" filter for markup
  interpolations matched emitted TEXT; the lowered form escaped it and `${@ph.variant}` leaked a dead
  file-scope statement (which throws over a `null` placeholder). Decided on the tree now for chains
  with a `.variant` link, mirroring exactly what the regex skipped for the plain member.

## Log
- [x] Repro (copied b12.mjs) — V2 FAIL on base, all four sides; PASS after.
- [x] Lowering (structured + string path + template gate + orphan filter).
- [x] Value sources: literal, return, cell, tape element, struct field, match result, import, callback,
      function value, `?.`, template; client positions (markup, derived, `if=`, lift row, handlers, `when`).
- [x] `is .V` verified on every side. BROKEN on base in a `match` arm lowered from text (client and
      library): `rewriteIsOperator` wrote `x === "Denied"`, false for a payload variant. Fixed:
      `rewriteIsVariantWithOperand` lowers `<operand> is .V` through `lowerVariantCheck`; the old regexes
      remain only for an operand the scan cannot read. emit-library's verbatim line path also gets
      `rewriteVariantTagReads`.
- [x] Hook round 1 failed: the text pass re-lowered `lowerVariantCheck`'s own `__v.variant` reads
      (is-predicate-in-function-expression-1333). Skipped now (token-spacing tolerant), unit-tested.
- [x] Unit tests: compiler/tests/unit/variant-tag-read-s470.test.js.
- [x] Security pack r16 (s19/f22/l14/t14, 118 shapes): base 88 FAIL / 28 PASS / 1 REFUSED / 1 UNJUDGED;
      head 116 PASS / 1 REFUSED / 1 UNJUDGED.
- [ ] R26 corpus diff.
- [ ] CI job commands.
