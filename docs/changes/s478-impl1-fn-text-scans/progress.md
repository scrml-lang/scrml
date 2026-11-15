# s478-impl1-fn-text-scans — progress

Gaps: g-fn-004-text-scan-fires-on-string-literal (flipped to resolved), g-fn-001-text-scan-fires-on-string-literal
(filed + resolved), g-input-ref-rewritten-inside-string-literal (filed + resolved). Filed open (residue, not fixed):
g-block-splitter-sql-sigil-inside-string-literal, g-template-hole-input-ref-unlowered-placeholder.
Authorization: S471 bootstrap-build carve-out (impl#1 builds the bootstrap; each defect forced a workaround in the
bootstrap source). Reported by the s478-boot-drop-literal-workarounds lane.

## Reproduction (base 9ce3f6ec9)
- `fn sqlMsg() -> string { return "a ?{ query } sigil" }` → E-FN-001.
- ``fn clockMsg() -> string { return "`Date.now()` is non-deterministic" }`` → E-FN-004.
- `fn m() -> string { return "read <#id>.error" }` → exit 0, `.client.js` has `"read _scrml_input_id_.error"`.
  Template text and single-quoted strings: the same. `"call <#w>.send(x)"` → `_scrml_worker_w.send(`.

## Fix
1 + 2 — `checkFnBodyProhibitions` (type-system.ts). `nodeText` is split into `nodeTextParts`; the new
`nodeCodeText` runs each part through `codeOnlyView` (code-segments.ts, map invariant 43) and joins them. The
text heuristics read it: E-FN-001 `/\?\{/`, E-FN-003 call-of-a-`function` CALL_RE, E-FN-004 `NON_DET_CALLS`
`includes`, the E-FN-004 GLOBAL_READ_RE (and its prev-char guard), the E-FN-004 scrml:time / scrml:random
bare-call scan, E-FN-002 `DOM_MUTATION_APIS` `includes`, and the E-FN-008 `~`-mention check
(`textMentionsTilde`). A template's `${…}` hole is code and still fires. A markup-shaped part (`<…`) is
scanned as written: its prose apostrophes would read as string openers and blank real code.
Rule 7: the scans stay text scans over the fence. `nodeText` is a union of heterogeneous fields (`value` /
`expr` / `raw` escape-hatch text, `callee`, `name`, …), and many statement shapes reach the walker with no
ExprNode, so a tree-only walk would drop detections. The structured `sql` / `sqlNode` E-FN-001 paths and the
`exprNode` reactive-write path are unchanged.

3 — two passes lowered `<#name>` without looking at literals:
- `preprocessWorkerAndStateRefs` (ast-builder.js), the pre-tokenizer pass, produced `_scrml_input_id_`. The
  plain path now uses `replaceInCode`. The span-aware path checks `codeOnlyView` at each `<#`, with every child
  block (`${}`, `?{}`, `#{}`, `_={}=`, …) replaced in the view by a same-length value token (`000…`), so a
  child's interior cannot shift the lexical context.
- `parseExpression` / `parseStatements` (expression-parser.ts), the pre-acorn placeholders, produced
  `__scrml_input_id__` once the first was fixed. Both now use `replaceInCode`.

## Sweep (type-system.ts, same E-FN family)
- Fixed: every scan listed above.
- Already fenced, unchanged: E-FN-003 `ASSIGN_RE` (via `maskStringLiteralSpans`), the reactive-write text
  fallback (anchored `^@name =`, only on statements with no ExprNode).
- Not E-FN: `trackFieldAssignment` (E-STATE-COMPLETE) still reads `txt`.
- emit-server.ts `nonDeterministicCallIn` (same FN_NON_DET_CALLS list, module-value classification) already
  reads literal-blanked text (s464 round 4).

## Tests
- `compiler/tests/unit/s478-fn-purity-scans-skip-literals.test.js` — 25 tests (E-FN-001 / -002 / -003 / -004:
  double, single, template text, string-in-hole; each with a still-fires twin, including `${Date.now()}`,
  `${window.innerWidth}`, `${?{…}.get()}`, `${side()}`, imported `now()` in a hole). On base: 15 fail (every
  does-not-fire case), 10 pass (every still-fires case).
- `compiler/tests/unit/s478-input-ref-not-rewritten-in-literals.test.js` — 6 tests. On base: 5 fail, 1 pass
  (the bare-read control).

## Real-input checks
- corpus-emit-differential, roots samples + conformance, base 9ce3f6ec9 vs head: 2786 sources / 7971 artifacts.
  Compile-failure delta 0/0, diagnostic changes 0 code / 0 text-only, syntax delta 0. 134 artifact content diffs,
  all the embedded compiler-root path (27 bytes, the checkout paths' length difference); 0 after path
  normalization. No diagnostic disappeared, so the corpus holds none of these false positives; the unit tests
  are the bite.
- Bootstrap bundle (slice-m2 `buildBundleChunks`, 29 chunks), base vs head: byte-identical (the bootstrap still
  carries the workarounds).
- Probe (a scratch copy of compiler/self-host-v2, not committed): every call site of the four helpers inlined
  back to a plain literal (`?{`, `<#id>`, `` `Date.now()` ``). Base impl#1 refuses the bundle (E-FN-001 in
  `waitDiag`, `actionServerDiags`, `linSql`, …). Head builds it; 87 changed lines, each a literal written
  verbatim, and no `_scrml_input_` / `_scrml_worker_` placeholder anywhere.

## Bootstrap helpers this makes removable (the later lane removes them; NOT removed here)
- `sqlSigil()` — analyze.scrml:522, check.scrml:111, parse.scrml:704, print.scrml:4258 (44 call sites).
  Caveat: write the sigil inline only where a `}` follows it in the same string literal. A lone `?{` in a
  string is still E-CTX-003 (g-block-splitter-sql-sigil-inside-string-literal, open). Every current call site
  has the `}`.
- `dateNowText()` — analyze.scrml:9027 (7 call sites).
- `hashId()` — analyze.scrml:16790 (12 call sites).
- `inputRef()` — parse.scrml:8548 (1 call site).

## Residue found, filed open
- g-block-splitter-sql-sigil-inside-string-literal — the splitter opens a `sql` child at `?{` inside a string.
  Harmless when a `}` follows in the same string (output verbatim); a lone `?{` is E-CTX-003.
- g-template-hole-input-ref-unlowered-placeholder — `` `x ${<#cursor>.x}` `` is E-CODEGEN-INVALID-LOGIC on
  base and head alike.
- Already filed: g-display-text-apostrophe-tokenizes-as-code-s462. `lift <li>Don't …</li>` followed by
  code: the tokenizer reads the rest as a string. The new fence agrees with the tokenizer: base lowered a
  `<#id>` inside that corrupted text, head leaves it. The output is corrupt either way.

## Log
- start 9ce3f6ec9; d76221662 (`<#id>`), eafcf425f (fn scans), f581c76ae (import order: `types:check` OK, 182 diagnostics unchanged). Hook: 54805 pass / 0 fail.
