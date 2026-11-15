# s478-impl1-string-literal-rewrite — progress

Gap: g-impl1-bootstrap-build-rewrites-string-literals-s473 (MED). Siblings closed by the same root fix:
g-match-arm-string-literal-fn-rewritten-to-function (HIGH),
g-match-arm-string-literal-paren-dot-capital-rewritten-as-enum-variant (MED).
Authorization: S471 bootstrap-build carve-out (impl#1 builds the bootstrap; this defect miscompiles bootstrap source).

## Reproduction (base 314bad402)
Match-arm results take the string-rewrite path (`rewriteExpr`). On base:
- `.A :> "a pure fn body"` → `"a pure function body"` (silent).
- `.A :> \`tmpl fn text ${n}\`` → `` `tmpl function text ${n}` `` (silent).
- `.C :> 'single fn Qz'` → `"single function Qz"` (silent).
- `.C :> "x is .A here"` → `"x === "A" here"` → E-CODEGEN-INVALID-LOGIC.
- `.B :> msg("see (a). Call it")` → `"see (a)"Call" it"` → E-CODEGEN-INVALID-LOGIC.
- `` `hole ${h is .A ? "y" : "n"} and is .B` `` → hole lowered (correct), text `is .B` → `=== "B"` (corrupt).
After the fix every literal is emitted verbatim and the hole is still lowered.

## Fix
One shared fence, two shapes, both in `compiler/src/codegen/code-segments.ts` on top of the existing
lexical scanner `rewriteCodeSegments` (map invariant 43: change the pass's INPUT, not its pattern):
- `codeOnlyView(expr)` — same-length view, every non-code char (string, template static text and its
  `${`/`}` delimiters, regex body, comment) → `\u0000`; template holes stay code.
- `replaceInCode(expr, re, rep)` — `replace`, matched on the view, spliced into the original; groups /
  offset come from the original, so a literal a match SPANS (`T.toEnum(")")`) is kept byte for byte.
- `matchAllInCode` — read-only twin for diagnostic scans.

Rule 7 (post-AST regex over text): the structural route is not available for these passes — they run on
the string-rewrite fallback, which exists because the expression parser did not produce an ExprNode for
that text (match-arm results, escape-hatch bodies, handler bodies). The fence is the structural answer at
this layer: the patterns are unchanged, only the text they can see is.

Passes moved onto the fence (rewrite.ts): rewriteFnKeyword, rewriteEnumVariantAccess (all regexes except
the compiler-placeholder unmask), rewriteIsOperator (fallback regexes), rewriteWorkerRefs,
rewriteRequestRefs, rewriteInputStateRefs, rewriteTransitionCalls, rewriteReplayCalls (match + paren
balance), rewriteEnumToEnum, rewriteStructConstruction, rewriteTildeRef, rewriteRenderKeyword
(diagnostic), stripTransitionsBlock, rewriteMatchExpr (keyword, braces, the `- >` repair),
rewriteInlineFunctionBodies.

Already literal-aware (unchanged): rewriteNotKeyword, rewriteBooleanKeywords, lowerIsPlaceholders,
rewriteIsVariantWithOperand, rewriteVariantTagReads, rewriteNavigateCalls, rewriteSqlRefs,
stripInlineMatchArmLhsQualifiers, _rewritePayloadVariantConstructorCalls, rewriteReactiveRefs,
rewriteServerReactiveRefs, rewriteResetCalls, rewriteReactiveAssign, rewriteTemplateAttrValue.

## Real-input checks
- Bootstrap bundle (slice-m2 `buildBundleChunks`, 29 chunks), base impl#1 vs patched impl#1: BYTE-IDENTICAL.
  The tree's bootstrap source carries the workarounds (refusals.scrml `FN`/`IS`/`DOT` piece-built words,
  analyze.scrml `clockInPureText`), so no literal in it is corrupted today.
- Probe (scratch edit, reverted): the workarounds inlined back to plain literals. Base impl#1 REFUSES the
  bundle (`E-CODEGEN-INVALID-LOGIC` in refusals.client.js: `"<x:T" + "="V" single>"`). Patched impl#1 builds
  it, and every changed line is the literal written verbatim (`` `fn` ``, `is`, `.V(a, b)`, `EnumType.variants`,
  `Role.Admin`, the resolveHost "`fn " + name + "` is pure" arm) plus the build-admit hash.
- corpus-emit-differential, roots samples + conformance: 2780 sources / 7966 artifacts, VERDICT NO DIFFERENCES.
- failable-probe-pack (the single-file shard) base 334.1 s vs head 334.7 s under the same load: no slowdown.
- `bun run types:check`: OK, unchanged.

## Log
- start 314bad402; WIP commits 35dd9e776, 05aa0f2e5, dc43195d7.
- Hook: 54658 pass / 0 fail (one earlier run timed out on the single-file shard under machine load avg 22).

## Fix round 1 (review of e31a3a762)
- F1 FIXED — library mode (`emit-library.ts`, verbatim block + region paths) ran
  `rewriteIsOperator(rewriteNotKeyword(line))` per line; the line closing a multi-line template / block
  comment had its closer read as an opener. Both paths now run the passes over the whole text (the per-line
  split only skipped `//` lines; the fence handles comments itself). `rewriteIsVariantWithOperand` blanked
  comments in its OUTPUT, which over a whole block would have erased every doc comment: it now blanks only
  the copy it reads (operand taken from it, as before) and splices into the original. Also fixes the
  pre-existing base failures on the same path (`is not` / `is some` after a multi-line closer; base
  rewrote `is .A` inside a multi-line block comment's second line).
- F4 FIXED — `rewriteCodeSegments` re-built `ctx + segment` at every `/` and `regexAllowedAfter` walked
  back over a whole parenthesised inside after every `)`. Now a `CodeContext` (chars appended once, `)`→`(`
  recorded on the way in); `regexAllowedAfter` keeps one definition (`regexAllowedAfterIn`). 300 KB of
  `let q = (a + b) / c / 2 + f(x) / 3; s = "fn"` lines, IsOperator+Fn+EnumVariantAccess: base 0.7 ms,
  e31a3a762 11275 ms, now 129 ms (18 KB 14 ms, 72 KB 32 ms). Nested `((x) / fn) / fn …` depth 20000:
  2485 ms → 17 ms. Pre-existing and unchanged in kind: `rewriteIsVariantWithOperand` re-masks per
  `<operand> is .V` match (base 52.6 s on 300 KB of such lines; now 16.5 s because the mask is linear).
- F2 LEFT — `}` before `/` stays a regex opener: `{…} / n` (object-literal division) is always NaN, while
  `}` closing a block before a statement-position regex is real code, and the same lean is in the
  shared `regexAllowedAfter` the tokenizer invariant pins. A misread is bounded to the line (an
  unterminated regex returns to code at `\n`).
- F3 LEFT — an unpaired `'` cannot reach these passes from valid source: markup prose goes to HTML, and
  comments / strings / templates are fenced before the apostrophe is seen. Probed: markup prose with
  `Don't do fn here, x is .A`, `// Don't` and `/* Don't */` lines, `"it's fn"`, `` `don't ${u}` `` — all
  verbatim. Markup inside a library `${}` block is refused on base and head alike (E-CODEGEN-INVALID-LOGIC).
- ALSO FIXED (same class, found while probing F3) — emit-library's own `\bfn\s+X` → `function X` regexes
  were unfenced: library `"a pure fn body"` shipped as `"a pure function body"`, and `// call fn` + newline
  + `export const k = 2` became one comment line, silently dropping `k` from the module (base too). Now
  `replaceInCode`.
- Emit differential base 314bad402 vs round-1 head, samples + conformance: 2780 sources, 7966 artifacts,
  compile/diagnostic/syntax deltas 0; 134 artifact diffs, all the embedded compiler-root path (24 bytes,
  the two checkout paths' length difference) — 0 after path normalization. Bootstrap bundle (29 chunks)
  base vs head: byte-identical.
