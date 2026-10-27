# bootstrap.map.md
# project: scrml
# updated: 2026-10-27T22:10:00Z  commit: 546e2f4aa
# Scope: `compiler/self-host-v2/` — the scrml-native bootstrap compiler (impl#2). NOT impl#1 (`compiler/src/`, TypeScript). Line numbers are at 546e2f4aa; they drift, so grep the
# symbol name first. All facts below were read from source/CI at 546e2f4aa; `bun scripts/bootstrap-conformance.ts --check` was run and reports current.

## What it is
impl#2 speaks the RULED language (§66 declaration forms, tapes with grants, `single` engines, `renders`). impl#1 (`scrml compile`) does not parse §66. The bootstrap is scrml that impl#1
compiles to JS (~9-13 s, cached on disk) and then runs. Pipeline (the S233 re-cut, dpa-051 §3.1): `lex -> parse -> analyze -> lower -> (check) -> print`. Types: `FileAst` (ast.scrml)
-> `TypedProgram` = FileAst + NodeId side-tables (analyze.scrml) -> `CoreProgram` (core.scrml) -> JS/HTML text (print.scrml, print-server.scrml). NO default arm on any `match` over a Core enum
(`scripts/lint-no-default-arm.js`; a new variant fails `walk.scrml kids` at compile time with E-TYPE-020).

## Module roles (lines at 546e2f4aa; 52,486 total in 29 `.scrml`)
| file | lines | role / entry symbols |
|---|---:|---|
| lex.scrml | 1636 | source -> `Token[]`; pure fold `step(st)` over a `(mode,event)` transition table; `makeCursor` :107 |
| ast.scrml | 416 | `FileAst` node types; every node `{nid, span, ...}`; `Diag` :408 `{code, severity, message, file, span}`; `newDiag` takes severity from `severityOf(code)` |
| parse.scrml | 6604 | source -> FileAst. `parseFile(path, src, firstId)` :6581 (entry). Two scanners (markup + logic) over one lexer. See "parse.scrml anchors" |
| link.scrml | 276 | parse phase of a LINKED program as a pure function of the SET of files: `parseProgram(xs, entry)` :266, `linkOrder` :170, `importTarget` :125, `canonicalSources` :75, `stdlibPrefix` = `scrml:` :119 (deterministic order, s452) |
| core.scrml | 958 | Core IR: enums + structs + `mkSym` etc. DATA only, no methods/module state. The binder (analyze) is the ONLY Sym minter |
| walk.scrml | 561 | THE structural traversal: `kids(n)` :93 (total match, no default), `allNodes` :310, `sharedRefs` :334, `boundSyms` :373, `assignedSyms` :509 |
| names.scrml | 155 | the one NameSupply: emitted identifiers minted, never rewritten |
| effects.scrml | 241 | effect-summary engine (dpa-066 Approach B, SPEC §6.15 / §6.7.4): transitive write summary, fixed point over the static call graph |
| analyze.scrml | 23987 | BINDER + type/edit classifier + all semantic diagnostics. `analyze(files, entry) -> TypedProgram` :23345 (entry). See "analyze.scrml anchors" |
| lower.scrml | 3608 | `lower(tp) -> Lowered` :3342 (entry). TypedProgram -> CoreProgram; "lower decides nothing" (desugar only). `hasError(tp)` :77, `lowerExpr` :369 / `lowerExprK` :423, `lowerBlock` :704, `lowerStmt` :710, `lowerElem` :1520, `lowerDecl` :1973, `lowerFn` :2136, `lowerServerFn` :2166 |
| check.scrml | 4020 | `checkCore(p) -> string[]` :113: Core well-formedness = the printer's precondition and M2's gate on lower's output (rule ids like C-S1, C-S2; defer rules ~:3017 `deferForbiddenStmt`; `blockWaits` :2683; `checkStar` :2276; `checkFieldSurface` :962) |
| print.scrml | 3014 | Core -> JS tree + HTML tree -> text. `printProgram(p, jsFile, runtimeFile)` :2707, `coreRefusal(p)` :2675 (E-BOOTSTRAP-UNSUPPORTED client-side refusals), `serverCtx` :2584, `routeName/routePath/routeJs` :374/:2789/:2791, `calledServerFns` :2816 |
| print-server.scrml | 395 | server artifact printer: `printServer(p, jsFile, runtimeFile)` :61 -> `createServer(host)` factory (U1c) |
| js.scrml / html.scrml | 408 / 130 | JS and HTML output trees + one-shot text printers (precedence from the tree; no re-parse) |
| css.scrml / css-syntax.scrml / css-ingest.scrml | 606 / 1148 / 920 | CSS: output tree, ruled CSS syntax reader (E-BOOTSTRAP-UNSUPPORTED for CSS not yet carried), impl#1-FileAST CSS ingest (`ingestCss` :898) |
| sql.scrml | 766 | `?{}` SQL literal facts (kind/reads/writes, `sqlFacts`) |
| url.scrml | 422 | §5.2 URL scheme reader + safe sets (compile-time half of executable-sink rules; runtime half is a verbatim copy of `compiler/src/runtime-url-guard.js` in slice-m1/runtime/runtime.js) |
| codec.scrml | 370 | §57 wire codec, compile-time half: Core `Type` -> closed `WireTable` descriptor; runtime half `slice-codec/runtime/codec.js` |
| measure.scrml | 169 | Core size by node kind (`countNodes`) |
| ingest.scrml | 1406 | THROWAWAY ingest shim: impl#1 FileAST -> Core (M3 item 3; grades the bootstrap on the pre-§66 corpus) |
| severity.scrml | 270 | GENERATED (do not edit): `severityOf(code)` :58 from SPEC §34. Regenerate `bun scripts/gen-bootstrap-severity.ts` (`--check` = staleness). `E-BOOTSTRAP-UNSUPPORTED` has no §34 row (fail-closed Error) |
| slice-m1/runtime/runtime.js, server-runtime.js | — | bootstrap client runtime (reactivity, `call`) and server runtime; copied next to emitted output by scrml-boot |
| slice-codec/runtime/codec.js | — | wire codec runtime half |
| progress.md | — | bootstrap build log (also slice-m1/, slice-m2/ `progress.md`) |

## analyze.scrml anchors (23,987 lines; ordered; `fn`/`type` names to grep; ~line)
Types/tables first, then passes, then the driver at the end. Symbol families:
- :1-:420 header comment, record types (`FieldInfo` :77, `SeqSnap` :201, `RemoteFact` :343, `ExprType` :384); :445-:575 table accessors `nameFact valueFact effectFact failFact bindFact elemFact attrFact declInfo`, `noServerFacts`, `remoteCaller`, `sqlInfo`, `isServerPlaced`.
- :620 `mint` (Sym minting), :686 `addAnnot`; :792 `builtinFile`; :803 `serverCallErrorName`; :877-:1235 type declaration stubs/infos (`typeItemOf`, `typeInfos` :1019, `isEnumType` :1135, `declSpan`).
- :1447-:1840 program/decl attribute checks (`unknownProgramAttrDiag`, `capabilitiesDiags` :1594, `valueReads`).
- :1999-:3290 expression type INFERENCE (`isRadixLiteral`, `Inf`, `infOut` :2063, `infRank`, `refInf` :2329, `inferTernary` :2527, `retsInMaybe` :2756) and validators (`valInfoOf` :3084).
- :3473 `programFields`; :3616 `markupNodes`; :3786 `withRemoteErr`; :3795 `transportShape`; :3916 `fnItemOf`; :4079 `persistFieldDiag`.
- :4309 derived-cell cycle (`derivedPath`); :4431-:4720 environment/scoping (`RowB`, `withStmtCall`, `resolveCond`, `diagX`, `resolveExprs` :4699).
- :4718 `resolveExpr` — THE RESOLVER (binder over expressions; variants `resolveVariant` :4902, `qualVariantValue` :5603, strings `strMethodNearest` :5756, prims `isPositionArg` :5977, `discardedArms` :6176, `resolvePropValues` :6556, `resolveFieldAt` :6979 = write edit classifier site).
- :5292 `fallOffPass`; :5436 `blocksValueReturn`; :7235 `resolveStmtExpr`; :7423 grants (`grantsHasEdits`); :7576-:8248 tape/seq methods (`growWord`, `argTapeProblem`, `subFieldEdits`, `memberCall` :8067, `resolveRemoveCall` :8248).
- :8417 `resolveStmt` — STATEMENT resolver; :8507-:8809 defer (`DeferLater`, `deferJump` :8628, `blockReference` :8809); :8934 `e003Msg`.
- :9106-:10300 `match`/arm coverage (`PSubj`, `litInfo` :9215, `coverDiags` :9490, `remoteHandled` :9625, `patName` :9871, `fallsThrough` :10273); :10380 `failSplitNote`; :10532 `resolveMaybeExpr`.
- :10745-:11700 lifts, `for` locals (`resolveForLocal` :10937, `liftExprs`, `retsFor`, `loopChecks` :11299, `isDeferStmt` :11459, `typeLift` :11684).
- :11839 `planLoop` (suspend plan), :12111 `staticExecIn`, :12253-:13200 elements/attributes/bind (`elemFactNow`, `isCssNode`, `fieldRenders`, `bindValAttrs` :13057).
- :13476 `checkScopes`; :13754 `boundNameOf`; :13861 `handlerRedeclares`; :13945 `exprType` / :13952 `presenceTest` (exports).
- :13998-:17900 THE TYPER (flow typing over `TypeState`): `contribute` :14683, `comparatorCheck` :15544, `checkOperands` :15722, `typeCall` :16447, `arityMessage` :16640, `plainFactOf` :16786, `typeStmt` :16898, `joinPaths` :17013, `typeStmtExpr` :17081, `checkIndex` :17223, `typeEach` :17542, `typeProgram` :17621, `typePass` :17654, `typeProgramBody` :17716, `typeProgramItem` :17765, `typeFieldMarkup` :17731, `typeFn` :17886.
- :17880-:19200 effect/unproven-write reports (`unprovenReport`, `usedDecls`, `factFix`, `nodePositions`, `ruleText`) feeding effects.scrml.
- :19394-:20450 persist, hold attrs, `sqlsInMaybe`, DB scopes (`RDbs`, `dbsInStateChild`, `schemeOf`).
- :20448 `placePass` (client/server placement); :20833 `summarize` (fn summaries); :21143 `valueFacts`; :21406-:21700 suspend planning (`Pending`, `RetFact` :21508, `noPlan` :21511, `planPass` :21554, `planStmt` :21659); :22049 `handledFactIn`; :22085-:22174 `sqlParamKey/Rep`, `distinctSqlParams`; :22227 `routedChecks`.
- :22369-:22780 CSS facts and pass (`CssFacts`, `noCssFacts`, `cssPass` :22682).
- :22781 `linPass` and `lin*` (`linFrom` :22844, `linGiven` :22974, `linHandled` :23193) — the `lin` single-use checker (E-LIN-*).
- :23345 `analyze` — DRIVER: runs binder -> typer -> passes in order and returns the TypedProgram; :23421+ `domScopeDropped`, `validatedName`, `hasBindKey`, `slotCarries` (late helpers).

## parse.scrml anchors (6,604 lines)
`parseAssign` :333, `parseTernary` :355, `parsePrimary` :1427, `parseKeywordPrimary` :1661, `parseBlock` :1778, `parseStmt` :2164, `parseDepItem` :2350, `parseForDecls` :3037, `parseDeclarator` :3055,
`parseFail` :3344, `parseLogicItems` :3599, `parseFn` :3778, `parseAttrValue` :4025, `parseCodeRun` :4952, `parseMarkupNode` :5970, `parseDeclBody` :6338, `parseDeclChild` :6382, `parseMarkupItems` :6409,
`parseMarkupItem` :6442, `parseFile` :6581. Match arms: `parseArmBody` :896; arm-separator rule E-MATCH-ARM-SEPARATOR ~:655/:727.

## Build (how the bootstrap itself is built and run)
- `scripts/scrml-boot.ts` (`bun run boot` = the script; `bun run boot:compile <file.scrml> [--output-dir d] [--format pretty|line] [--rebuild]`; `bun run boot:dev <file.scrml> [--port n]`). It compiles the bootstrap with impl#1 via `slice-m2/bundle.scrml` (module list `M2_MODULES` in `slice-m2/harness.js`, base `MODULES` in `slice-m1/harness.js`), caches the bundle (`$SCRML_BOOT_CACHE_DIR` else `$XDG_CACHE_HOME/scrml/boot-bundle` else `~/.cache/scrml/boot-bundle`; key = sha256 of every self-host-v2 `.scrml` + all `compiler/src` + package version + harness), then runs front end -> `checkCore` -> `printProgram`/`printServer`. Output `<dir>/dist/<name>/{index.html, program.client.js, scrml-runtime.js[, program.server.js, scrml-server-runtime.js]}`. Exit 0 clean / 1 Error diagnostic or printer refusal / 2 usage or crash. Test: `slice-m4/scrml-boot.test.js`.
- A NEW bootstrap `.scrml` module must be added to `MODULES` (slice-m1/harness.js) or `M2_MODULES` (slice-m2/harness.js) AND imported by the matching `bundle.scrml`, else it is not compiled/loaded.
- `lsp-boot/server.ts` (`bun run lsp:boot`) = diagnostics-only language server over the bootstrap.

## Tests (all outside the bunfig root: a plain `bun test` does NOT run them)
CI `slices` job (`.github/workflows/ci.yml` ~:401, bun 1.4.3, `bun install --frozen-lockfile`), in order:
```
bun scripts/lint-no-default-arm.js
bun test ./compiler/self-host-v2/slice-m1/
bun test ./compiler/self-host-v2/slice-m2/
SLICE_CORE=lowered bun test ./compiler/self-host-v2/slice-m1/
bun test ./compiler/self-host-v2/slice-m3/
bun test ./compiler/self-host-v2/slice-m4/
bun test ./compiler/self-host-v2/slice-codec/
```
Then `bun test compiler/tests/e2e-render-map/`. NON-blocking `tracking` job: `bun scripts/bootstrap-conformance.ts --check` and `bun scripts/gen-bootstrap-severity.ts --check` (the conformance --check is also a path-scoped BLOCKING PR step when conformance/cases or the report changes; ci.yml ~:226-245). Single test: `bun test compiler/self-host-v2/slice-m4/<file>.test.js`.
- slice-m1: Core + printer + runtime oracle (hand-built Core: counter/dropdown/valuesem `.core.scrml`; `check.test.js`, `lint.test.js`, `runtime.test.js`, browser tests, `harness.js`, `load-program.js`).
- slice-m2: front end (lex/parse/analyze/lower): `parse.test.js`, `front.test.js`, `lower.test.js`, `typer*.test.js`, `tables.test.js`, `is-some-s462`; `slice-m2/src/` = §66.19 source programs; `harness.js` `loadM2()`.
- slice-m3: CSS/ingest (`ingest.test.js`, `css*.test.js`, `bite.test.js`, `footprint.test.js`, css-oracle via puppeteer/Chromium).
- slice-m4: 73 `*.test.js` — language features by topic (`-s469`/`-s471` suffix = session): `acceptance.test.js` (grades `compiler/self-host-v2/acceptance/**` via bootstrap-conformance; has a `STATUS` map relDir -> [bucket, exact codes] you MUST update for a new acceptance case), `parse.test.js`, `typing.test.js`, `grants`, `tape-*`, `server-*`, `severity.test.js`, `stdlib-s471`, `imports-s471`, `lin-s471`, `loop-*-s471`, `defer*`, `if-chain`, `parse-batch-s471`, `scrml-boot.test.js`; support: `harness.js`, `fixtures.js`, `diag-diff.js`, `grant-scan.js`, `server-artifact-harness.js`, `src/` (programs incl. `src/stdlib-s471/`).
- slice-codec: `codec.test.js`, `cross-impl.test.js` (against impl#1 codec), `harness.js`, `bundle.scrml`.
- `compiler/self-host-v2/acceptance/<category>/<case>/{case.scrml, expected.json[, aux .scrml]}` — 228 human-written cases (categories: arms control-flow css display grants guess imports interp lin loop loop-value match o61 opener parse positions security strings tapes templates termination toenum); `neg-*` = must-refuse cases. Same layout as `conformance/cases`.

## Conformance probe
- `scripts/bootstrap-conformance.ts`: runs every `conformance/cases/**` case (1813 attempted) through the PURE bootstrap (front end for codes; printer + runtime in happy-dom for the runtime half). Buckets PASS / CODES-ONLY / FAIL / LEGACY / NOT-TWINNED / UNSUPPORTED / CRASH / INVALID; legacy-dialect cases are graded on a generated §66 twin (`compiler/src/commands/fix-s66.js`; per-case `dialect.s66` JSON override). Flags: `--filter <substr of relDir>`, `--cases <dir>`, `--json <path>`, `--write`, `--check`, `--no-twins`, `--fail-on-fail`.
- `docs/bootstrap-conformance.md` is `@generated` by `--write` (do not hand-edit). A tracking number, not a gate, EXCEPT staleness: change cases or bootstrap behaviour -> rerun `--write` and commit the file.
- `scripts/gen-bootstrap-severity.ts` -> `severity.scrml`. Table = every quoted `"E-/W-/I-..."` literal in `compiler/self-host-v2/*.scrml` with its SPEC §34 severity (via `scripts/s34-catalog.ts`); a code with no usable §34 row is fail-closed Error. Adding a new code literal anywhere in the bootstrap makes severity.scrml stale -> regenerate.
- Gaps: `docs/changes/s471-bootstrap-gap-sweep/SWEEP.md` (per-gap verdicts + repros), `docs/known-gaps.md`.

## If you need to change X, look at Y
| task | where |
|---|---|
| add a refusal / diagnostic code | 1. SPEC §34 row (`compiler/SPEC.md` ## 34, + SPEC-INDEX) unless bootstrap-only (`E-BOOTSTRAP-UNSUPPORTED`, `E-ERROR-016` have no row). 2. Emit it where the fact is known: syntax -> parse.scrml (via `newDiag`, ast.scrml); name/type/flow/lin/placement -> analyze.scrml (resolver `resolveExpr`/`resolveStmt`, typer `typeStmt`/`typeCall`, `linPass`); Core invariant / printer precondition -> check.scrml `checkCore`; printer-only refusal -> `coreRefusal` print.scrml / print-server.scrml. 3. `bun scripts/gen-bootstrap-severity.ts` (severity.scrml). 4. acceptance case + `STATUS` row in slice-m4/acceptance.test.js. 5. `bun scripts/bootstrap-conformance.ts --write` |
| add a parser construct | lex.scrml only if a new token class; parse.scrml (`parseStmt`/`parsePrimary`/`parseMarkupItem`/`parseDeclChild`/`parseAttrValue`) + node type in ast.scrml; the `parse.test.js` SPEC-drift guard in slice-m2 and slice-m4; then analyze.scrml must resolve it and lower.scrml must handle it (a missing arm is a compile error: totality) |
| add a lowering | lower.scrml (`lowerStmt` :710 / `lowerExprK` :423 / `lowerElem` :1520 / `lowerDecl` :1973); Core variant in core.scrml (+ `kids` in walk.scrml, `kindOf` in measure.scrml, printer arm in print.scrml, check rule in check.scrml); slice-m2/lower.test.js, run `SLICE_CORE=lowered bun test slice-m1` |
| change emitted JS/HTML | print.scrml (client), print-server.scrml (server), js.scrml/html.scrml (trees); runtime behaviour in slice-m1/runtime/runtime.js or server-runtime.js |
| change type checking | analyze.scrml typer block (:13998-:17900); expression inference :1999-:3290; slice-m2/typer*.test.js, slice-m4/typing.test.js |
| change `lin` rules | analyze.scrml `linPass` :22781 .. `linHandled` :23193; slice-m4/lin-s471.test.js; acceptance/lin/ |
| change write/grant/edit rules (E-WRITE-NOT-GRANTED, E-DERIVED-WRITE...) | analyze.scrml `resolveFieldAt` :6979, grants :7423, tape methods :7576-:8248; effects.scrml; slice-m4/grants.test.js, tape-grants-r3, tape-write-forms |
| change match/arm coverage | analyze.scrml :9106-:10300 (`coverDiags`); parse.scrml `parseArmBody`; slice-m4/match-s469, arms-union-s469 |
| change imports / stdlib | link.scrml (`importTarget`, `stdlibPrefix`), analyze.scrml (binder import handling); slice-m4/imports-s471, stdlib-s471, src/stdlib-s471/ |
| change defer / loops | parse.scrml `parseForDecls`; analyze.scrml defer :8507-:8809, loops :10937-:11700, `planLoop` :11839; check.scrml `deferForbiddenStmt` :3017; slice-m4/defer*, loop*-s471, loops-s469 |
| change server fns / SQL / placement | analyze.scrml `placePass` :20448, sql.scrml, print-server.scrml, slice-m4/server-*.test.js |
| change CSS | css-syntax.scrml (reader), css-ingest.scrml, css.scrml (tree), analyze.scrml `cssPass` :22682; slice-m3/css*.test.js, slice-m4/css-*.test.js |
| change URL/executable-sink rules | url.scrml + slice-m1/runtime/runtime.js (`sync-bootstrap-url-guard.ts` keeps the guard in sync with `compiler/src/runtime-url-guard.js`); slice-m4/static-executable.test.js, sink-guards.test.js |
| change wire codec | codec.scrml + slice-codec/runtime/codec.js; slice-codec/*.test.js |
| add a conformance case (graded for both impls) | `conformance/cases/<category>/<case-id>/{case.scrml, expected.json}` (README: `conformance/README.md`); then `bun scripts/bootstrap-conformance.ts --filter <id>`, `--write` |
| add a bootstrap-only acceptance case | `compiler/self-host-v2/acceptance/<category>/<case>/{case.scrml, expected.json}` + `STATUS` row in slice-m4/acceptance.test.js; check with `bun scripts/bootstrap-conformance.ts --cases compiler/self-host-v2/acceptance` |
| impl#1 twin of a bootstrap rule | `compiler/src/` (type-system.ts, gauntlet-phase3-eq-checks.js, ...); per memory: impl#1 changes only for bootstrap build, Bryan's tools, or Peter |

## Tags
#scrml #map #bootstrap #self-host-v2 #impl2 #analyze #parse #lower #conformance

## Links
- [primary.map.md](./primary.map.md)
- [structure.map.md](./structure.map.md)
- [test.map.md](./test.map.md)
- [build.map.md](./build.map.md)
- [master-list.md](../../master-list.md)
- [pa.md](../../pa.md)
- [bootstrap-conformance.md](../../docs/bootstrap-conformance.md)
