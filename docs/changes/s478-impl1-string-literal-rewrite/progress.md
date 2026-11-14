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
