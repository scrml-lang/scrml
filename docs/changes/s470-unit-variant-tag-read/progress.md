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
- [x] R26 corpus diff (3618 sources: examples, samples, conformance, stdlib, benchmarks, docs,
      compiler/samples incl. mcp-v0-fixture; one compile per file, each tree's own compiler + stdlib;
      base = merge parent accdd5f2). Diagnostic codes: 0 programs differ. Emitted-JS digest (build
      identity folded): 215 differ — 202 only by the embedded `_scrml_project_root` (the two trees live
      at different paths; equal once both roots are folded), 13 by the lowering alone (equal once the
      lowered forms are undone): 12 engine / machine samples rendering `${@cell.variant}` (a unit
      variant engine cell rendered `undefined`; now the tag) and stdlib/data/validate.scrml
      (`typeof rule == "object" ? rule.variant : rule` — same value, the read is lowered inside the
      object branch).
- [x] CI job commands: types-gate OK (unchanged), s34-census --check-new PASS, conflict-marker PASS,
      ci-shards needs OK, SPEC-INDEX OK, delta-lint PASS, gen-md-shim current, root tests 0 fail,
      snippet-gate 0 fail, claim-gate 0 fail, corpus-compile-floor PASS, unit+integration+conformance
      0 fail, lsp+commands 0 fail, todomvc gauntlet ok, browser-baseline PASS, e2e-render-map 0 fail,
      slices 0 fail, no-default-arm 0, host-global-scan 0 violations. Runtime-size ratchet: 11 pass;
      runtime-template.js / compiler/runtime untouched, delta 0 B (no budget change needed).

## Fix round 1 (review of be176f6ff)
- [x] F1 `<each>` rows: emit-each.ts `rewriteAtCellAccess` (every caller emits CODE: row
      expressions via `rewriteIterValueExpr` / `lowerEachExpr`, `in=` / `of=` iterables, `<empty :>`
      bodies) now ends with the tag pass; the `:`-shorthand body and the `key=` expression too.
      Re-parsed lowered text is not lowered twice (emitTernary recognizes the trivial form;
      emitMember skips the reserved IIFE parameter).
- [x] F2 destructuring: a top-level `variant` key in a `let` / `const` pattern splits the
      declaration (temp, then destructure from `variantDestructureSource(temp)`); a nested
      `{ e: { variant } }` binds the field twice (temp + pattern, `variant` defaulting to the temp
      when it is a tag string); a `variant` key where neither works (a parameter, a `for` head, an
      assignment pattern, an array element) is refused E-CODEGEN-INVALID-LOGIC.
- [x] F3 `x["variant"]` / `x?.["variant"]` lowered (structured emitIndex + text pass). A dynamic key
      `x[k]` keeps the plain JS read (candidate LOW gap).
- [x] F4 places: assignment patterns (structured array/object targets; escape-hatch `*Pattern`
      targets suppress the text pass), a comment before the operator, `for (x.variant of/in …)`,
      `x.variant?.()`.
- [x] F5 library verbatim path: the tag pass runs over the whole text, so a multi-line template
      literal is masked (lib/ml.scrml now unchanged vs base). The `is` / `not` per-line corruption
      inside a template (lib/ml2.scrml) is NOT fixed by this (those passes stay per line).
- [x] F6 `x is AuthErr.Denied` / `AuthErr::Denied`: the parser folds it into one dotted ident; emitBinary
      now treats it as a variant test (it compared against the constructor) — every side, not only
      the server arm.
- [x] F7 `new X() is .V` / `new X().variant` take the whole `new X()` as the operand; a comment
      before `is` is blanked first.
