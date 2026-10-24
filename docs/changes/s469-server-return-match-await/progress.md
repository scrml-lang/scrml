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

## Round 3 (review of b3712d7b3: FIX)

- H1 (library / tool mode, regression): TS stamps `fail` with `__failVariantFields` from the TS-resolved enum
  (aliases followed: `resolveErrorEnumThroughAliases`); `emitFailExpr` keys by it in every mode. runCG installs
  the per-file variant registry once per file before ANY emitter; client/server snapshot+restore instead of clear.
- H2 (short form): `emitShortFormArmBinding` projects the one declared field; otherwise binds nothing and refuses
  a read of `e` (E-TYPE-021 / -027). Chosen over "stop synthesizing e" for compatibility (stated in the gap).
- F1: `?` same-named variant with different fields → E-ERROR-010. F2: template-literal interpolations read by the
  arm callee reader. F3 filed (g-impl1-async-colouring-ignores-local-shadow-s469).
- Pack: SIDEs `library` / `tool`; s6 / f3 / l1 / t1 from r3-shapes.js; 935; producer-imports-enum shapes UNJUDGED
  (g-server-js-imports-module-without-server-file-s467) not pinned PASS-500; pins regenerated for 8 families.
- Tests: template-literal-lowering subject made SPEC-valid + pinned E-ERROR-013 divergence
  (existing gap g-impl1-handler-on-non-failable-s451 — no duplicate filed); `_ err` test is a pinned §18.6.1
  divergence (g-impl1-whole-error-binder-binds-data-s469).
- Not changed: gauntlet 039's extra E-TYPE-027 kept (a positional binder whose variant no visible enum declares;
  refusing beats guessing; the file is already refused by E-MATCH-012/E-TYPE-006).

## Round 4 (review of 048dba21a: FIX)

- H-A / H-B: `failableCalleeErrorEnum` (type-system.ts) — ONE resolver for a failable callee's error enum (local
  through aliases; imported via `importedFnSignatures`, whose `errorEnum` now follows aliases in the exporting
  file), used by the `?` E-ERROR-010 payload check, the `!{}` guard stamp and the failable-match subject stamp.
  Field compatibility = name SETS.
- H-C: arm callee reader's text fallback reads template interpolations (tagged templates) before blanking.
- M-1: `armTextReadsName` — the short-form `e` read test from the parsed arm (template substitutions included).
- M-2 NOT changed (implemented, measured, reverted): binding the whole error makes examples/09 correct but turns
  `_ e :> e.<field>` programs silently wrong (review probes, samples/blog-cms, samples/api-dashboard). Ruling owed;
  recorded on g-impl1-whole-error-binder-binds-data-s469 with options + recommendation.
- Pack: s7 / f4 / l2 / t2 (r4-shapes.js), 1010 shapes, pins for 12 families; library/tool load failure → UNJUDGED
  with gap id; tool runner judges stdout first. Filed g-library-tool-cross-file-import-source-path-s469.
- Corpus differential, CORRECTED full list (base b35babcc2 vs head; examples + samples 952, conformance + stdlib +
  benchmarks 1912): changed artifacts — examples/09-error-handling.server.js (keyed fail payload); conformance
  servers sql-transaction-in-function-rt and server-fn/cell-assign-failable-{arm-return-live, recovery-value,
  success-then-read} (keyed fail payload); FOUR client twins server-db/sql-{aggregate-group, join-two-tables,
  order-limit, update-returning}-rt-twin (`.Transport(t)` binds `.data.t`). Newly refused:
  phase2-match-payload-arity-033 (E-TYPE-021, as its expected.json asks) and control-015-try-catch (E-TYPE-027;
  SPEC says E-ERROR-013). Code changes on already-failing sources: error-004-in-logic E-CODEGEN-INVALID-LOGIC →
  E-TYPE-027; +E-TYPE-027 on phase2-match-optional-039 and debate-async-dashboard-react-perspective. stdlib: no
  real change.
