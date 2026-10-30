# bootstrap.map.md
# project: scrml
# updated: 2026-10-30T00:00:00Z  commit: d139f747c
# Scope: `compiler/self-host-v2/` — the scrml-native bootstrap compiler (impl#2). NOT impl#1 (`compiler/src/`, TypeScript). Line numbers are at d139f747c; they drift, so grep the
# symbol name first. All facts below were read from source/CI at d139f747c (watermark advanced from 546e2f4aa, 492 commits, S472-S473); `bun scripts/bootstrap-conformance.ts --check` was run and reports current.

## What it is
impl#2 speaks the RULED language (§66 declaration forms, tapes with grants, `single` engines, `renders`). impl#1 (`scrml compile`) does not parse §66. The bootstrap is scrml that impl#1
compiles to JS (~9-13 s, cached on disk) and then runs. Pipeline (the S233 re-cut, dpa-051 §3.1): `lex -> parse -> analyze -> lower -> (check) -> print`. Types: `FileAst` (ast.scrml)
-> `TypedProgram` = FileAst + NodeId side-tables (analyze.scrml) -> `CoreProgram` (core.scrml) -> JS/HTML text (print.scrml, print-server.scrml). NO default arm on any `match` over a Core enum
(`scripts/lint-no-default-arm.js`; a new variant fails `walk.scrml kids` at compile time with E-TYPE-020).

## Module roles (lines at d139f747c; 65,054 total in 27 top-level `.scrml`)
| file | lines | role / entry symbols |
|---|---:|---|
| lex.scrml | 1719 | source -> `Token[]`; pure fold `step(st)` over a `(mode,event)` transition table; `makeCursor` :116 |
| ast.scrml | 613 | `FileAst` node types; every node `{nid, span, ...}`; `Diag` :475 `{code, severity, message, file, span}`; `newDiag` takes severity from `severityOf(code)` |
| parse.scrml | 7900 | source -> FileAst. `parseFile(path, src, firstId)` :7877 (entry). Two scanners (markup + logic) over one lexer. See "parse.scrml anchors" |
| link.scrml | 339 | parse phase of a LINKED program as a pure function of the SET of files: `parseProgram(xs, entry)` :329, `linkOrder` :232, `importTarget` :125, `canonicalSources` :75, `stdlibPrefix` = `scrml:` :119 (deterministic order, s452) |
| core.scrml | 1140 | Core IR: enums + structs + `mkSym` etc. DATA only, no methods/module state. The binder (analyze) is the ONLY Sym minter |
| walk.scrml | 583 | THE structural traversal: `kids(n)` :93 (total match, no default), `allNodes` :328, `sharedRefs` :352, `boundSyms` :393, `assignedSyms` :531 |
| names.scrml | 155 | the one NameSupply: emitted identifiers minted, never rewritten |
| effects.scrml | 241 | effect-summary engine (dpa-066 Approach B, SPEC §6.15 / §6.7.4): transitive write summary, fixed point over the static call graph |
| analyze.scrml | 31232 | BINDER + type/edit classifier + all semantic diagnostics. `analyze(files, entry) -> TypedProgram` :30198 (entry). See "analyze.scrml anchors" |
| lower.scrml | 4105 | `lower(tp) -> Lowered` :3541 (entry). TypedProgram -> CoreProgram; "lower decides nothing" (desugar only). `hasError(tp)` :77, `lowerExpr` :377, `lowerBlock` :744, `lowerStmt` :750, `lowerElem` :1587, `lowerDecl` :2050, `lowerFn` :2215, `lowerServerFn` :2249 |
| check.scrml | 4600 | `checkCore(p) -> string[]` :113: Core well-formedness = the printer's precondition and M2's gate on lower's output (rule ids like C-S1, C-S2; defer rules `deferForbiddenStmt` :3457; `blockWaits` :3122; `checkStar` :2694; `checkFieldSurface` :1373) |
| print.scrml | 3454 | Core -> JS tree + HTML tree -> text. `printProgram(p, jsFile, runtimeFile)` :3096, `coreRefusal(p)` :3064 (E-BOOTSTRAP-UNSUPPORTED client-side refusals), `serverCtx` :2972, `routeName/routePath/routeJs` :446/:3225/:3227, `calledServerFns` :3253 |
| print-server.scrml | 421 | server artifact printer: `printServer(p, jsFile, runtimeFile)` :61 -> `createServer(host)` factory (U1c) |
| js.scrml / html.scrml | 416 / 132 | JS and HTML output trees + one-shot text printers (precedence from the tree; no re-parse) |
| css.scrml / css-syntax.scrml / css-ingest.scrml | 606 / 1148 / 920 | CSS: output tree, ruled CSS syntax reader (E-BOOTSTRAP-UNSUPPORTED for CSS not yet carried), impl#1-FileAST CSS ingest (`ingestCss` :898) |
| sql.scrml | 1302 | `?{}` SQL literal facts (kind/reads/writes, `sqlFacts`) |
| url.scrml | 563 | §5.2 URL scheme reader + safe sets (compile-time half of executable-sink rules; runtime half is a verbatim copy of `compiler/src/runtime-url-guard.js` in slice-m1/runtime/runtime.js) |
| codec.scrml | 379 | §57 wire codec, compile-time half: Core `Type` -> closed `WireTable` descriptor; runtime half `slice-codec/runtime/codec.js` |
| measure.scrml | 174 | Core size by node kind (`countNodes`) |
| ingest.scrml | 1408 | THROWAWAY ingest shim: impl#1 FileAST -> Core (M3 item 3; grades the bootstrap on the pre-§66 corpus) |
| severity.scrml | 355 | GENERATED (do not edit): `severityOf(code)` :59 from SPEC §34. Regenerate `bun scripts/gen-bootstrap-severity.ts` (`--check` = staleness). `E-BOOTSTRAP-UNSUPPORTED` has no §34 row (fail-closed Error) |
| slice-m1/runtime/runtime.js, server-runtime.js | — | bootstrap client runtime (reactivity, `call`) and server runtime; copied next to emitted output by scrml-boot |
| slice-codec/runtime/codec.js | — | wire codec runtime half |
| progress.md | — | bootstrap build log (also slice-m1/, slice-m2/ `progress.md`) |

## analyze.scrml anchors (31,232 lines; in file order; `fn`/`type` names to grep; line numbers at d139f747c, verified by grep, they drift)
Types/tables first, then passes, then the driver at the end. (S473 re-verified: only names with a `:line` below were re-checked; region boundaries from the S471 text were dropped as stale.)
- Types/tables: `FieldInfo` :82, `SeqSnap` :210, `RemoteFact` :364, `ExprType` :412, `noServerFacts` :474; `mint` :667 (Sym minting); `typeInfos` :1306, `isEnumType` :1425; `capabilitiesDiags` :1982.
- Expression type INFERENCE: `infOut` :2466, `refInf` :2730, `inferTernary` :2928, `retsInMaybe` :3154, `valInfoOf` :3497; `programFields` :3902.
- THE RESOLVER: `resolveExprs` :6202, `resolveExpr` :6221, `resolveVariant` :6476, `qualVariantValue` :7415, `strMethodNearest` :7570, `isPositionArg` :7791, `discardedArms` :7992, `resolvePropValues` :8600, `resolveFieldAt` :9757 (write edit classifier site).
- Tape/seq methods + statements: `memberCall` :11019, `resolveRemoveCall` :11210, `resolveStmt` :11722 (STATEMENT resolver), defer `deferJump` :11933, `blockReference` :12114.
- match/arm coverage: `litInfo` :12557, `coverDiags` :12833, `remoteHandled` :12968, `patName` :13215, `fallsThrough` :13617.
- Lifts/loops: `resolveForLocal` :14445, `loopChecks` :15055, `isDeferStmt` :15422, `typeLift` :15656, `planLoop` :15811 (suspend plan); `bindValAttrs` :17845.
- `checkScopes` :18650; `exprType` :19418 / `presenceTest` :19425 (exports).
- THE TYPER (flow typing over `TypeState`): `contribute` :20179, `comparatorCheck` :21209, `checkOperands` :21383, `typeCall` :22184, `arityMessage` :22376, `plainFactOf` :22594, `typeStmt` :22765, `joinPaths` :22918, `typeStmtExpr` :23021, `checkIndex` :23222, `typeEach` :23603, `typeProgram` :23682, `typePass` :23715, `typeProgramBody` :23777, `typeFieldMarkup` :23792, `typeProgramItem` :23826, `typeFn` :23969.
- Placement/summaries/suspend: `placePass` :26841, `summarize` :27624, `RetFact` :28299, `noPlan` :28302, `planPass` :28345, `planStmt` :28450.
- `cssPass` :29519; `linPass` :29619 (`linFrom` :29682, `linGiven` :29812, `linHandled` :30033) — the `lin` single-use checker (E-LIN-*).
- `analyze` :30198 — DRIVER: runs binder -> typer -> passes in order and returns the TypedProgram.

## parse.scrml anchors (7,900 lines)
`parseAssign` :416, `parseTernary` :447, `parsePrimary` :1520, `parseKeywordPrimary` :1874, `parseBlock` :1991, `parseStmt` :2430, `parseDepItem` :2618, `parseForDecls` :3308, `parseDeclarator` :3326,
`parseFail` :3615, `parseLogicItems` :3871, `parseFn` :4198, `parseAttrValue` :4429, `parseCodeRun` :5366, `parseMarkupNode` :7254, `parseDeclBody` :7625, `parseDeclChild` :7669, `parseMarkupItems` :7696,
`parseMarkupItem` :7736, `parseFile` :7877 (entry). Match arms: `parseArmBody` :988; arm-separator rule E-MATCH-ARM-SEPARATOR (grep).

## S473 modules and gates (new since 546e2f4aa)
- `refusals.scrml` (408) — THE NAMED-REFUSAL TABLE (D28): `refusalTable` :87, `cascadeCode` :165, `relabelRefusals(files, parse, later)` :390 (imported by slice-m2/bundle.scrml). RE-LABEL ONLY: a row fires only in a file the front end already rejects; it replaces the cascade codes with a named code (E-BOOTSTRAP-UNSUPPORTED or the SPEC's code, e.g. E-TRY-NOT-IN-SCRML), never turns a pass into a fail.
- `elements.scrml` (143) — markup element registry (SPEC §4.1/§24.1, E-MARKUP-001): `isKnownElementName` :134, `isHtmlElementName` :127, `isCustomElementName` :109, `htmlElementNames/svgElementNames/mathmlElementNames`. Mirror of impl#1 `compiler/src/html-elements.js`; slice-m4/markup-failclosed-s473.test.js runs both and fails on drift.
- `host-surface.scrml` (598) — `<host>` allowlist data mirroring DRAFT SPEC Appendix H one-to-one: `surfaceInterfaces` :300, `surfaceEntries` :340, `inertElements` :509, `surfaceDicts` :593, `findEntry` :98, `entryConflict` :272 (must agree with url.scrml `logicWriteSink` :475 / `logicCallSink` :511 / `isUrlAttrName` :485 / `executableAttrName` :549); no project-local surface. slice-m4/host-surface-appendix-h.test.js diffs it against the SPEC.
- `slice-m1/host-files.js` (`copyHostFiles`: stdlib host modules -> `<dir>/_scrml/<module>/<file>`), `slice-m1/host-src.js` (`<host src=>` static acorn export read + §21.3 copy closure; imports impl#1 `_scrml_static_denied`, never copies it).
- New slice-m4 tests by topic: `*-s472` (db-body, import-host, logic-block-const, map-grants, math-port, position-write) and `*-s473` (base-href / css-url / form-action-meta-refresh guards, db-cells, exitless/inner-forever loops, failclosed-sql-protect, foreign-blocks, host-allowlist-{chromium,parity,runtime}, host-block-f3, host-src, lift-cell-arm, markup-failclosed, named-refusals, ruled-refusals, p5-holes, plain-logic-dom-sinks, program-attrs, rulings-lint), gate-reach.test.js. slice-m1/lint-duplicate-fn.test.js, slice-m2/dup-fn-s473.test.js.
- `scripts/lint-duplicate-fn.js` — duplicate-`fn` lint over the bootstrap (CI `slices` job runs it after lint-no-default-arm).
- Acceptance dirs added: `db-body`, `db-cells`, `variants` (25 categories total in `acceptance/`).

## Build (how the bootstrap itself is built and run)
- `scripts/scrml-boot.ts` (`bun run boot` = the script; `bun run boot:compile <file.scrml> [--output-dir d] [--format pretty|line] [--rebuild]`; `bun run boot:dev <file.scrml> [--port n]`). It compiles the bootstrap with impl#1 via `slice-m2/bundle.scrml` (module list `M2_MODULES` in `slice-m2/harness.js`, base `MODULES` in `slice-m1/harness.js`), caches the bundle (`$SCRML_BOOT_CACHE_DIR` else `$XDG_CACHE_HOME/scrml/boot-bundle` else `~/.cache/scrml/boot-bundle`; key = sha256 of every self-host-v2 `.scrml` + all `compiler/src` + package version + harness), then runs front end -> `checkCore` -> `printProgram`/`printServer`. Output `<dir>/dist/<name>/{index.html, program.client.js, scrml-runtime.js[, program.server.js, scrml-server-runtime.js]}`. Exit 0 clean / 1 Error diagnostic or printer refusal / 2 usage or crash. Test: `slice-m4/scrml-boot.test.js`.
- A NEW bootstrap `.scrml` module must be added to `MODULES` (slice-m1/harness.js) or `M2_MODULES` (slice-m2/harness.js) AND imported by the matching `bundle.scrml`, else it is not compiled/loaded.
- `lsp-boot/server.ts` (`bun run lsp:boot`) = diagnostics-only language server over the bootstrap.

## Tests (all outside the bunfig root: a plain `bun test` does NOT run them)
CI `slices` job (`.github/workflows/ci.yml` ~:425, bun 1.4.3, `bun install --frozen-lockfile`), in order:
```
bun scripts/lint-no-default-arm.js
bun scripts/lint-duplicate-fn.js
bun test ./compiler/self-host-v2/slice-m1/
bun test ./compiler/self-host-v2/slice-m2/
SLICE_CORE=lowered bun test ./compiler/self-host-v2/slice-m1/
bun test ./compiler/self-host-v2/slice-m3/
bun test ./compiler/self-host-v2/slice-m4/
bun test ./compiler/self-host-v2/slice-codec/
```
Then `bun test compiler/tests/e2e-render-map/`. NON-blocking `tracking` job: `bun scripts/bootstrap-conformance.ts --check` and `bun scripts/gen-bootstrap-severity.ts --check` (the conformance --check is also a path-scoped BLOCKING PR step when conformance/cases or the report changes; ci.yml ~:226-260). Single test: `bun test compiler/self-host-v2/slice-m4/<file>.test.js`.
- slice-m1: Core + printer + runtime oracle (hand-built Core: counter/dropdown/valuesem `.core.scrml`; `check.test.js`, `lint.test.js`, `runtime.test.js`, browser tests, `harness.js`, `load-program.js`).
- slice-m2: front end (lex/parse/analyze/lower): `parse.test.js`, `front.test.js`, `lower.test.js`, `typer*.test.js`, `tables.test.js`, `is-some-s462`; `slice-m2/src/` = §66.19 source programs; `harness.js` `loadM2()`.
- slice-m3: CSS/ingest (`ingest.test.js`, `css*.test.js`, `bite.test.js`, `footprint.test.js`, css-oracle via puppeteer/Chromium).
- slice-m4: 112 `*.test.js` — language features by topic (`-s469`/`-s471` suffix = session): `acceptance.test.js` (grades `compiler/self-host-v2/acceptance/**` via bootstrap-conformance; has a `STATUS` map relDir -> [bucket, exact codes] you MUST update for a new acceptance case), `parse.test.js`, `typing.test.js`, `grants`, `tape-*`, `server-*`, `severity.test.js`, `stdlib-s471`, `imports-s471`, `lin-s471`, `loop-*-s471`, `defer*`, `if-chain`, `parse-batch-s471`, `scrml-boot.test.js`; support: `harness.js`, `fixtures.js`, `diag-diff.js`, `grant-scan.js`, `server-artifact-harness.js`, `src/` (programs incl. `src/stdlib-s471/`).
- slice-codec: `codec.test.js`, `cross-impl.test.js` (against impl#1 codec), `harness.js`, `bundle.scrml`.
- `compiler/self-host-v2/acceptance/<category>/<case>/{case.scrml, expected.json[, aux .scrml]}` — 238 human-written cases (categories: arms control-flow css db-body db-cells display grants guess imports interp lin loop loop-value match o61 opener parse positions security strings tapes templates termination toenum variants); `neg-*` = must-refuse cases. Same layout as `conformance/cases`.

## Conformance probe
- `scripts/bootstrap-conformance.ts`: runs every `conformance/cases/**` case (1813 attempted; at d139f747c PASS 283, FAIL 241, NOT-TWINNED 685, UNSUPPORTED 604; `--check` run and reports current) through the PURE bootstrap (front end for codes; printer + runtime in happy-dom for the runtime half). Buckets PASS / CODES-ONLY / FAIL / LEGACY / NOT-TWINNED / UNSUPPORTED / CRASH / INVALID; legacy-dialect cases are graded on a generated §66 twin (`compiler/src/commands/fix-s66.js`; per-case `dialect.s66` JSON override). Flags: `--filter <substr of relDir>`, `--cases <dir>`, `--json <path>`, `--write`, `--check`, `--no-twins`, `--fail-on-fail`.
- `docs/bootstrap-conformance.md` is `@generated` by `--write` (do not hand-edit). A tracking number, not a gate, EXCEPT staleness: change cases or bootstrap behaviour -> rerun `--write` and commit the file.
- `scripts/gen-bootstrap-severity.ts` -> `severity.scrml`. Table = every quoted `"E-/W-/I-..."` literal in `compiler/self-host-v2/*.scrml` with its SPEC §34 severity (via `scripts/s34-catalog.ts`); a code with no usable §34 row is fail-closed Error. Adding a new code literal anywhere in the bootstrap makes severity.scrml stale -> regenerate.
- Gaps: `docs/changes/s471-bootstrap-gap-sweep/SWEEP.md` (per-gap verdicts + repros), `docs/known-gaps.md`.

## S473 gates and tooling around the bootstrap
- `docs/bootstrap-spec-coverage.md` — per-SPEC-section table of what the bootstrap does (statuses BUILT / PARTIAL / REFUSED-LOUD / DEFERRED-RULED / N/A / SILENT-ACCEPT / SILENT-ABSENT / UNVERIFIED; 1,107 rows at d139f747c; totals block `@generated:coverage-totals`). Gate `scripts/spec-coverage-check.ts` (CI `checks` job; pre-commit when SPEC.md / SPEC-INDEX.md / the doc / known-gaps.md is staged; `--write` refreshes totals): every top-level § has a row; a SILENT-* row cites a gap id; every cited gap has an `@gap` marker; warns on a closed gap whose row still says SILENT/PARTIAL. Test: compiler/tests/unit/spec-coverage-check-s473.test.js. A landing gap flips its rows in the same PR.
- `scripts/bootstrap-conformance.ts` — report counts vacuous passes separately ("Non-vacuous holds" in docs/bootstrap-conformance.md).
- `scripts/scrml-boot.ts` — plans `<host src=>` modules the client artifact imports (`planHostSrcs` from `slice-m1/host-src.js`) and imports impl#1's ONE static-serve policy (§47.13) for `dev`; usage unchanged (`compile|dev`, `--output-dir/-o`, `--format`, `--rebuild`, `--port`, `--verbose`).
- Claim gate: `scripts/claim-gate.js` (C1: every public scrml fence compiles) + NEW `scripts/claim-gate-c2.js` (C2: a number beside a repo-derived noun on the public surface must cite `docs/FACTS.md` or carry `<!-- claim: not-derived -->`), surface list in `scripts/claim-gate-surface.js`; CI `checks` step.
- Windows ratchet: `scripts/windows-ratchet.ts` (`validate | judge | retry-list | report`), baseline `.github/windows-baseline.json` (`entries: []` at d139f747c; each entry ties to an OPEN gap), `windows` job in ci.yml judged by the ratchet and REQUIRED through `gate` (skipped accepted on `merge_group` only), nightly `.github/workflows/windows-main-report.yml` (07:47 UTC). `.github/CI.md` replaces `.github/README.md` (deleted).
- impl#1 changes this range (compiler/src, per ruling not bootstrap work): `codegen/server-navigate.ts` (NEW: server-side `navigate()` = `_scrml_server_navigate`, 204 + `X-Scrml-Navigate` for the fetch wrapper, 302 otherwise; `navigate()` inside `transaction {}` = E-TRANSACTION-CONTROL-FLOW via validators/lint-transaction.ts), handler-arm transport routing in emit-client.ts/rewrite.ts (a covered `!{}` gets a failed plain server call as Transport; `lift @x` in a value-position arm; imported async callee), type-system.ts `routeEntryAt` :11016 (imported callees' routeMap reads; Windows native-key fix), host-import.js (`import:host` admitted only in the compiler's own stdlib).

## If you need to change X, look at Y
| task | where |
|---|---|
| add a refusal / diagnostic code | 1. SPEC §34 row (`compiler/SPEC.md` ## 34, + SPEC-INDEX) unless bootstrap-only (`E-BOOTSTRAP-UNSUPPORTED`, `E-ERROR-016` have no row). 2. Emit it where the fact is known: syntax -> parse.scrml (via `newDiag`, ast.scrml); name/type/flow/lin/placement -> analyze.scrml (resolver `resolveExpr`/`resolveStmt`, typer `typeStmt`/`typeCall`, `linPass`); Core invariant / printer precondition -> check.scrml `checkCore`; printer-only refusal -> `coreRefusal` print.scrml / print-server.scrml. 3. `bun scripts/gen-bootstrap-severity.ts` (severity.scrml). 4. acceptance case + `STATUS` row in slice-m4/acceptance.test.js. 5. `bun scripts/bootstrap-conformance.ts --write` |
| add a parser construct | lex.scrml only if a new token class; parse.scrml (`parseStmt`/`parsePrimary`/`parseMarkupItem`/`parseDeclChild`/`parseAttrValue`) + node type in ast.scrml; the `parse.test.js` SPEC-drift guard in slice-m2 and slice-m4; then analyze.scrml must resolve it and lower.scrml must handle it (a missing arm is a compile error: totality) |
| add a lowering | lower.scrml (`lowerStmt` :750 / `lowerExpr` :377 / `lowerElem` :1587 / `lowerDecl` :2050); Core variant in core.scrml (+ `kids` in walk.scrml, `kindOf` in measure.scrml, printer arm in print.scrml, check rule in check.scrml); slice-m2/lower.test.js, run `SLICE_CORE=lowered bun test slice-m1` |
| change emitted JS/HTML | print.scrml (client), print-server.scrml (server), js.scrml/html.scrml (trees); runtime behaviour in slice-m1/runtime/runtime.js or server-runtime.js |
| change type checking | analyze.scrml typer block (`contribute` :20179 .. `typeFn` :23969); expression inference (`infOut` :2466 .. `valInfoOf` :3497); slice-m2/typer*.test.js, slice-m4/typing.test.js |
| change `lin` rules | analyze.scrml `linPass` :29619 .. `linHandled` :30033; slice-m4/lin-s471.test.js; acceptance/lin/ |
| change write/grant/edit rules (E-WRITE-NOT-GRANTED, E-DERIVED-WRITE...) | analyze.scrml `resolveFieldAt` :9757, grants (`grantsHasEdits`), tape methods (`memberCall` :11019 .. `resolveRemoveCall` :11210); effects.scrml; slice-m4/grants.test.js, tape-grants-r3, tape-write-forms |
| change match/arm coverage | analyze.scrml `litInfo` :12557 .. `fallsThrough` :13617 (`coverDiags` :12833); parse.scrml `parseArmBody`; slice-m4/match-s469, arms-union-s469 |
| change imports / stdlib | link.scrml (`importTarget`, `stdlibPrefix`), analyze.scrml (binder import handling); slice-m4/imports-s471, stdlib-s471, src/stdlib-s471/ |
| change defer / loops | parse.scrml `parseForDecls`; analyze.scrml defer (`deferJump` :11933), loops (`resolveForLocal` :14445 .. `typeLift` :15656), `planLoop` :15811; check.scrml `deferForbiddenStmt` :3457; slice-m4/defer*, loop*-s471, loops-s469 |
| change server fns / SQL / placement | analyze.scrml `placePass` :26841, sql.scrml, print-server.scrml, slice-m4/server-*.test.js |
| change CSS | css-syntax.scrml (reader), css-ingest.scrml, css.scrml (tree), analyze.scrml `cssPass` :29519; slice-m3/css*.test.js, slice-m4/css-*.test.js |
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
