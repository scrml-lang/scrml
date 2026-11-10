# bootstrap.map.md
# project: scrml
# updated: 2026-11-08T16:47:39Z  commit: f92d1a8fb
# Scope: `compiler/self-host-v2/` — the scrml-native bootstrap compiler (impl#2). NOT impl#1 (`compiler/src/`, TypeScript).
# Every line number below was re-grepped at f92d1a8fb. They drift: grep the symbol first.
# Conformance figures were re-executed at f92d1a8fb (`bun scripts/bootstrap-conformance.ts --json`).

## What it is
impl#2 speaks the RULED language (§66 declaration forms, tapes with grants, `single` engines, `renders`). impl#1 (`scrml compile`) does not parse §66.
The bootstrap is scrml source that impl#1 compiles to JS (~9 s, then cached on disk) and runs.
Pipeline: `lex -> parse -> analyze -> lower -> (check) -> print`.
Types: `FileAst` (ast.scrml) -> `TypedProgram` = FileAst + NodeId side-tables (analyze.scrml) -> `CoreProgram` (core.scrml) -> JS/HTML text (print.scrml, print-server.scrml).
No `match` over a Core enum has a default arm (`scripts/lint-no-default-arm.js`). A new variant therefore fails `walk.scrml kids` at compile time with E-TYPE-020.

## Module roles (76,784 lines in 27 top-level `.scrml` at f92d1a8fb)
| file | lines | role / entry symbols |
|---|---:|---|
| lex.scrml | 1744 | source -> `Token[]`; a pure fold `step` :1235 over a `(mode,event)` table; `makeCursor` :116 |
| ast.scrml | 675 | `FileAst` node types (`AStmt`, `AExpr`, `ANode`, `ADecl`, `ARequest` (S475), …); `Diag` :535; `newDiag` :538 takes its severity from `severityOf` |
| parse.scrml | 9250 | source -> FileAst. Entry `parseFile` :9218; `parseFileNs` :9227 (namespace-aware, S475; `PNs` :199, `nsOfItems` :203). See the anchors section below |
| link.scrml | 339 | parses a LINKED program as a pure function of the file set: `parseProgram` :329, `linkOrder` :232, `importTarget` :125, `canonicalSources` :75, `stdlibPrefix` :119 |
| core.scrml | 1384 | Core IR, data only: `Type`, `Expr`, `Stmt`, `View`, `Decl`, `Fn`, `ServerFn`, `Db`, `Envelope`, `CoreProgram` :975. S475 added `RequestState` :718, `ReqClass` :722 and `View.Request` |
| walk.scrml | 675 | the structural traversal: `kids` :93 (total match), `allNodes` :340, `sharedRefs` :412, `boundSyms` :453, `assignedSyms` :599 |
| names.scrml | 156 | the one NameSupply for emitted identifiers |
| effects.scrml | 241 | effect summaries (transitive write sets, a fixed point over the static call graph; SPEC §6.15 / §6.7.4) |
| analyze.scrml | 39216 | binder + type/edit classifier + every semantic diagnostic. `analyze` :38013 -> `analyzeLinked` :38020; `analyzeSources` :38029 (S475) |
| lower.scrml | 4482 | `lower` :3911: TypedProgram -> CoreProgram (desugar only). `hasError` :77, `lowerExpr` :446, `lowerBlock` :821, `lowerStmt` :827, `lowerElem` :1899, `lowerDecl` :2363, `lowerFn` :2545, `lowerServerFn` :2579 |
| check.scrml | 5418 | `checkCore` :113: Core well-formedness, the printer's precondition (rule ids C-S1…, C11, C-R1…C-R3). `checkFieldSurface` :1432, `checkRequest` :1681, `checkReadRequest` :1833, `requestSelfTrigger` :2019, `checkStar` :3445, `blockWaits` :3874, `deferForbiddenStmt` :4252 |
| print.scrml | 3983 | Core -> JS + HTML text. `printProgram` :3619, `coreRefusal` :3587 (E-BOOTSTRAP-UNSUPPORTED), `serverCtx` :3468, `requestJs` :2399, `requestSlotStmts` :2431, `routeName` :469, `routePath` :3750, `routeJs` :3752, `calledServerFns` :3778 |
| print-server.scrml | 460 | the server artifact: `printServer` :61 -> a `createServer(host)` factory |
| js.scrml / html.scrml | 422 / 159 | JS and HTML output trees and their one-shot printers |
| css.scrml / css-syntax.scrml / css-ingest.scrml | 606 / 1148 / 920 | CSS output tree, the ruled CSS reader, impl#1-FileAST CSS ingest (`ingestCss` :898) |
| sql.scrml | 1302 | `?{}` SQL literal facts (kind, reads, writes) |
| url.scrml | 563 | §5.2 URL scheme reader + safe sets: `logicWriteSink` :475, `isUrlAttrName` :485, `logicCallSink` :511, `executableAttrName` :549 |
| codec.scrml | 379 | §57 wire codec, compile-time half (Core `Type` -> `WireTable`) |
| measure.scrml | 177 | Core size by node kind |
| ingest.scrml | 1419 | THROWAWAY shim: impl#1 FileAST -> Core (grades the bootstrap on the pre-§66 corpus) |
| refusals.scrml | 409 | the named-refusal table: `refusalTable` :87, `cascadeCode` :166, `relabelRefusals` :391. It only re-labels files the front end already rejects |
| elements.scrml | 287 | markup element registry (E-MARKUP-001): `isCustomElementName` :109, `isHtmlElementName` :127, `isKnownElementName` :134. Mirrors impl#1 `compiler/src/html-elements.js` |
| host-surface.scrml | 598 | `<host>` allowlist mirroring SPEC Appendix H (DRAFT): `findEntry` :98, `entryConflict` :272, `surfaceInterfaces` :300, `surfaceEntries` :340, `inertElements` :509, `surfaceDicts` :593 |
| severity.scrml | 372 | GENERATED: `severityOf` :59 from SPEC §34. Bot-owned post-merge; see "Generated files" below |

Runtime and support JS (not `.scrml`):
| file | lines | role |
|---|---:|---|
| slice-m1/runtime/runtime.js | 4797 | client runtime, copied next to the emitted output. Reactivity (`Cell` :191, `Derived` :236, `effect` :295, `effectOn` :406), the request machine (`requestOn` :648, `requestSlot` :688, `refetch` :700, S475), `suspend` :723, `waiting` :761, tape ops, host surface (`hostCall` :1802, `hostInert` :2045), DOM (`each` :3766, `slot` :3709), codec (`encode` :4070, `decode` :4264, `CodecDefect` :3904), `call` :4590 (server call; `SERVER_CALL_DEADLINE_MS` :4535), `CSRF_COOKIE`/`CSRF_HEADER` :4726, `ScrmlTrap` :1520. The URL guard block is a verbatim copy of `compiler/src/runtime-url-guard.js` (`scripts/sync-bootstrap-url-guard.ts`) |
| slice-m1/runtime/server-runtime.js | 1346 | server runtime: `sqlText` :65, `connKey` :99, `connection` :181, `envelope` :529 (the §8.9.2 `!` envelope; Postgres uses a reserved connection), `query` :765, `sqlErrorOf` :836 (PG and SQLite error classes), `encodeError` :1030, `failStatus` :1047, `route` :1130, `tenantGate` :1196, `server` :1252 |
| slice-codec/runtime/codec.js | 14 | wire codec runtime half |
| slice-m1/host-files.js, slice-m1/host-src.js | — | stdlib host-module copy (`copyHostFiles`) and `<host src=>` planning (`planHostSrcs`) |

## analyze.scrml anchors (39,216 lines; file order)
- Types/tables: `FieldInfo` :85, `SeqSnap` :221, `ReqSig` :267, `LocalEdit` :304, `RemoteFact` :387, `ExprType` :441, `noServerFacts` :515, `mint` :717 (the only Sym minter), `resolveLife` :1428, `typeInfos` :1671, `isEnumType` :1790, `capabilitiesDiags` :2350.
- Expression inference: `infOut` :2868, `refInf` :3170, `inferTernary` :3368, `retsInMaybe` :3595, `valInfoOf` :3974, `programFields` :4423.
- Resolver: `resolveExprs` :6975, `resolveExpr` :6994, `resolveVariant` :7348, `qualVariantValue` :8359, `strMethodNearest` :8514, `isPositionArg` :8747, `discardedArms` :8968, `resolvePropValues` :9583, `resolveFieldAt` :10838 (the write/edit classifier).
- Grants, tape methods, statements: `grantsHasEdits` :11333, `memberCall` :12222, `resolveLocalEdit` :12401 (S475 local tape edits), `resolveRemoveCall` :12477, `resolveStmt` :12997, `deferJump` :13208, `blockReference` :13389.
- Match/arm coverage: `litInfo` :13910, `coverDiags` :14239, `remoteHandled` :14419, `patName` :14698, `fallsThrough` :15130.
- S475 request / pending cells: `ReqFact` :15431, `reqSigIndex` :15632, `resolveRefetch` :15742, `resolveRequest` :15786, `resolvePending` :15994.
- Lifts/loops: `resolveForLocal` :16936, `loopChecks` :17560, `isDeferStmt` :17929, `typeLift` :18164, `planLoop` :18377; `bindValAttrs` :21118; `checkScopes` :21928; exports `exprType` :22605, `presenceTest` :22612.
- Typer (flow typing): `contribute` :23462, `lifeRead` :23537 (S475 lifecycle reads), `checkPartial` :24494, `comparatorCheck` :24843, `checkOperands` :25112, `typeCall` :26079, `arityMessage` :26274, `plainFactOf` :26580, `typeStmt` :26751, `joinPaths` :26910, `typeStmtExpr` :27018, `checkIndex` :27304, `typeLocalEdit` :27429, `typeRequest` :27870, `typeEach` :28012, `typeProgram` :28115, `typePass` :28148, `typeProgramBody` :28210, `typeFieldMarkup` :28225, `typeProgramItem` :28259, `typeFn` :28402.
- Request passes: `requestPass` :29450, `requestWarnPass` :29582, `pendingCells` :30089.
- Placement / composition / plans: `placePass` :32043, `composePass` :33093, `transportCarriers` :33191, `composeOne` :33270, `summarize` :35335, `RetFact` :36029, `noPlan` :36032, `planPass` :36075, `requestPlan` :36129, `planStmt` :36223.
- `cssPass` :37307; `linPass` :37408 (`linFrom` :37477, `linGiven` :37607, `linHandled` :37830), the `lin` single-use checker (E-LIN-*).
- Driver: `analyze` :38013.

## parse.scrml anchors (9,250 lines)
`parseAssign` :516, `parseTernary` :547, `parseArmBody` :1100, `parseArmBlock` :1180, `parsePrimary` :1845, `parseKeywordPrimary` :2249, `parseBlock` :2391, `parseStmt` :2981, `parseDepItem` :3169,
`parseForDecls` :3870, `parseDeclarator` :3888, `parseFail` :4434, `parseLogicItems` :4872, `parseFn` :5292, `parseAttrValue` :5523, `parseCodeRun` :6619, `parseMarkupNode` :8531,
`isRequestBody` :8755 / `finishRequest` :8763 / `requestBody` :8775 (S475 `<request>`), `parseDeclBody` :8955, `parseDeclChild` :8999, `parseMarkupItems` :9026, `parseMarkupItem` :9066, `parseFile` :9218.

## S475 surface (fa0e875b4..f92d1a8fb, PRs #1744–#1812)
- `<request>` (§6.7.7) and pending cells (§13.9): parse (`ARequest`), analyze (`resolveRequest`, `typeRequest`, `requestPass`, `pendingCells`), Core `View.Request` + `RequestState` + `ReqClass` (READ requests abort a superseded transport; WRITE requests are discarded), check C-R1…C-R3, print `requestJs`, runtime `requestOn` / `refetch`. `<#id>` reads + `refetch()`. W-REQUEST-ID-UNREFERENCEABLE.
- Lifecycle types `(A to B)` / `(not to T)`: read rule E-TYPE-001 + write contract (`resolveLife`, `lifeRead`).
- Client `!` transport: every client `!` fn that `?`-propagates a server call is a transport carrier (`transportCarriers`); §19.9.5 literal carriers.
- Postgres `!` envelopes: reserved connection per envelope, PG error classes (`sqlErrorOf`), statement savepoint for a site-handled `?{}`; E-TX-FAIL-AFTER-COMMIT.
- `.scrml` namespace import (`parseFileNs`, `nsMember`); local tape edits are grant-checked (`resolveLocalEdit`); `<optgroup>` nesting refusal; value-`if` with object-literal arm; Partial/OneOf member judging (`checkPartial`).
- scrml-boot output hardening: race-free `-o` writes, hard-link-safe outputs (`OutDirError` in scripts/scrml-boot.ts :683).

## Build
- `scripts/scrml-boot.ts` (1,378 lines). `bun run boot:compile <file.scrml> [--output-dir d] [--format pretty|line] [--columns bytes] [--rebuild]`; `bun run boot:dev <file.scrml> [--port n]`.
  Output: `index.html`, `program.client.js`, `scrml-runtime.js`; plus `program.server.js` + `scrml-server-runtime.js` when the client calls server fns; `_scrml/<module>/<file>` for stdlib host files.
  `<dir>/.scrml-boot-manifest.json` records the files each build wrote; the next build deletes only those. Exit codes: 0 clean, 1 an Error diagnostic or printer refusal, 2 usage error / refused output dir / crash.
- Cache: `$SCRML_BOOT_CACHE_DIR`, else `$XDG_CACHE_HOME/scrml/boot-bundle`, else `~/.cache/scrml/boot-bundle`. The key hashes every self-host-v2 `.scrml`, all of `compiler/src`, the package version and the harness.
- Module lists: `MODULES` (slice-m1/harness.js :20) and `M2_MODULES` (slice-m2/harness.js :9). A new bootstrap module must be listed there AND imported by the matching `bundle.scrml`, or it is not compiled.
- `lsp-boot/` (`server.ts`, `diagnostics.ts`, `worker.ts`; `bun run lsp:boot`): a diagnostics-only language server over the bootstrap.

## Tests (outside the bunfig root, so a plain `bun test` does NOT run them)
CI `slices` job (`.github/workflows/ci.yml` :505, bun 1.4.3), in order:
```
bun scripts/lint-no-default-arm.js
bun scripts/lint-duplicate-fn.js
bun test ./compiler/self-host-v2/slice-m1/
bun test ./compiler/self-host-v2/slice-m2/
SLICE_CORE=lowered bun test ./compiler/self-host-v2/slice-m1/
bun test ./compiler/self-host-v2/slice-m3/
bun test ./compiler/self-host-v2/slice-m4/
bun test ./compiler/self-host-v2/slice-codec/
bun test compiler/tests/e2e-render-map/
```
CI `postgres-live` job (:688, a postgres:18 service; required through `gate` since #1791) runs `slice-m4/{pg-envelope,sql-error-pg,statement-savepoint-pg}-s475.test.js` with `SCRML_TEST_PG_URL` + `SCRML_TEST_PG_REAL=1`, and fails if any test skipped.
- slice-m1 (11 test files): Core + printer + runtime oracle (hand-built Core `.core.scrml`); `request.core.test.js`, `request.runtime.test.js` (S475).
- slice-m2 (12): front end (`parse.test.js`, `front.test.js`, `lower.test.js`, `typer*.test.js`); `harness.js` `loadM2()`.
- slice-m3 (5): CSS / ingest; the css oracle drives puppeteer (Chromium).
- slice-m4 (164): language features by topic, the session in the suffix (`-s469` … `-s475`). `acceptance.test.js` grades `acceptance/**` and holds a `STATUS` map (relDir -> [bucket, codes]). A new acceptance case needs a row there. Chromium tests are gated on `SCRML_CHROMIUM` / `SCRML_BROWSER_TESTS`.
- slice-codec (2): `codec.test.js`, `cross-impl.test.js`.
- `acceptance/<category>/<case>/{case.scrml, expected.json}`: 285 cases in 27 categories (arms control-flow css db-body db-cells display envelope grants guess imports interp lin loop loop-value match o61 opener parse positions request security strings tapes templates termination toenum variants). `neg-*` cases must be refused.
- Single test: `bun test compiler/self-host-v2/slice-m4/<file>.test.js`.

## Conformance probe (executed at f92d1a8fb)
`scripts/bootstrap-conformance.ts` runs every `conformance/cases/**` case through the pure bootstrap (the front end for codes; printer + runtime in happy-dom for the runtime half).
| bucket | cases |
|---|---:|
| attempted | 1827 |
| PASS | 302 |
| CODES-ONLY | 0 |
| FAIL | 243 (75 need a code the bootstrap never emits; 168 answer wrong) |
| NOT-TWINNED | 624 |
| UNSUPPORTED | 658 |
| LEGACY / CRASH / INVALID | 0 / 0 / 0 |
Graded = 545, of which 302 hold (55.4%); 109 cases ran the runtime half. Legacy-dialect cases graded on a generated §66 twin: 859 (PASS 185 · FAIL 207 · UNSUPPORTED 467).
The committed `docs/bootstrap-conformance.md` matches these figures at f92d1a8fb.
Flags: `--filter <substr>`, `--cases <dir>`, `--json <path>`, `--write` (regenerates the report), `--check`, `--ratchet`. Twins come from `compiler/src/commands/fix-s66.js`; per-case `dialect.s66` overrides.

## Generated files (bot-owned post-merge since S474)
`.github/workflows/generated-regen.yml` regenerates on main after each merge: severity.scrml -> SPEC-INDEX -> bootstrap-spec-coverage totals -> docs/generated/* -> bootstrap-conformance.md -> FACTS.md. PRs commit sources only.
- `severity.scrml`: run `bun scripts/gen-bootstrap-severity.ts` only when `slice-m4/severity.test.js` fails (an answer changed). A new code literal anywhere in the bootstrap makes the file stale. The bot fixes byte drift that changes no answer.
- `docs/bootstrap-spec-coverage.md`: hand-written rows (BUILT / PARTIAL / REFUSED-LOUD / DEFERRED-RULED / N/A / SILENT-* / UNVERIFIED) + bot totals. Gate `scripts/spec-coverage-check.ts`: 1,115 rows, 49 SILENT, 0 violations at f92d1a8fb.

## If you need to change X, look at Y
| task | where |
|---|---|
| add a diagnostic code | SPEC §34 row (+ SPEC-INDEX) unless bootstrap-only; emit it in parse.scrml (syntax), analyze.scrml (names/types/flow/lin/placement), check.scrml (Core invariant) or print*.scrml `coreRefusal` (printer-only); an acceptance case; severity.scrml if `severity.test.js` fails |
| add a parser construct | lex.scrml (a new token class only); parse.scrml (`parseStmt` / `parsePrimary` / `parseMarkupItem` / `parseDeclChild` / `parseAttrValue`) + a node in ast.scrml; then analyze + lower must handle it (totality makes a missing arm a compile error) |
| add a lowering / Core node | lower.scrml; the variant in core.scrml + `kids` (walk.scrml) + measure.scrml + a printer arm (print.scrml) + a check rule (check.scrml); run `SLICE_CORE=lowered bun test slice-m1` |
| change emitted JS/HTML | print.scrml (client), print-server.scrml (server), js.scrml / html.scrml; runtime behaviour in slice-m1/runtime/{runtime,server-runtime}.js |
| change type checking | analyze.scrml typer (`contribute` :23462 .. `typeFn` :28402); inference (`infOut` :2868 .. `valInfoOf` :3974) |
| change `<request>` / pending cells | analyze `resolveRequest` / `typeRequest` / `requestPass` / `pendingCells` / `requestPlan`; core `View.Request`; check `checkRequest`; print `requestJs`; runtime `requestOn`; slice-m1/request.*.test.js, slice-m4/request-*-s475, pending-cells-s475 |
| change lifecycle `(A to B)` rules | analyze `resolveLife` :1428, `lifeRead` :23537; slice-m4/lifecycle-*-s475 |
| change write / grant / edit rules | analyze `resolveFieldAt` :10838, `grantsHasEdits` :11333, `memberCall` :12222, `resolveLocalEdit` :12401; effects.scrml |
| change match/arm coverage | analyze `litInfo` :13910 .. `fallsThrough` :15130; parse `parseArmBody` :1100 |
| change server fns / SQL / envelopes | analyze `placePass` :32043, `composePass` :33093, `transportCarriers` :33191; sql.scrml; print-server.scrml; server-runtime.js `envelope` / `query` / `sqlErrorOf`; slice-m4/server-*, pg-*-s475 |
| change `lin` | analyze `linPass` :37408 .. `linHandled` :37830; acceptance/lin/ |
| change CSS | css-syntax.scrml, css-ingest.scrml, css.scrml, analyze `cssPass` :37307 |
| change URL / executable sinks | url.scrml + runtime.js guard block (`scripts/sync-bootstrap-url-guard.ts`); host-surface.scrml |
| add a conformance case | `conformance/cases/<category>/<id>/{case.scrml, expected.json}`; `bun scripts/bootstrap-conformance.ts --filter <id>` |
| add an acceptance case | `compiler/self-host-v2/acceptance/<category>/<case>/` + a `STATUS` row in slice-m4/acceptance.test.js |
| impl#1 twin of a bootstrap rule | `compiler/src/` (type-system.ts …). impl#1 changes need authorization: the bootstrap build, Bryan's tools, or Peter |

## impl#1 surfaces the bootstrap work leans on (carried from the S473 section, re-checked at f92d1a8fb)
- `scripts/bootstrap-conformance.ts` counts vacuous passes separately ("Non-vacuous holds" in docs/bootstrap-conformance.md).
- `scripts/scrml-boot.ts` plans the `<host src=>` modules the client artifact imports (`planHostSrcs`, slice-m1/host-src.js) and imports impl#1's ONE static-serve policy (`compiler/src/static-serve-policy.js`, §47.13) for `dev`.
- Claim gates: `scripts/claim-gate.js` (C1, every public scrml fence compiles; `docs/articles` is on the surface) + `scripts/claim-gate-c2.js` (C2, a repo-derived number must cite docs/FACTS.md or carry `<!-- claim: not-derived -->`); surface list `scripts/claim-gate-surface.js`.
- Windows ratchet: `scripts/windows-ratchet.ts` (validate | judge | retry-list | report), baseline `.github/windows-baseline.json` (each entry ties to an open gap), required through `gate`.
- impl#1 S473 changes still present: `compiler/src/codegen/server-navigate.ts` (server `navigate()` = `_scrml_server_navigate`; 204 + `X-Scrml-Navigate` for the fetch wrapper), `navigate()` inside `transaction {}` = E-TRANSACTION-CONTROL-FLOW (validators/lint-transaction.ts), type-system.ts `routeEntryAt` :11117.

## Section audit (pre-f92d1a8fb bootstrap.map.md → this file)
| old section | disposition |
|---|---|
| What it is | refreshed |
| Module roles (lines at d139f747c) | refreshed (line counts + entry anchors re-grepped at f92d1a8fb; runtime/support JS table added) |
| analyze.scrml anchors | refreshed (every anchor re-grepped; S475 request/lifecycle/transport/local-edit anchors added) |
| parse.scrml anchors | refreshed |
| S473 modules and gates | refreshed into "Module roles" (refusals/elements/host-surface/host-files/host-src rows) and "Tests" (lint-duplicate-fn, s472/s473 tests by suffix) |
| Build | refreshed |
| Tests | refreshed (counts re-taken; postgres-live job added) |
| Conformance probe | refreshed (executed at f92d1a8fb) |
| S473 gates and tooling around the bootstrap | spec-coverage → "Generated files"; the rest carried in "impl#1 surfaces the bootstrap work leans on" |
| If you need to change X, look at Y | refreshed (anchors re-grepped; request/lifecycle/envelope rows added) and mirrored in primary.map.md Task-Shape Routing |
| Tags, Links | replaced |

## Tags
#scrml #map #bootstrap #self-host-v2 #impl2 #analyze #parse #lower #conformance #request #s475

## Links
- [primary.map.md](./primary.map.md)
- [structure.map.md](./structure.map.md)
- [test.map.md](./test.map.md)
- [build.map.md](./build.map.md)
- [error.map.md](./error.map.md)
- [master-list.md](../../master-list.md)
- [pa.md](../../pa.md)
- [bootstrap-conformance.md](../../docs/bootstrap-conformance.md)
