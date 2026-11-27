# bootstrap.map.md
# project: scrml
# updated: 2026-11-26T22:24:19Z  commit: fa24c93bb
# Scope: `compiler/self-host-v2/` — the scrml-native bootstrap compiler (impl#2). NOT impl#1 (`compiler/src/`, TypeScript).
# Every `symbol :line` below was mechanically re-resolved against the tree at fa24c93bb (S483 refresh: each symbol is looked up by its top-level `fn`/`type`/`class` definition; no build was run). They drift: grep the symbol first.
# Conformance figures are copied from the committed bot-generated docs/bootstrap-conformance.md at fa24c93bb (NOT re-executed at the S483 refresh; no bun was run).

## What it is
impl#2 speaks the RULED language (§66 declaration forms, tapes with grants, `single` engines, `renders`). impl#1 (`scrml compile`) does not parse §66.
The bootstrap is scrml source that impl#1 compiles to JS (~9 s, then cached on disk) and runs.
Pipeline: `lex -> parse -> analyze -> lower -> (check) -> print`.
Types: `FileAst` (ast.scrml) -> `TypedProgram` = FileAst + NodeId side-tables (analyze.scrml) -> `CoreProgram` (core.scrml) -> JS/HTML text (print.scrml, print-server.scrml).
No `match` over a Core enum has a default arm (`scripts/lint-no-default-arm.js`). A new variant therefore fails `walk.scrml kids` at compile time with E-TYPE-020.

## Module roles (123,044 lines in 30 top-level `.scrml` at fa24c93bb)
| file | lines | role / entry symbols |
|---|---:|---|
| lex.scrml | 2455 | source -> `Token[]`; a pure fold `step` :1376 over a `(mode,event)` table; `makeCursor` :123 |
| ast.scrml | 929 | `FileAst` node types (`AStmt`, `AExpr`, `ANode`, `ADecl`, `ARequest` (S475), …); `Diag` :737; `newDiag` :740 takes its severity from `severityOf` |
| parse.scrml | 17628 | source -> FileAst. Entry `parseFile` :17567; `parseFileNs` :17576 (namespace-aware, S475; `PNs` :223, `nsOfItems` :227). See the anchors section below |
| link.scrml | 468 | parses a LINKED program as a pure function of the file set: `parseProgram` :458, `linkOrder` :270, `importTarget` :127, `canonicalSources` :77, `stdlibPrefix` :121 |
| core.scrml | 1653 | Core IR, data only: `Type`, `Expr`, `Stmt`, `View`, `Decl`, `Fn`, `ServerFn`, `Db`, `Envelope`, `CoreProgram` :1176. S475 added `RequestState` :877, `ReqClass` :881 and `View.Request` |
| walk.scrml | 831 | the structural traversal: `kids` :136 (total match), `allNodes` :455, `sharedRefs` :525, `boundSyms` :575, `assignedSyms` :750 |
| names.scrml | 256 | the one NameSupply for emitted identifiers |
| effects.scrml | 299 | effect summaries (transitive write sets, a fixed point over the static call graph; SPEC §6.15 / §6.7.4) |
| analyze.scrml | 59434 | binder + type/edit classifier + every semantic diagnostic. `analyze` :57804 -> `analyzeLinked` :57811; `analyzeSources` :57827 (S475) |
| lower.scrml | 5813 | `lower` :5188: TypedProgram -> CoreProgram (desugar only). `hasError` :78, `lowerExpr` :482, `lowerBlock` :1020, `lowerStmt` :1026, `lowerElem` :2442, `lowerDecl` :3260, `lowerFn` :3520, `lowerServerFn` :3569 |
| check.scrml | 6762 | `checkCore` :109: Core well-formedness, the printer's precondition (rule ids C-S1…, C11, C-R1…C-R3). `checkFieldSurface` :2074, `checkRequest` :2327, `checkReadRequest` :2480, `requestSelfTrigger` :2668, `checkStar` :4211, `blockWaits` :4929, `deferForbiddenStmt` :5321 |
| print.scrml | 8656 | Core -> JS + HTML text. `printProgram` :7119, `coreRefusal` :6001 (E-BOOTSTRAP-UNSUPPORTED), `serverCtx` :5348, `requestJs` :3860, `requestSlotStmts` :3892, `routeName` :968, `routePath` :7305, `routeJs` :7307, `calledServerFns` :7333 |
| print-server.scrml | 1060 | the server artifact: `printServer` :63 -> a `createServer(host)` factory |
| js.scrml / html.scrml | 457 / 159 | JS and HTML output trees and their one-shot printers |
| css.scrml / css-syntax.scrml / css-ingest.scrml | 606 / 1147 / 920 | CSS output tree, the ruled CSS reader, impl#1-FileAST CSS ingest (`ingestCss` :898) |
| meta.scrml | 5669 | `^{ … }` meta blocks (SPEC §22), s481/s482: phase 0 static checks, phase 1 compile-time `emit` / `emit.raw` / `reflect` through a bounded scrml interpreter over the bootstrap tree (E-META-EVAL-001), phase 2 runtime blocks. Entry `metaFiles` :82, called FIRST by `analyzeSources` so emitted markup is analyzed as source |
| emit-gate.scrml | 362 | the §22.4.1 / §22.12 attribute judge for markup a compile-time `^{}` emits (`emitAttrNameVerdict` :76); a scrml mirror of impl#1 markup-attr-allow-list.js, held equal by slice-m2/meta-s481.test.js |
| schema.scrml | 1564 | the `<schema>` body reader (§39.2: declarations, raw `CREATE TABLE` DDL, §39.3/§39.4/§39.5/§39.7 checks): `readSchemaBody` :1355; called from parse.scrml `finishSchema` :13885 |
| sql.scrml | 1426 | `?{}` SQL literal facts (kind, reads, writes) |
| url.scrml | 565 | §5.2 URL scheme reader + safe sets: `logicWriteSink` :477, `isUrlAttrName` :487, `logicCallSink` :513, `executableAttrName` :551 |
| codec.scrml | 406 | §57 wire codec, compile-time half (Core `Type` -> `WireTable`) |
| measure.scrml | 186 | Core size by node kind |
| ingest.scrml | 1443 | THROWAWAY shim: impl#1 FileAST -> Core (grades the bootstrap on the pre-§66 corpus) |
| refusals.scrml | 450 | the named-refusal table: `refusalTable` :89, `cascadeCode` :199, `relabelRefusals` :432. It only re-labels files the front end already rejects |
| elements.scrml | 287 | markup element registry (E-MARKUP-001): `isCustomElementName` :109, `isHtmlElementName` :127, `isKnownElementName` :134. Mirrors impl#1 `compiler/src/html-elements.js` |
| host-surface.scrml | 631 | `<host>` allowlist mirroring SPEC Appendix H (DRAFT): `findEntry` :99, `entryConflict` :274, `surfaceInterfaces` :302, `surfaceEntries` :342, `inertElements` :542, `surfaceDicts` :626 |
| severity.scrml | 522 | GENERATED: `severityOf` :58 from SPEC §34. Bot-owned post-merge; see "Generated files" below |

Runtime and support JS (not `.scrml`):
| file | lines | role |
|---|---:|---|
| slice-m1/runtime/runtime.js | 8238 | client runtime, copied next to the emitted output. Reactivity (`Cell` :271, `Derived` :475, `effect` :546, `effectOn` :691), the request machine (`requestOn` :1040, `requestSlot` :1080, `refetch` :1092, S475), `suspend` :1120, `waiting` :1163, tape ops, host surface (`hostCall` :2369, `hostInert` :2612), DOM (`each` :6249, `slot` :6192), codec (`encode` :6563, `decode` :6757, `CodecDefect` :6397), `call` :7210 (server call; `SERVER_CALL_DEADLINE_MS` :7155), `CSRF_COOKIE`/`CSRF_HEADER` :7369, `ScrmlTrap` :2087. The URL guard block is a verbatim copy of `compiler/src/runtime-url-guard.js` (`scripts/sync-bootstrap-url-guard.ts`) |
| slice-m1/runtime/server-runtime.js | 2612 | server runtime: `sqlText` :127, `connKey` :218, `connection` :300, `envelope` :648 (the §8.9.2 `!` envelope; Postgres uses a reserved connection), `query` :935, `sqlErrorOf` :1101 (PG and SQLite error classes), `encodeError` :1362, `failStatus` :1379, `route` :1463, `tenantGate` :1529, `server` :1591 |
| slice-codec/runtime/codec.js | 14 | wire codec runtime half |
| slice-m1/host-files.js, slice-m1/host-src.js | — | stdlib host-module copy (`copyHostFiles`) and `<host src=>` planning (`planHostSrcs`) |

## analyze.scrml anchors (59,434 lines; file order)
- Types/tables: `FieldInfo` :87, `SeqSnap` :241, `ReqSig` :288, `LocalEdit` :341, `RemoteFact` :441, `ExprType` :497, `noServerFacts` :600, `mint` :947 (the only Sym minter), `resolveLife` :2391, `typeInfos` :2654, `isEnumType` :2872, `capabilitiesDiags` :4024.
- Expression inference: `infOut` :4571, `refInf` :4875, `inferTernary` :5092, `retsInMaybe` :5323, `valInfoOf` :5817, `programFields` :6534.
- Resolver: `resolveExprs` :9739, `resolveExpr` :9758, `resolveVariant` :10700, `qualVariantValue` :14908, `strMethodNearest` :15063, `isPositionArg` :15313, `discardedArms` :15587, `resolvePropValues` :16758, `resolveFieldAt` :18468 (the write/edit classifier).
- Grants, tape methods, statements: `grantsHasEdits` :18997, `memberCall` :20471, `resolveLocalEdit` :20663 (S475 local tape edits), `resolveRemoveCall` :20926, `resolveStmt` :21788, `deferJump` :22018, `blockReference` :22402.
- Match/arm coverage: `litInfo` :23115, `coverDiags` :23659, `remoteHandled` :23839, `patName` :24190, `fallsThrough` :24653.
- S475 request / pending cells: `ReqFact` :25290, `reqSigIndex` :25488, `resolveRefetch` :25599, `resolveRequest` :25643, `resolvePending` :25851.
- Lifts/loops: `resolveForLocal` :26924, `loopChecks` :27622, `isDeferStmt` :28007, `typeLift` :28248, `planLoop` :28527; `bindValAttrs` :32077; `checkScopes` :35153; exports `exprType` :36346, `presenceTest` :36424.
- Typer (flow typing): `contribute` :37957, `lifeRead` :38032 (S475 lifecycle reads), `checkPartial` :39112, `comparatorCheck` :39611, `checkOperands` :40189, `typeCall` :41342, `arityMessage` :41648, `plainFactOf` :42082, `typeStmt` :42276, `joinPaths` :42438, `typeStmtExpr` :42611, `checkIndex` :42908, `typeLocalEdit` :43087, `typeRequest` :43726, `typeEach` :43881, `typeProgram` :44052, `typePass` :44085, `typeProgramBody` :44181, `typeFieldMarkup` :44196, `typeProgramItem` :44230, `typeFn` :44376.
- Request passes: `requestPass` :45469, `requestWarnPass` :45601, `pendingCells` :46367.
- Placement / composition / plans: `placePass` :48715, `composePass` :49910, `transportCarriers` :50008, `composeOne` :50087, `summarize` :52191, `RetFact` :53389, `noPlan` :53392, `planPass` :53435, `requestPlan` :53489, `planStmt` :53741.
- `cssPass` :55195; `linPass` :55296 (`linFrom` :56000, `linGiven` :56140, `linHandled` :56422), the `lin` single-use checker (E-LIN-*).
- Driver: `analyze` :57804.

## parse.scrml anchors (17,628 lines)
`parseAssign` :614, `parseTernary` :645, `parseArmBody` :2134, `parseArmBlock` :2226, `parsePrimary` :2939, `parseKeywordPrimary` :3767, `parseBlock` :3924, `parseStmt` :4547, `parseDepItem` :4909,
`parseForDecls` :6392, `parseDeclarator` :6410, `parseFail` :7402, `parseLogicItems` :8816, `parseFn` :9947, `parseAttrValue` :10316, `parseCodeRun` :12308, `parseMarkupNode` :14921,
`isRequestBody` :15211 / `finishRequest` :15219 / `requestBody` :15231 (S475 `<request>`), `parseDeclBody` :15553, `parseDeclChild` :15597, `parseMarkupItems` :15626, `parseMarkupItem` :15690, `parseFile` :17567.

## S475 surface (fa0e875b4..f92d1a8fb, PRs #1744–#1812)
- `<request>` (§6.7.7) and pending cells (§13.9): parse (`ARequest`), analyze (`resolveRequest`, `typeRequest`, `requestPass`, `pendingCells`), Core `View.Request` + `RequestState` + `ReqClass` (READ requests abort a superseded transport; WRITE requests are discarded), check C-R1…C-R3, print `requestJs`, runtime `requestOn` / `refetch`. `<#id>` reads + `refetch()`. W-REQUEST-ID-UNREFERENCEABLE.
- Lifecycle types `(A to B)` / `(not to T)`: read rule E-TYPE-001 + write contract (`resolveLife`, `lifeRead`).
- Client `!` transport: every client `!` fn that `?`-propagates a server call is a transport carrier (`transportCarriers`); §19.9.5 literal carriers.
- Postgres `!` envelopes: reserved connection per envelope, PG error classes (`sqlErrorOf`), statement savepoint for a site-handled `?{}`; E-TX-FAIL-AFTER-COMMIT.
- `.scrml` namespace import (`parseFileNs`, `nsMember`); local tape edits are grant-checked (`resolveLocalEdit`); `<optgroup>` nesting refusal; value-`if` with object-literal arm; Partial/OneOf member judging (`checkPartial`).
- scrml-boot output hardening: race-free `-o` writes, hard-link-safe outputs (`OutDirError` in scripts/scrml-boot.ts :800).

## S476-S483 surface (f92d1a8fb..fa24c93bb; 304 first-parent merges; from commit subjects, not re-run)
- Syntax migration: statements end with `;` and arm `,` (Track M step 2; the self-host sources were migrated and `while` removed; `scrml fix --loop-interim`). Conformance cases were migrated to the required `;` (S478).
- S476: `<page>` inside `<program>` (§40.8); in-place edit of a local tape (`slice-m4/tape-inplace-s476`).
- S477: bounded-length tapes + `insert` (O36; E-WRITE-INVARIANT-RT; `tape-bounds-s477`, `tape-forms-s477`); nested function declarations (§7.3.1); `<program kind="tool">` (§64); pending-cell residue; compile time made near-linear (2,720-line app 16.6 s -> 1.0 s; S480 `compile-scaling-fn-count-s480.probe.js`).
- S478: `<schema>` reader (schema.scrml, §39) incl. raw DDL; `<channel>` (§38) parse/analyze/serve with op-based sync; `<endpoint>` (§61); function types/values and block-bodied lambdas; refinement runtime checks (§53.4.5); destructuring; `print`/`println` (§20.7); `?.` (§42.3.6); E-TYPE-046; duration literals, `debounced=`/`throttled=`, `<onIdle>`; re-export forms and import-cycle reporting (§21.4).
- S479: timed engine + `<onIdle>` watchdog; file-scope `let` and per-artifact file-scope initializers; E-PAGE-DUPLICATE, E-MATCH-FOR-REQUIRED, E-TYPE-024; server copy of a waiting helper; channel `__seen`/`__refused`/backoff/trusted-proxies.
- S480: W-UNUSED-BINDING lint; bootstrap build mode (item 10); census cheap wins (`??`, bare `@.`, `is .Variant`, `class:`); trap unit is the effect; statement-arm lift; tool initializers; E-ENDPOINT-ATTR-INVALID.
- S481-S482: `^{}` meta phases 0-2 (meta.scrml, emit-gate.scrml); `|` arm-pattern alternation (§18.2); markup values; `as` adjacency ruling; keyword-named members; RCDATA `${}`; client artifact tree-shaken to client-run functions (§12.2 T6); host calls unproven under the §6.7.4 no-write rule + effect run cap; `value-no-write`, `write-only-secret`; variant colons deprecated.
- S483: `body-cell-server-only-s483`; §66.13.5 invariant rules 2/6/7 landed in SPEC (#2120) with 7 conformance cases pinned in the `host-global` CI job because impl#1 cannot parse them.
- SPEC section anchors moved: SPEC.md grew ~2,000 lines. Headings at fa24c93bb: §22 :28029, §34 :31360, §49 (Loops) :39984, §66 :52932, §67 :56565, §68 :57028. SPEC-INDEX section ranges lag HEAD by ~11-23 lines past §22 (bot regenerates post-merge); trust `grep -n '^## N\.' compiler/SPEC.md`.

## Build
- `scripts/scrml-boot.ts` (1,591 lines). `bun run boot:compile <file.scrml> [--output-dir d] [--format pretty|line] [--columns bytes] [--rebuild]`; `bun run boot:dev <file.scrml> [--port n]`.
  Output: `index.html`, `program.client.js`, `scrml-runtime.js`; plus `program.server.js` + `scrml-server-runtime.js` when the client calls server fns; `_scrml/<module>/<file>` for stdlib host files.
  `<dir>/.scrml-boot-manifest.json` records the files each build wrote; the next build deletes only those. Exit codes: 0 clean, 1 an Error diagnostic or printer refusal, 2 usage error / refused output dir / crash.
- Cache: `$SCRML_BOOT_CACHE_DIR`, else `$XDG_CACHE_HOME/scrml/boot-bundle`, else `~/.cache/scrml/boot-bundle`. The key hashes every self-host-v2 `.scrml`, all of `compiler/src`, the package version and the harness.
- Module lists: `MODULES` (slice-m1/harness.js :21) and `M2_MODULES` (slice-m2/harness.js :9; it spreads `MODULES`, then adds lex, severity, elements, ast, host-surface, css-syntax, sql, parse, link, emit-gate, meta, effects, analyze, lower, refusals). `bundleInputFiles` hands impl#1 the bundle entry + every listed module. NOTE: schema.scrml (imported by parse.scrml) and css/ingest modules are NOT in either list; whether an unlisted module that something imports is picked up through import resolution was not exercised at the refresh, so add a new module to the list unless a build proves otherwise. `buildBundleChunks` also runs the file-scope name-collision lint (E-SCOPE-010, s479) before impl#1 compiles.
- `lsp-boot/` (`server.ts`, `diagnostics.ts`, `worker.ts`; `bun run lsp:boot`): a diagnostics-only language server over the bootstrap.

## Tests (outside the bunfig root, so a plain `bun test` does NOT run them)
CI `slices` job (`.github/workflows/ci.yml` :538, bun 1.4.3), a 2-leg matrix that runs `bun scripts/ci-slices.ts run <i>/2` (S480): slice-m4 is split with `bun test --shard` balanced by scripts/ci-test-timings.json; every other group runs whole in one leg (`GROUPS`: the two lints, slice-m1, slice-m2, slice-m1 with SLICE_CORE=lowered, slice-m3, slice-codec, e2e-render-map). `bun scripts/ci-slices.ts plan <N>` prints the deal. The groups, as commands:
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
CI `postgres-live` job (:716, a postgres:18 service; required through `gate` since #1791) runs `slice-m4/{pg-envelope,sql-error-pg,statement-savepoint-pg}-s475.test.js` with `SCRML_TEST_PG_URL` + `SCRML_TEST_PG_REAL=1`, and fails if any test skipped.
- slice-m1 (12 test files; S481 adds `hold-body.runtime.test.js`): Core + printer + runtime oracle (hand-built Core `.core.scrml`); `request.core.test.js`, `request.runtime.test.js` (S475).
- slice-m2 (14; S478-S481 add `refinement-s478`, `meta-s481`; helpers `no-unused-lint.js`, `scaffold-cells.js`): front end (`parse.test.js`, `front.test.js`, `lower.test.js`, `typer*.test.js`); `harness.js` `loadM2()`.
- slice-m3 (5): CSS / ingest; the css oracle drives puppeteer (Chromium).
- slice-m4 (290): language features by topic, the session in the suffix (`-s469` … `-s483`; newest `body-cell-server-only-s483`, `write-only-secret-s482`, `value-no-write-s482`). `acceptance.test.js` grades `acceptance/**` and holds a `STATUS` map (relDir -> [bucket, codes]). A new acceptance case needs a row there. Chromium tests are gated on `SCRML_CHROMIUM` / `SCRML_BROWSER_TESTS`.
- slice-codec (2): `codec.test.js`, `cross-impl.test.js`.
- `acceptance/<category>/<case>/{case.scrml, expected.json}`: 286 cases in 27 categories (S479+: `tapes/join-primitives`, `tapes/neg-join-struct` replaced `tapes/neg-join-int`) (arms control-flow css db-body db-cells display envelope grants guess imports interp lin loop loop-value match o61 opener parse positions request security strings tapes templates termination toenum variants). `neg-*` cases must be refused.
- Single test: `bun test compiler/self-host-v2/slice-m4/<file>.test.js`.

## Conformance probe (figures from docs/bootstrap-conformance.md at fa24c93bb; not re-executed)
`scripts/bootstrap-conformance.ts` runs every `conformance/cases/**` case through the pure bootstrap (the front end for codes; printer + runtime in happy-dom for the runtime half).
| bucket | cases |
|---|---:|
| attempted | 1973 |
| PASS | 851 (43.1%; 15 vacuous, 836 non-vacuous) |
| CODES-ONLY | 0 |
| FAIL | 3 (1 needs a code the bootstrap never emits; 2 answer wrong) |
| NOT-TWINNED | 628 |
| UNSUPPORTED | 491 (all bootstrap-unsupported) |
| LEGACY / CRASH / INVALID | 0 / 0 / 0 |
Graded = 854, of which 851 hold (99.6%); the runtime half ran for 289 cases. Legacy-dialect cases graded on a generated §66 twin: 902 (PASS 530 · FAIL 3 · UNSUPPORTED 369). At f92d1a8fb the same table read 302 PASS of 545 graded (55.4%) over 1,827 attempted.
The table above is a copy of the committed bot-owned `docs/bootstrap-conformance.md` (1,973 attempted; `find conformance/cases -name expected.json` counts 1,986 at fa24c93bb, so the bot report lags HEAD by 13 cases).
Flags: `--filter <substr>`, `--cases <dir>`, `--json <path>`, `--write` (regenerates the report), `--check`, `--ratchet`. Twins come from `compiler/src/commands/fix-s66.js`; per-case `dialect.s66` overrides.

## Generated files (bot-owned post-merge since S474)
`.github/workflows/generated-regen.yml` regenerates on main after each merge: severity.scrml -> SPEC-INDEX -> bootstrap-spec-coverage totals -> docs/generated/* -> bootstrap-conformance.md -> FACTS.md. PRs commit sources only.
- `severity.scrml`: run `bun scripts/gen-bootstrap-severity.ts` only when `slice-m4/severity.test.js` fails (an answer changed). A new code literal anywhere in the bootstrap makes the file stale. The bot fixes byte drift that changes no answer.
- `docs/bootstrap-spec-coverage.md`: hand-written rows (BUILT / PARTIAL / REFUSED-LOUD / DEFERRED-RULED / N/A / SILENT-* / UNVERIFIED) + bot totals. Gate `scripts/spec-coverage-check.ts` (not run at the refresh). Bot totals block in the file at fa24c93bb: 1,116 rows (BUILT 329, PARTIAL 163, REFUSED-LOUD 288, DEFERRED-RULED 59, N/A 222, SILENT-ACCEPT 15, SILENT-ABSENT 31, UNVERIFIED 9); 46 SILENT rows, all carrying a gap id.

## If you need to change X, look at Y
| task | where |
|---|---|
| add a diagnostic code | SPEC §34 row (+ SPEC-INDEX) unless bootstrap-only; emit it in parse.scrml (syntax), analyze.scrml (names/types/flow/lin/placement), check.scrml (Core invariant) or print*.scrml `coreRefusal` (printer-only); an acceptance case; severity.scrml if `severity.test.js` fails |
| add a parser construct | lex.scrml (a new token class only); parse.scrml (`parseStmt` / `parsePrimary` / `parseMarkupItem` / `parseDeclChild` / `parseAttrValue`) + a node in ast.scrml; then analyze + lower must handle it (totality makes a missing arm a compile error) |
| add a lowering / Core node | lower.scrml; the variant in core.scrml + `kids` (walk.scrml) + measure.scrml + a printer arm (print.scrml) + a check rule (check.scrml); run `SLICE_CORE=lowered bun test slice-m1` |
| change emitted JS/HTML | print.scrml (client), print-server.scrml (server), js.scrml / html.scrml; runtime behaviour in slice-m1/runtime/{runtime,server-runtime}.js |
| change type checking | analyze.scrml typer (`contribute` :37957 .. `typeFn` :44376); inference (`infOut` :4571 .. `valInfoOf` :5817) |
| change `<request>` / pending cells | analyze `resolveRequest` / `typeRequest` / `requestPass` / `pendingCells` / `requestPlan`; core `View.Request`; check `checkRequest`; print `requestJs`; runtime `requestOn`; slice-m1/request.*.test.js, slice-m4/request-*-s475, pending-cells-s475 |
| change lifecycle `(A to B)` rules | analyze `resolveLife` :2391, `lifeRead` :38032; slice-m4/lifecycle-*-s475 |
| change write / grant / edit rules | analyze `resolveFieldAt` :18468, `grantsHasEdits` :18997, `memberCall` :20471, `resolveLocalEdit` :20663; effects.scrml |
| change match/arm coverage | analyze `litInfo` :23115 .. `fallsThrough` :24653; parse `parseArmBody` :2134 |
| change server fns / SQL / envelopes | analyze `placePass` :48715, `composePass` :49910, `transportCarriers` :50008; sql.scrml; print-server.scrml; server-runtime.js `envelope` / `query` / `sqlErrorOf`; slice-m4/server-*, pg-*-s475 |
| change `lin` | analyze `linPass` :55296 .. `linHandled` :56422; acceptance/lin/ |
| change CSS | css-syntax.scrml, css-ingest.scrml, css.scrml, analyze `cssPass` :55195 |
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

## Section audit (S483 refresh at fa24c93bb)
Every section below was refreshed for line anchors, counts and CI line numbers; added: meta/schema/emit-gate rows, "S476-S483 surface", sharded-CI description, conformance table (bot report copy). Not re-executed: conformance, spec-coverage gate, slice suites.

### Section audit (pre-f92d1a8fb bootstrap.map.md → the f92d1a8fb file)
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
#scrml #map #bootstrap #self-host-v2 #impl2 #analyze #parse #lower #conformance #request #s475 #s483 #meta #schema

## Links
- [primary.map.md](./primary.map.md)
- [structure.map.md](./structure.map.md)
- [test.map.md](./test.map.md)
- [build.map.md](./build.map.md)
- [error.map.md](./error.map.md)
- [master-list.md](../../master-list.md)
- [pa.md](../../pa.md)
- [bootstrap-conformance.md](../../docs/bootstrap-conformance.md)
