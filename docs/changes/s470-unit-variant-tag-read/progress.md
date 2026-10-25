# s470-unit-variant-tag-read — progress

Defect: `x.variant` on a unit enum variant value (bare tag string, §51.3.2) read `undefined`,
so `x.variant == "Gone"` disagreed with `x is .Gone` (a "reject when Gone" gate failed open).

## Log
- [x] Repro (copied b12.mjs) — V2 FAIL on base, all four sides.
- [x] Lowering: `emit-expr.ts emitMember` → `lowerVariantTagRead` (is-predicate-lowering.ts).
      Places (assign target / ++ / delete / method callee) keep the plain member (`emitPlace`).
      Repro V1–V5 PASS on all four sides.
- [ ] String path (rewrite.ts escape-hatch raw text) — investigate.
- [ ] Value sources: literal, return, cell, tape element, struct field, match result, import.
- [ ] Unit tests.
- [ ] Security pack family r16.
- [ ] R26 corpus diff.
- [ ] CI job commands.
