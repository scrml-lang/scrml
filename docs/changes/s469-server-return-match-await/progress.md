# s469-server-return-match-await — progress

Branch `s469-server-return-match-await` from `origin/s469-impl1-arm-commas` (b35babcc2, #1524); origin/main merged
after #1524 landed (2706e430a). LIMB: impl#1 (`compiler/src`) SECURITY — a denied authorization result was
classified as success. Gap: `g-server-return-match-failable-subject-unawaited-s469` (HIGH, resolved).

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
- Fix 3 (binders): the server pass never published the variant field registry (`setVariantFieldsForFile`), so a
  server `fail E::V("x")` wrote bare `data: "x"` and a positional binder was a comment. Published now (cleared in
  generateServerJs's finally). `planPayloadBinders` (one planner, structured + text) — E-TYPE-021 (arity / mixed),
  E-TYPE-022 (undeclared named field), E-TYPE-027 (positional binder, field order unknowable); error-context
  single binder → whole `.data` (the `!{}` reader's rule). cross-impl D6 narrowed (payload now keyed).
- Fix 4 (client): the expression bridge (`emit-expr.ts` `emitMatchExpr`) passed `{ errors }` only — now
  `enclosingExprCtx`. Arm values carry `matchArmAsyncFacts` + `_awaitMatchArmServerCalls`; `rawArms` colour the
  enclosing client fn async (`emit-library-shared.ts` `collectCalleeIdents`).
- Readability: a keyed single-argument `fail` payload lowered from its tree (`row.balance`, not `row . balance`).
- Pack: SIDE `fullstack` (client page, fetch answered in-process by app.server.js); families s4 (48) + f1 (33);
  839 shapes. s4 base 13 FAIL / 3 PASS-500 → 0; f1 base 21 FAIL → 2 (render-time, KNOWN_FAIL).
- Unit: `compiler/tests/unit/match-subject-await-s469.test.js` (27; 25 fail on b35babcc2). `emit-match.test.js`
  "comment" case now asserts E-TYPE-027.
- Gaps filed: `g-render-match-async-subject-unawaited-s469` (HIGH, open — render-time class, no ruled code),
  `g-impl1-async-match-positions-refused-s469` (LOW, fails closed). The two #1524 LOW follow-ups (misspelled
  named binder; E-PARSE-001 binder message / token-spaced text) are FIXED by this unit, recorded in the main entry.
- SPEC §34 E-TYPE-021/022/027 rows cite `planPayloadBinders` (s34-census --check-new PASS).
- Corpus differential (examples + samples 952; conformance cases + stdlib + benchmarks 1912; base b35babcc2):
  artifacts changed — `examples/09-error-handling.server.js` and 4 conformance servers (keyed fail payload);
  newly refused — `samples/compilation-tests/gauntlet-s19-phase2-control-flow/phase2-match-payload-arity-033.scrml`
  (its expected.json asks for E-TYPE-021); +E-TYPE-027 on two already-failing sources. stdlib: no real change
  (only path-derived build hashes; base archive lacked compiler/ dirs → E-IMPORT-008 on stdlib/compiler/*).

## Round 2 (review of bc33320a7: FIX)

- Merged origin/main (#1523, #1526 and later).
- HIGH 1 (cross-file payload shape, regression): fail keyed by the DECLARING enum in every file
  (`getEnumVariantFieldSchema`, from `buildVariantFieldsRegistry` `byEnum`); readers bind by the handled call's
  declared error enum: failable-match subject stamp (now read in error contexts), new `__guardErrorVariants` on
  `!{}` (local / imported via `importedFnSignatures` / stdlib via `stdlib-failable-errors.ts`, drift-guarded).
  Whole-`.data` guess kept only for CPS NetworkError/ServerError; ambient schemas (HostError, Transport(t),
  Error::Generic(message), SqlError + BatchPrepareFailed) visible in every mode; §19 short-form binder keeps
  whole `.data` (`implicitBinding`). Tests moved to SPEC arity (`.ConnectionLost :>`, `.Thrown(msg, _)`).
- HIGH 2 (member call read as a server call, regression): arm callees from the parsed arm tree
  (`armListTextCallees` / `armBodyTextCallees` in emit-library-shared.ts). Also fixes base instances.
- HIGH 3 (nested match as an arm value): `_valueArm` lowers `nestedMatchFromArmText` structurally.
- NOT built (fork): structural render-position guard for genuinely async helpers (`if=`, derived) — the open
  class g-markup-gate-tests-server-call-promise / ruling-gated g-derived-cell-rhs-server-call-renders-promise;
  pinned as KNOWN_FAIL (f2).
- Pack: s5 (17) + f2 (37) → 893; `pinned-class.js` pins s4/f1/s5/f2 classes; fullstack fetch spans every
  `.server.js`.
- e2e-render-map baseline: cells 033 (now fails-compile E-TYPE-021) and 039 (+E-TYPE-027) re-observed with
  generate-baseline.js's `observeCellSubprocess` and spliced (a full regen would restamp unrelated drift).
- Gaps: main entry round-2 note; g-impl1-paren-free-binder-arity-s451 + g-impl1-payload-enum-wire-shape-s451
  resolved; render + refused-positions gaps extended.
