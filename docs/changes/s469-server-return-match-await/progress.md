# s469-server-return-match-await — progress

Branch `s469-server-return-match-await` from `origin/s469-impl1-arm-commas` (b35babcc2). LIMB: impl#1
(`compiler/src`) SECURITY — a denied authorization result was classified as success.

## Log

- Reproduced by EXECUTION (pack harness `runShape`, server side): `return match check(p) { .Denied(r) :> "rejected",
  .Gone :> "rejected", else :> "LOGGED IN" }` → wrong=200 "LOGGED IN" (also newline arms, paren subject, nested
  match subject). Emitted `const _scrml_match_3 = check(p);` (no await) in the value IIFE.
- Fix 1 (subject await): `emit-control-flow.ts` `matchSubjectCtx` — the ONE context every match lowering lowers
  its subject in (value IIFE, statement inline, decl inline, multi-scrutinee x2); facts from
  `emit-logic.ts` `exprCtxOfLogicOpts` (the statement-expression builder) or the enclosing expression ctx.
- Fix 2 (text lowering): `rewrite.ts` `rewriteMatchExpr` chooses its IIFE header from the emitted body
  (`iifeLinesHaveOwnAwait`, the structured IIFE's rule) — `v = match check(p)`, `String(match check(p))`, a
  template slot and a nested match subject were E-CODEGEN-INVALID-LOGIC (stranded await) and now run correctly.
