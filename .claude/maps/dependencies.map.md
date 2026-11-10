# dependencies.map.md
# project: scrml
# updated: 2026-11-08T16:47:39Z  commit: f92d1a8fb
# Versions: package.json range, then the installed node_modules version in parentheses. Runtime: bun >=1.3.13 (engines); CI pins bun 1.4.3.

## Runtime Dependencies
@modelcontextprotocol/sdk@1.29.0 — MCP server/client; used by the MCP tests (compiler/tests/integration/mcp-*)
acorn@^8.16.0 (8.16.0) — JS parser: expression parsing, emit validation, host-src export reads
astring@^1.9.0 (1.9.0) — ESTree -> JS text (expression-parser.ts, types/ast.ts)
pg@^8.22.0 (8.22.0) — Postgres driver, loaded by emitted `<channel watches=>` server code via `import("pg")` (codegen/emit-channel.ts :1086)
vscode-languageserver@^9.0.1 (9.0.1) — LSP protocol server (lsp/, lsp-boot/)
vscode-languageserver-textdocument@^1.0.11 — the LSP text-document model (lsp/server.js, lsp-boot/server.ts)

## Dev / Build Dependencies
@happy-dom/global-registrator@^20.8.9 / happy-dom@^20.8.9 (20.8.9) — DOM for runtime tests (browser tier, the bootstrap slice-m1 runtime, conformance runtime half)
@playwright/test@^1.49.0 (1.60.0) — e2e/ tests (`bun run e2e`)
marked@^14.1.3 (14.1.4) — markdown -> HTML for docs/build.ts
puppeteer@^24.40.0 (24.40.0) — Chromium oracle: slice-m3 css-oracle.js, slice-m4 `*-chromium-*` tests, browser tier
typescript@^5.9.2 (5.9.3) — type-check only (`bun run types` / scripts/types-gate.ts); bun runs .ts transpile-only

## Host builtins used directly
bun (Bun.SQL drives Postgres/SQLite in the bootstrap server runtime and the emitted server code; bun:sqlite; bun:test), node:fs, node:path, node:os, url, module.

## Internal Module Graph (impl#1, from import statements)
compiler/bin/scrml.js → compiler/src/cli.js
cli.js → commands/{init,compile,dev,build,serve,migrate,fix,db-migrate,promote,generate,introspect,semdiff}.js
commands/compile.js, commands/build.js, commands/dev.js → api.js (+ commands/refusal-gate.js)
api.js → block-splitter.js, ast-builder.js, component-expander.ts, md-lower.ts, validators/*, protect-analyzer.ts, route-inference.ts, type-system.ts, meta-checker.ts, meta-eval.ts, dependency-graph.ts, batch-planner.ts, reachability-solver.ts, auth-graph.ts, module-resolver.js, name-resolver.ts, symbol-table.ts, code-generator.js, codegen/{route-splitter,emit-server,emit-worker,emit-css,host-global-alias,validate-emit,...}.ts, lint-*.js, gauntlet-phase{1,3}-*.js
type-system.ts → ast-builder.js, expression-parser.ts, types/ast.ts, presence-narrowing.ts, narrowing-write-set.ts, route-inference.ts, module-resolver.js, failable-value-calls.ts, value-function-stored.ts, codegen/{rewrite,emit-control-flow,sql-attempt,sql-lex,collect}.ts, runtime-url-guard.js
codegen/index.ts → emit-{logic,html,css,server,client,control-flow,machines,engine,library,tool,test,worker}.ts, runtime-chunks.ts, render-waiting-calls.ts, server-navigate.ts, js-async-analysis.ts, …; ../runtime-template.js, ../schema-differ.js, ../tool-program.ts
lsp/handlers.js → compiler/native-parser/{lex,token}.js, compiler/src/{ast-builder,block-splitter,dependency-graph,protect-analyzer,route-inference,type-system}.js, diagnostic-secrets.ts

## Internal Module Graph (impl#2 bootstrap; from `import … from "./x.scrml"`)
parse → ast, css-syntax, host-surface, lex, severity, url
link → ast, parse
analyze → ast, codec, core, effects, elements, host-surface, lex, link, parse, severity, sql, url
lower → analyze, ast, core, css, severity, walk
check → codec, core, url, walk
print → check, codec, core, css, elements, host-surface, html, js, names, walk
Bundled by slice-m2/bundle.scrml (module lists: slice-m1/harness.js `MODULES`, slice-m2/harness.js `M2_MODULES`); refusals.scrml `relabelRefusals` is imported by slice-m2/bundle.scrml.
code-generator.js (impl#1) is a facade re-exporting codegen/index.ts.
scripts/scrml-boot.ts → slice-m1/harness.js + slice-m2/harness.js (builds the bundle with impl#1), slice-m1/host-src.js, slice-m1/host-files.js; it imports impl#1's static-serve policy for `dev`
lsp-boot/{server,diagnostics,worker}.ts → scripts/scrml-boot.ts
scripts/bootstrap-conformance.ts → the same bundle + compiler/src/commands/fix-s66.js (twins) + conformance/cases

---

# Carried detail (pre-f92d1a8fb body sections)
The sections below are the previous map generation's body (mostly impl#1, `compiler/src`), carried rather than lost. They were NOT re-read line by line. Each carries a verification line from f92d1a8fb: code identifiers checked to exist, `symbol` :line anchors re-derived by grep, cited paths checked, cited gaps whose marker is no longer `open`, and STALE-RISK flags for the CI/bot facts that changed in S468–S475. Where a carried section disagrees with a refreshed section above, the refreshed section wins.

## (carried) MANIFEST SHAPE — one manifest, allowlisted
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 0/0 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. Paths cited that do NOT exist at f92d1a8fb: `compiler/package.json`._

There is exactly ONE package manifest in the repo (root `package.json`, v0.8.0 as of S437 — was v0.7.1); `compiler/package.json`
and `"workspaces": ["compiler"]` were deleted at `171f5f23`. `acorn` and `astring` live in the root
`dependencies`; `"private": true` is gone; a `files` ALLOWLIST governs what publishes. Any doc still
describing a `compiler/` workspace at v0.2.0 is stale.

## (carried) Published surface (`files` allowlist — new this window)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 2/2 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
`compiler/bin/`, `compiler/src/`, `compiler/native-parser/`, `compiler/runtime/`, `stdlib/`,
`README.md`, `LICENSE`. It is an ALLOWLIST, not a denylist — **anything new is excluded by
default**. `stdlib/` is REQUIRED at runtime (`module-resolver.js`'s `STDLIB_ROOT` resolves
`../../stdlib`), not optional. Deliberately excluded: `compiler/tests` (20M), `self-host*`,
`samples/`, `examples/` (12M), `SPEC.md`/`PIPELINE.md` (docs live on scrml.dev).

## (carried) Editor-tooling Dev Dependencies — editors/vscode/package.json
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 0/0 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
vscode-textmate, vscode-oniguruma — bundled TextMate-grammar test harness (tokenize.js / regression-scan.js); not part of the compiler pre-commit gate, needs its own `npm i`.

## (carried) CI-only External Actions (not npm deps — GitHub Actions)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 3/3 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. STALE-RISK: mentions cloud-maps.yml: since S474 it writes nothing (thread-board probe only)._
actions/checkout@v4, oven-sh/setup-bun@v2 — the only actions any AUTO-TRIGGERED workflow now uses. **`anthropics/claude-code-action@v1` is no longer reachable on any automatic trigger (S310, #351):** `cloud-maps.yml`'s Stage 2 (the project-mapper leg) was DELETED outright, and `advisory-review.yml` was demoted to `workflow_dispatch`-only. It remains referenced ONLY in that manual-fire job, which is the sole consumer of `ANTHROPIC_API_KEY`. **This was a COST decision, not a broken secret** — treat any map/doc line saying "the key IS set and the daily run passes it" as retired. `MAPS_PAT` (a fine-grained PAT) is still the checkout/PR identity for `cloud-maps.yml`'s surviving deterministic stages.

## (carried) Runtime Engine
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 0/0 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
bun>=1.3.13 — required; no Node support (Bun-specific APIs used throughout: Bun.serve, bun:sqlite, Bun.$, Bun.SQL, Bun.hash). The DB-authoritative tier depends on `Bun.SQL`'s transaction API (`sql.begin`) and `bun:sqlite`'s `Database` for the `scrml db-migrate` apply loop — both already-bundled.

**Zero NEW external dependency this window, and zero manifest diff at all** (`git diff
fe14c9b2..HEAD -- package.json` is empty). One INTERNAL edge is new and worth knowing:
**`codegen/scheduling.ts` now imports `acorn` directly** (`import { parse as acornParse } from
"acorn"`) — the GH #264 rewrite models emitted-JS scopes with the real parser instead of a flat-text
scanner. `acorn` was already a root runtime dependency (the E-CG-001 egress scan, escape-hatch
parsing, cell-accessor-rename), so this widens the internal consumer set, not the dependency set.

## (carried) Internal Module Graph — compiler pipeline (compiler/src/api.js is the spine)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 233/238 code identifiers found in source (not found: `_showInjectFreshStyle`, `_showMergeIntoStyle`, `buildInitialBoolMap`, `distServerPathOf`, `initialBoolMap`); symbol line anchors: 0 confirmed, 30 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. Cited gaps whose marker is no longer open: g-cps-scheduler-opaque-boundary-hides-nested-server-calls=resolved, g-given-block-server-call-no-autoawait=resolved, g-hash87-member-read-await-misparen=resolved, g-serve-tool-treeshakes-main-only-import=resolved, g-ternary-init-server-call-await-misbind=resolved. Paths cited that do NOT exist at f92d1a8fb: `compiler/src/codegen/ast-if-chain.js`, `scripts/mapgen.ts`._

⛑ **S402 — RE-WALKED AT `499eecce`: 195 source files · 699 local import edges** (was 192 · 672 at
`fc6df72e`), by `flogence/scripts/mapgen.ts --kind deps`. **+24 edges, and the largest single
contributor is #859's file-shape consolidation** — see the first row of the table below.


| Stage | Module(s) | Feeds |
|---|---|---|
| **⛑ FILE SHAPE — SEVEN IMPORTERS OF ONE LEAF, AND FOUR OF THEM ARE HAND COPIES THAT WERE DELETED (NEW row, S402, #859 `85ebbb5f`)** | **`compiler/src/library-shape.js`** (240L) — the SINGLE SOURCE for `classifyFileShape` / `isRecognizedNonEntryShape` / `isLibraryShape` / `isForeignLangLibDecl` | ⛑ **THE EDGE THAT MATTERS IS THE ONE POINTING *INTO* THE TYPE BARREL: `library-shape.js -> types/ast.ts` (`FILE_SHAPES` RE-EXPORT, `:121`) — a `.js` leaf importing from `.ts`, which is unusual in this tree and is FORCED.** `FileShape` is `(typeof FILE_SHAPES)[number]`; declaring the array in `library-shape.js` instead would make the derivation hit TS7016 and collapse the union to `any`. **Do not "clean this up" by moving the array down to the leaf.** ⚑ **NEW IMPORTERS THIS WINDOW (all #859):** `compute-pgo-flags.ts` (the PRECG STAMP) · `component-expander.ts` (the CE RE-STAMP) · `codegen/index.ts` (`getFileShape`). **CHANGED IMPORTERS:** `ast-builder.js` · `api.js` · `tool-program.ts` each swapped `isForeignLangLibDecl` for `classifyFileShape` / `isLibraryShape` / `isRecognizedNonEntryShape`. ⛔ **FOUR HAND COPIES OF THE SHAPE PREDICATE WERE DELETED INTO THIS LEAF, AND ONE OF THEM CITED `ast-builder.js line 12222` — ~7,700 LINES STALE, pointing into an unrelated part of a 20k-line file.** None of the four knew about `"pure-channel"`. ⚠ **THE READ ORDER IS A REAL CONSTRAINT: `api.js`'s W5a is the ONLY PRE-CE READER**; `tool-program.ts` and `codegen/index.ts` run post-CE and want the RE-STAMPED answer. See domain.map.md. |
| **⛑ §17.1.1 `if-chain` CHILD SHAPE — ONE LEAF, 14 IMPORTERS, 35 CALL SITES, AND *ONE* REMAINING DELIBERATE NON-EDGE (created #805, widened #811, closed onto route inference #818)** | `compiler/src/ast-if-chain.js` — ⚠ **`src/` ROOT, NOT `codegen/`**; `compiler/src/codegen/ast-if-chain.js` does not exist, and consumers import it as `"../ast-if-chain.js"` from `codegen/` and `"./ast-if-chain.js"` from `src/`. **Re-derived at `8e278c73`: 14 importing modules, 35 call sites** (`grep -rl 'from "\.\{1,2\}/ast-if-chain.js"' compiler/src/` -> 14; `ifChainChildNodes(` minus the definition -> 35) — up from 13/32, the delta being **#818's NEW `route-inference.ts:92` edge** plus three call sites (`collect.ts:215`, `route-inference.ts:1137`, `route-inference.ts:1199`). ⛑ **THE NEW EDGE IS SECURITY-BEARING AND ITS DIRECTION MATTERS:** route inference must claim a branch-declared `server fn` BEFORE `codegen/collect.ts` hands the function list to the CLIENT emitter, or the `server fn` BODY ships into `client.js` with no `server.js` — see invariant 86 in primary.map.md. ⚠ **ONE DELIBERATE NON-EDGE REMAINS: `symbol-table.ts:10642`** is a TOTAL `Object.keys` walk that already reaches `branches[].element`; routing it through this enumerator of KNOWN fields would NARROW it. | ⚠ **THIS ROW WAS MALFORMED: two cells in a three-column table.** Closed S397 with this cell rather than by reflowing the prose, because the prose is load-bearing and the defect is structural. **A short row does not error — markdown pads it — so a `sort`/`uniq` on pipe counts is the only thing that sees it.** |
| CLI dispatch | cli.js | commands/{compile,dev,build,serve,migrate,db-migrate,promote,generate,init,introspect,semdiff}.js — **11 verbs** |
| Split | block-splitter.js | ast-builder.js, native-parser/parse-file.js |
| **BS-LINT (Stage 2.5 / 2.5b / 2.5c) — three passes that read BLOCK-SPLITTER output, before the AST exists** | `lint-w-interp-in-raw-content.js` (2.5) · `lint-w-input-state-markup-nonreactive.js` (2.5b) · **`lint-e-state-block-statement-form.js` (2.5c, NEW #718)** | `collectErrors("BS-LINT", …)` → `result.warnings` for 2.5/2.5b, **`result.errors` for 2.5c** (`E-` prefix + `severity:"error"`; CLI exit 1). ⚑ **THE NEW NODE IMPORTS NOTHING — it is a leaf by necessity, since anything it pulled from a later stage would invert pipeline order.** Cost: its `STATE_BLOCK_NAMES` / `STATE_BLOCK_ON_LIFECYCLE_RE` are COPIES of `ast-builder.js:1169` (⛑ S383 +9) / `:756-757`, unenforced. ⚠ **2.5 and 2.5b wrap their call in `try`/`catch`; 2.5c deliberately does NOT** — a swallowed throw in an error gate is fail-OPEN. error.map.md. |
| Parse (live) | ast-builder.js, expression-parser.ts | type-system.ts, symbol-table.ts, codegen. **`expression-parser.ts` now also exports `forEachIdentInExprNode`**, consumed by `emit-server.ts`'s D-5 module-const resolvability check. |
| Parse (native, canary) | native-parser/*.js (paired w/ *.scrml) | native-walker/*, native-parser-canary/within-node-classifier.ts, lsp/handlers.js. **Parity obligation PAID this window** for `ifRaw`/`ifCond` — see the §17.1.2 chain below. |
| Tag-canonicalize (Stage 3.055 TC) | tag-canonicalizer.ts | landmark-tag.ts + api.js |
| Component expand | component-expander.ts | validators/post-ce-invariant.ts, attribute-interpolation.ts, attribute-allowlist.ts. **Every downstream consumer that keys on `node.id` depends on this stage's per-expansion clone (S299)** — `codegen/emit-each.ts` (fence ids / `_scrml_each_renderers`), `codegen/chunk-namespace.ts` (id-derived tokens). `_deepCloneAst` is INTERNAL (not exported); its two callers are `expandComponentNode` (:3754) and `_cloneChannelDecl` (:6551). |
| Protect / route infer | protect-analyzer.ts, route-inference.ts | codegen/protect-egress.ts, codegen/egress-field-scan.ts (E-CG-001). **protect-analyzer.ts is the SOLE `E-PA-*` fire site (7 codes); `E-PA-002`'s message leads with the `<schema>` + `scrml db-migrate` remedy (S292).** |
| **§12.2 Trigger 3 — server-only import escalates the USING FUNCTION (S299), and Step 3b REFUSES the derived RHS it cannot reach (NEW #486, S331)** | **route-inference.ts** — `ESCALATION_SERVER_ONLY_MODULES` (:762) / `isEscalationServerOnlyModule` (:780) / `buildPerFileEscalationServerOnlyBindings` (:6079) / `collectServerOnlyBindingModules` (:6145) -> `importTriggers` -> `directTriggers`. **NEW second entry point: Step 3b (:4429)** -> `collectDerivedCellDecls` (:6538) -> `collectDerivedRhsServerOnlyRefs` (:6424) -> `RIError("E-DERIVED-SERVER-ONLY-REACH")`. **Both halves share ONE walk, `scanForServerOnlyBindingRefs` (:6259), extracted at S331 with no behavioural change to the function path** — the two callers differ only in what they hand in as `root` and how they derive their shadow set (`collectLocalNames` vs `collectDerivedRhsLocalNames` :6370). It returns local NAMES→modules, not just modules, because the derived diagnostic must name the offending member and a discarded name cannot be reconstructed. | Function half: `RouteInfo.escalationReasons` -> `codegen/emit-server.ts` (reusing the EXISTING `server-only-resource` reason kind, NOT a new variant — `isBodyOnlyEscalation`'s `.every()` and `describeServerTrigger` both already encode that expectation). Derived half: **an ERROR, not a placement** — it terminates the compile. **DO NOT confuse `ESCALATION_SERVER_ONLY_MODULES` with the pre-existing `SERVER_ONLY_SCRML_MODULES` (:685) seventy lines above it** — that one feeds the `api.js` STDLIB-EXPORT-SEED async backstop, where over-inclusion is SAFE; escalation INVERTS that safety (under-include = a browser leak, over-include = a wrong relocation, measured at 72 corpus sites). **They are two sets, two safe-error directions, one file, and this window did not change either one.** See domain.map.md. |
| Type check | type-system.ts, meta-checker.ts | dependency-graph.ts, auth-graph.ts. **`visitStructuralIfAttr` (:18133) must run BEFORE the `each:` scope push** — see the §17.1.2 chain below. |
| **Indirect callee resolution (#284, S303)** | **indirect-callee-resolver.ts** (NEW) | route-inference.ts `indirectInverseCallerMap` (:8087) → Step 5c only; `aliasNamesResolvingTo` → `serverFnPeerAliasNames` → emit-server/emit-logic/emit-control-flow/emit-expr. **`inverseCallerMap` must stay byte-identical.** See below. |
| Schema declaration checks | gauntlet-phase1-checks.js | `E-SCHEMA-010` (via `findNonLiteralSetItems`) + **NEW `E-SCHEMA-011`** (via `parseColumns`'s `malformedReferences` + `referencesHint`) — both helpers live in schema-differ.js |
| Reachability / batch | reachability-solver.ts, batch-planner.ts, cps-batch-planner.ts | codegen |
| Name/symbol resolve | name-resolver.ts, symbol-table.ts | codegen. symbol-table.ts PASS 15.5 owns the `<outlet>` placement pass. |
| Codegen dispatch | code-generator.js (= codegen/index.ts) | codegen/emit-*.ts. Also the `E-DBAUTH-SQLITE` compile-time gate (`annotateDbScopes`) and the §40.8.2 shell composition. **NOT the runtime-chunk gates — those are emit-client.ts.** |
| **Runtime-chunk tree-shake gates** | **codegen/emit-client.ts** (`detectRuntimeChunks` :1283 pre-emit AST walk; `POST_EMIT_HELPER_CHUNK_GATES` :63 post-emit reference scan) + **codegen/runtime-chunks.ts** (`CHUNK_DEPENDENCIES` :576, closed over at the END of `detectRuntimeChunks`) + compute-pgo-flags.ts (the `reset`/`equality`/for-stmt PGO inputs `detectRuntimeChunks` reads) | `ctx.usedRuntimeChunks` -> the assembled runtime slice. **This is the locus for any `ReferenceError: _scrml_* is not defined` in a shipped bundle.** See "Runtime-chunk gating" below. |
| **Coordinate space — SOURCE vs DIST (D-4, S296; GENERALIZED #390)** | **codegen/emit-server.ts** — `distRelativeServerSpecifier` is now a thin wrapper (`targetExt=".server.js"`) over the general `distRelativeLocalSpecifier(sourceSpecifier, importerFilePath, outputBaseDir, targetExt)` / `distLocalPathOf`, so a §64 tool/library `.scrml` import re-bases to dist space the SAME way a server import does (`isOutsideBase`, `distServerPathOf` renamed `distLocalPathOf`); **api.js** (`distServerKeyToSource` + `distDirOfSource` forward index, `serverImportTargetSource`) reverses; **codegen/emit-client-esm.ts** already computed client URLs in dist space | `checkServerImportInvariant` (`W-SERVER-IMPORT-UNEMITTED`) and `emitValueOnlyServerJsForDanglingImports` — BOTH reversal sites. **NEW consumers:** `emit-tool.ts` / `emit-library-shared.ts` (§64 import rebasing). See "Coordinate space" below. |
| **§20.5 SESSION PROLOGUE BINDING (NEW #435, GH #357) — a Proxy, and the Proxy is a CONFIDENTIALITY decision, not a convenience** | **codegen/emit-server.ts** — `_SESSION_BARE_TEXT_RE` (shared text-level detector; the left-guard `[^\w$.]` is load-bearing — it keeps `_scrml_session_store` / `sessionId` / `_scrml_read_session_id` / `_scrml_req._scrml_sess` from matching, so only a BARE `session` followed by `.` or `[` counts) + `astSqlQueryUsesSession` (ORed into `_anySessionBuiltin`, so an interpolation-only use FORCES the session infra on) + the emitted `_scrml_session_bind(_s)` factory + a conditional handler-scope SPLICE at the same insertion point as the `@currentUser` binding. **A `?{ … ${session.userId} … }` carries its query as a STRING** — sigil-less and invisible to the emit-expr member/index lowering — so `session` survived as a free variable: HTTP 500 on every authenticated call. | **The binding MUST NOT be `const session = _scrml_req._scrml_sess`.** That object is an ACCESSOR carrying getters (`userId`/`role`/`isAuth`), methods (`get`/`set`/`destroy`) **and RAW own-properties `sid`/`_rec`/`_changes`** — `_rec` holds the full stored record **including the §40.2 `csrfToken`**. A raw bind turns `session[k]` into a raw property read at the wrong level: `session["sid"]` discloses the live session id and `session["_rec"]` the whole record + CSRF token, at HTTP 200 — the exact defeat of the synchronizer-token defense the compiler owns. The Proxy preserves BOTH accessor shapes so the bare binding AGREES with the AST lowering (which is **KEPT** — three security gates match the literal `_scrml_req._scrml_sess.` and retiring it for a bare bind blinds them). **`Reflect.get(t, k, t)` — receiver = the TARGET — is load-bearing:** the getters read `this._rec`, and a Proxy receiver re-enters the trap (`t.get("_rec")` -> null -> TypeError). `set()` returns false so an assignment through the binding is a loud strict-mode TypeError, never a silent shadow write. `_webAppShape`-gated; a non-route text ref (SSE / headless) gets no binding and is caught build-blocking by `E-SESSION-CONTEXT`. **RESIDUAL, re-scored MED this window, still open, still ROUTED-TO-BRYAN:** `g-session-get-reserved-key-read-disclosure` — a request-controlled `session[k]` still reads every OWN key of `_rec` via `.get()`, including the §40.2 `csrfToken`. **PARTIALLY closed as a side-landing of #452:** the accessor is now `Object.hasOwn`-guarded (`emit-server.ts:2692` (⛑ **S384: `:2593` was ALREADY WRONG pre-window; re-derived by grep**)), so the PROTOTYPE-CHAIN half — `.get("__proto__")` -> `Object.prototype`, `.get("constructor")` -> a function, and the HTTP 500 that a function reaching a `?{}` bind produced — is CLOSED. The open half is the own-key READ POLICY, which is a language-surface question the §20.5 write-side guard does not cover. **The ledger entry has not caught up — see non-compliance.report.md S326-N2.** |
| **MANGLER REGION FENCING — TWO region classes, one LEXICAL and one STRUCTURAL, and they COMPOSE (NEW #458). Read this before adding ANY text pass over emitted JS.** | **codegen/code-segments.ts** — (a) the pre-existing LEXICAL fence `rewriteCodeSegments(expr, transform)` (code vs string/regex/comment; descends into a template literal's `${…}` because those are CODE); (b) NEW STRUCTURAL: `findObjectShorthandRegions(code)` -> `ObjectShorthandRegion[] {start,end,kind,names}`, classified by `classifyBraceGroup` into `BraceGroupKind = "object-literal" \| "binding-pattern" \| "unknown"`. **codegen/emit-client.ts** — `joinAroundRuntimeSlot(lines, runtimeSlotIndex, runtimeSource, rewrite)` (:1980, NEW export) + `rewriteCodeSegment` (:3721, the composition site). | **THE STRUCTURAL LESSON, and it is the transferable one: when a text pass acts in the wrong PLACE, change the pass's INPUT, not its pattern.** `joinAroundRuntimeSlot` splices the assembled runtime into its slot **AFTER** the rewrite instead of before, so the runtime is **not part of the rewrite input at all** — no lookaround has to recognise it and no pattern can reach into it. That is the fifth attempt at this class (Bug D · Bug I · Bug Z · g-spread · PGO P3.A were all pattern patches) and the first structural one. **Byte-safety is provable, not asserted:** with `rewrite` as the identity function it is exactly `lines.join("\n")` with the runtime in its slot — which is what the pre-fence code produced — and the second call site (`:3595`) passes exactly that identity. **THE THREE REFUSALS in `classifyBraceGroup` are the design, not gaps:** `:` and `>` are deliberately OUT of `BRACE_OPENS_OBJECT_AFTER` (`label: {…}` / `case x: {…}` are blocks; the `>` of `=> {` opens a function BODY); a `(`-preceded group is decided as a `binding-pattern` ONLY in the `function`-headed form and otherwise reads as a call argument; and **`unknown` obliges the caller to change NOTHING.** **ONLY `object-literal` is acted on, and the LIMIT is load-bearing:** an S239 review showed that fencing a `binding-pattern` while the pass still rewrites the uses those bindings SHADOW turns a LOUD `TypeError` into a SILENT wrong answer — the exact class the fix exists to remove — so a binding pattern keeps today's emission verbatim until there is a scope model. Two further whole-region skips are SEMANTICS: `__proto__` (ECMA-262 B.3.1 — only `PropertyName : AssignmentExpression` sets `[[Prototype]]`, so expanding the shorthand deletes the own key, and a bare `__proto__` beside expanded siblings is ENGINE-DEPENDENT: node binds the global prototype, bun throws), and a group holding no `fnNameMap` name at all. **Net sites this pass STOPS rewriting: ZERO.** Third leg, same PR: **`emit-functions.ts:registerFnName` (:675)** funnels all four `fnNameMap.set` sites through one identifier-shape guard — an empty key made the alternation `\b(…\|)\b`, a ZERO-WIDTH whole-buffer inserter (781 injections into `stdlib/cron` alone), and the guard tests SHAPE not non-emptiness so it closes the class, not the instance. |
| **§12.5 ROUTE-HANDLER `Response` CONTRACT — ONE exit, and the ORDER at that exit is normative (NEW #452)** | **codegen/emit-server.ts** — the non-baseline-CSRF handler now opens an UNCONDITIONAL capture IIFE (`const _scrml_result = await (async () => {`, body indented by `_bodyIndentNonCsrf`) and closes it at ONE exit that envelopes the value as `new Response(JSON.stringify(<redacted>), {status: 200, headers: {"Content-Type": "application/json"}})`. Mirrors the pre-existing `useBaselineCsrf` branch MINUS that branch's own double-submit `Set-Cookie`. | **Before #452 the exit was SPLIT THREE WAYS and that is precisely how the class hid: the ONE arm a test exercised (`_ext5DedupNonCsrf`) returned a `Response`; the protect/tenant arm returned a redacted RAW value; every other shape — the plain authed route — returned NOTHING here, so the ADOPTER's `return` became the HANDLER's return.** Both shipped hosts do `return route.handler(req)` (`dev.js`, the built `_server.js`). MEASURED on Bun 1.3.14 over a real socket: the WIRE got `200 text/plain` with the CONSTANT `"Welcome to Bun! …"` body for EVERY non-`Response` return, while STDERR logged `Expected a Response object` **ONLY for `undefined`/`null`** — a bare `"ok"`/`42`/`{…}` logged nothing at all. The emitted client stub has always done `await _scrml_resp.json()`, which throws on that body. **TWO ORDERING RULES, both argued in-source and both fail-direction-asymmetric.** (1) `if (_scrml_result instanceof Response) return _scrml_result;` sits **BEFORE** `_egressRedact` — a `Response` is an opaque stream handle the redact cannot inspect, and without the guard the envelope does `new Response(JSON.stringify(<a Response>))` which is `"{}"` (no enumerable own props), **turning an adopter's deliberate 403 into a 200 — MEASURED, fail-OPEN.** The guard exists because the failure it prevents is the fail-open one, and §14.8.9/§14.8.10 already model a manual-`Response`/`handle()` body as a live egress kind. **CORRECTION (S355, `a7e99e8f` / #590):** this cell previously read "Currently unreachable from the corpus (a plain body naming `Response` build-blocks on `E-SCOPE-001`)" — now FALSE. `Response`/`Request`/`Headers` are allowlisted in `LOGIC_SCOPE_GLOBAL_ALLOWLIST` (`type-system.ts:7290`), unblocking adopter #471 PDF/binary egress; the guard is now LOAD-BEARING, not belt-and-braces, and `authed-server-fn-response-http.test.js` was flipped in the same commit to assert the passthrough. (2) `_egressRedact` runs **BEFORE** `JSON.stringify` — serialize-then-redact would be a §14.8.9/§14.8.10 confidentiality regression; `_egressRedact` is the identity when neither floor is active, so a plain app is byte-unaffected. **Load-bearing side effect nobody had connected: `_scrml_session_cookie_wrap` appends `Set-Cookie: <sid>` onto the handler's return value and SKIPS when that value has no `.headers`** — so a bare return also dropped the §20.5 session-establishment cookie silently (store record written, browser never got the sid). **DOWNSTREAM, do not miss it:** this landing takes `g-session-get-reserved-key-read-disclosure` from log-only to **WIRE-LIVE**. **⚠ SPEC STATUS: the "SHALL" is in a source comment and a commit subject, NOT in §12.5** — see non-compliance.report.md S326-N1. |
| **§20.5/§52.15.1 DANGLING-REFERENCE CLASS (NEW #440) — name the CLASS: a runtime reference emitted with its binding/definition gated NARROWER than the reference** | **codegen/emit-server.ts** — `astReadsCurrentUserAmbient` (SUPERSET of `astSqlQueryUsesCurrentUser`: also catches the DIRECT `IdentExpr{name:"@currentUser"}` read, e.g. `return { id: @currentUser.id }` with no `?{}` at all) + the §36 SSE `function*` splice at `_sseCuInsertIdx` + `_hasChannelAuth` ORed into `_needsSessionInfra` + an `else if` arm emitting ONLY `_scrml_auth_check`. | **Same class as #357, and it is worth carrying as a class:** compiles clean, zero diagnostics, `ReferenceError` -> HTTP 500 at request time. Three instances closed here (plain-handler `@currentUser` resolver · SSE-handler `@currentUser` binding · `<channel auth=>`-only `_scrml_auth_check` + `_scrml_session_middleware`). The `else if` arm deliberately emits NEITHER the CSRF helpers NOR session-destroy NOR the `@session`-projection routes — those stay `authMiddlewareEntry`-gated, so a channel-auth-only program's route surface is byte-identical. **Every detector in this family is PERMISSIVE BY DESIGN: a false POSITIVE only emits unused session infra; a false NEGATIVE re-opens a 500.** The store invariant was PROBED, not assumed: a read-only `@currentUser` program emits the in-memory Map + middleware + resolver and **NOT** the durable on-disk store (§20.5 i29e — no over-emission). **LESSON, delta-log [1186]: a gap entry's stated fix-locus is a HYPOTHESIS.** Both gap entries here were outdated on the locus and had to be re-diagnosed against HEAD before scoping. |
| **§13.2 ASYNC-NAME PROVIDER — ONE provider, THREE consumers (NEW #442, Limb 1 / dpa-023). DECISION SITES 3 -> 1.** | **codegen/async-combinators.ts** — `AsyncNameFacts` (interface) + `isAsyncCalleeName(name, facts)` + `isServerBoundaryCallee(name, facts)`. The RULE is MODE-FREE and lives here once: not-shadowed, then stdlib-Promise-export OR server-boundary-fn OR transitively-async-local-peer. **There is no fourth disjunct.** What is mode-DEPENDENT is which SETS exist, so **mode selection is the CALLER's job and lives in exactly one place** — `emit-expr.ts:asyncNameFactsOf(ctx)` (client emission -> `clientAsyncFnNames`; server emission -> the local peer set IS `serverFnNames`, so a second term would be redundant and reading a stray client set in a server ctx would be a silent widening). `serverFnNames` is read in BOTH modes deliberately: both emissions name the same fns, only the LOWERING differs (server = in-process peer callable, client = a fetch stub), and both are async. | **1.** `emit-expr.ts:combinatorIsAsyncName` — collapsed from FOUR hand-written disjuncts to ONE delegation. **2.** `emit-library-shared.ts:collectNonAwaitableAsyncCalls` — its bespoke local `isAsyncName` closure is **DELETED**, and it gained the `serverFnNames` parameter it never had. **3.** `emit-expr.ts:isClientServerFnCall` — shares only the provider's shadow-aware server-fn MEMBERSHIP component (`isServerBoundaryCallee`), **deliberately NOT the full predicate**, because it asks an IDENTITY question, not an asyncness one (widening it would capture a stdlib-async callee and route it away from its own `emitCall` branch and its own fail-closed sink). **THE BUG THIS SUBTRACTED:** `computeAsyncFnNames` uses `serverFnNames` as a seed TRIGGER — `callsServerFn(callees)` colours the CALLER and never admits the CALLEE to its result set — so `loadRows` was async to the emitter and **sync to the fail-closed drain, in the same compilation**. The consequence was a MISSING diagnostic, not a wrong emission: a client server-fn call stranded in a raw escape-hatch, a template `.raw` body, or a fn-SIGNATURE parameter default is unreachable to `emit-expr`'s own `syncPeerCalls` sink. **Before adding a FOURTH consumer: hand it `AsyncNameFacts`; do not re-write the rule.** |
| **§13.2 CLIENT SERVER-FN CALL-SITE AWAIT (NEW #429, U1 / dpa-020) — position-invariance AT the choke point, not retrofitted per position** | **codegen/emit-expr.ts** — `isClientServerFnCall` + `isAwaitedClientServerFnCall` + the `emitCall` branch at `:3274`, the fourth sibling of the three existing await branches (server peer, client async peer, stdlib async). Gates: `mode === "client"` + unshadowed ident in `ctx.serverFnNames` + **`ctx.clientAsyncBody === true`**. That last gate is NOT an independent judgement — it is threaded from the SAME `_fnIsAsync` that puts `async` on the host signature, which is `computeAsyncFnNames`'s `callsServerFn` seeding off `collectCalleeIdents`. **So: the walk SEES the server callee -> host is async AND the branch may fire; the walk MISSES it -> host is sync AND the branch cannot fire. The gate can only SUPPRESS an await, never STRAND one** (a stranded `await` in a sync host is a WHOLE-BUNDLE SyntaxError, not a local defect). `peerAwaitable === false` (a sync callback body, any parameter default) emits BARE and records into `syncPeerCalls` — fail-closed. The emitted callee is still the SOURCE name; `emit-client.ts`'s whole-buffer post-fn-name-mangle rewrites it afterwards and `await loadRows()` still satisfies its name-followed-by-`(` regex. | **THE THREADING CHAIN, every hop load-bearing:** `emit-functions.ts` (`_serverFnNames` into `fnOpts`, gated on `_fnIsAsync` — **this path matters most: `fn`-shorthand and return-typed `function` bodies use `emitFnShortcutBody` and bypass `scheduleStatements` entirely, so the statement-level injector NEVER saw them**) · `scheduling.ts` (`_clientServerFnNames(routeMap, filePath)`, threaded ONLY when `clientAsyncBody`) · `emit-logic.ts` (TWO dispatch hops, if-stmt and for-stmt — **this is where the flag was actually dropped**; the five emit-control-flow sites were the SYMPTOM) · `emit-control-flow.ts` (`_asyncAwaitBodyOpts`, `_emitIfStmtInner`, the inline `_emitForStmtInner` `emitLogicBody` call) · `emit-client.ts` (the reactive-set direct-value matcher ABSORBS the emitter-supplied `await` prefix — miss it and the site loses its `.catch(-> _scrml_error_boundary_log)` arm, reintroducing the `unhandledrejection` silent drop ss32-item-1 killed). **TWO cross-cutting rules this landing established. (1) THE OWNING-FILE FILTER:** `runRI` builds ONE `routeMap` across the whole resolved import graph and `FunctionRoute` carries NO `filePath` field — the file lives ONLY in the map KEY (`<filePath>::<start>`). An unfiltered walk imported another file's server-fn names into THIS file's client emission, so a purely local SYNC `save` gained a spurious `await` and a FALSE `E-ASYNC-STDLIB-IN-SYNC-CALLBACK`, with renaming the local fn as the only user workaround. **`declaredNames` cannot cover it** (a top-level client fn name is never in it), so the filter IS the fix — applied identically in `emit-functions.ts` and `scheduling.ts`, **and the two MUST agree, because U1's gate derives from the coloring the filter also feeds.** **(2) DECIDE OFF THE EMITTED OUTPUT:** `emitMatchExpr` writes a placeholder IIFE header and overwrites it at the `})()` close with `await (async function() {` iff mode is server OR the emitted arm bodies contain an `await` in CODE position (`_stripStringLiteralsForAwaitScan` blanks literal content first). Same discipline as #391 — a re-derived predicate can disagree with what was actually emitted, and a disagreement in the unsafe direction is a broken bundle. **STATUS, stated plainly: #429 LANDED EXPLICITLY NOT CLAIMING ITS BUG CLASS** — see the colorless-async section below. |
| **§13.2 CPS auto-await CHOKE-POINT (LANDED #405, 649d6fce) — supersedes GH #237/#264/#394's per-mechanism entries** | **codegen/scheduling.ts** — ONE shared walker, `collectAwaitSites(program, P, isPromiseCallee, reactiveSkip, alwaysWrap)` + `applyAwaitSites`, backing THREE call-shape wrappers: `injectServerCallAwaitsViaAst` (on-mount statement ctx, `"arg1"` reactive-skip), `injectFnBodyServerCallAwaits` (ALL client fn-body statement ctx, NEW, `"sink"` reactive-skip — descends into `given`/match-block/`try` bodies the pre-#405 classifier fenced out), `parenthesizeAwaitServerCallsInExpr` (match-arm EXPRESSION ctx, `alwaysWrap=true`). **`injectPromiseAwait` (the old per-statement string-regex pass) is RETIRED** — `emitLogicBody`'s nested-body `_injectAwait` is now IDENTITY (a no-op passthrough; `scheduleStatements`'s own sequential + grouping paths call `injectFnBodyServerCallAwaits` directly via a new `_autoAwaitFnBody` closure instead). The retired pass MIS-PARENED a receiver-tail call (`fn().ok` → bare-prefixed `await fn().ok` === `await (fn().ok)`, reading `.ok` off the pending Promise — the g-hash87 defect); the unified injector decides WRAP-vs-BARE per call site from its AST parent (a tight tail — member/index access, a further call, a tagged template — forces the paren wrap; anything else keeps the byte-identical bare prefix). | **codegen/emit-reactive-wiring.ts:536-537** (on-mount, unchanged consumer) + **`scheduling.ts`'s own `scheduleStatements`** (client fn bodies, NEW — every emitted statement, sequential AND grouped, now routes through `_autoAwaitFnBody`) + `emit-logic.ts`'s value-form `match`-arm lowering (`emitMatchExprDecl`). **Closes the whole `g-cps-scheduler-opaque-boundary-hides-nested-server-calls` family** (`scheduling.ts`'s `isControlFlowBoundary` no longer fences `given`/match-block/`try` from the fn-body walker) — resolves `g-given-block-server-call-no-autoawait`, `g-hash87-member-read-await-misparen`, `g-ternary-init-server-call-await-misbind` (see `docs/known-gaps.md`, all marked `status=resolved`). **The DIRECT value of `_scrml_reactive_set`/`_scrml_cs_reactive_set` is deliberately SKIPPED** (arg1 mode for on-mount, sink mode — ANY depth beneath a reactive/derived/init/engine sink call — for fn bodies) — `emit-client.ts`'s own IIFE matcher owns that lift. |
| **D-5 server module-const closure** | **codegen/emit-server.ts** `emitReferencedModuleConstLines(fileAST, assembledBody)` | the assembled `.server.js` bundle, emitted AFTER the value exports and BEFORE `finalEmitted` is joined. ADDITIVE — the client bundle is byte-unchanged. |
| **#263 CLIENT module-`export const` closure (S301) — the §14.8-gated sibling** | **codegen/emit-client.ts** `emitReferencedModuleExportConstLines` + `collectClientReferencedIdents` + `stripExportDeclInit` + `collectTopLevelReassignedNames` + `_fnNodeIsServerBoundary` | the `.client.js` bundle. **The reference set is built from AST `IdentExpr` nodes ONLY — never string-literal contents, comments or member-property keys — with TWO PRUNED subtrees (a server-boundary function body; a server-scoped cell's init).** The blocked first attempt matched by TEXT and would have shipped an `export const` used only inside a `server fn` (which lowers to a fetch stub that never names it) to the browser. A name appearing in a fetch stub / literal / comment can therefore never widen the set **by construction**, not by filtering. Fail-closed elsewhere too: `stripExportDeclInit` SKIPS multi-declarator and destructuring forms rather than guessing. |
| **#358 cross-FILE client-reachability seed (NEW #385)** | **`codegen/context.ts`** `CompileContext.crossFileClientReads: Map<sourcePath, Set<exportName>>` (NEW field), computed ONCE in `runCG` via `collectClientReferencedIdentsForAST` — the SAME confidentiality-safe prune the per-file #263 gate above uses (a server-only import never enters the set) | Both the EXPORTER (make `X` client-reachable when a DIFFERENT file's client code reads it via a direct `import { X } from './M.scrml'`) and the IMPORTER (keep `X` in the `_scrml_modules` destructure even when NR mis-tags an ALL-CAPS const as a component) route off this ONE ground-truth signal. `null` for test harnesses / single-file compiles — byte-identical there. **#386 (sibling fix, same window):** a type-ANNOTATED `export const` (`const X: T = …`) now emits via the AST `valueInit` field rather than the annotation-blind raw regex, which previously defeated `const \w+\s*=` matching and silently skipped the export entirely. **Native-parity PAID:** the export-decl's two new LIVE-only support fields (`valueInit`, `valueInitExpr`) are registered in `native-parser-canary/within-node-classifier.ts`'s `STRIP_KEYS` — the native parser builds the export-decl from the raw slice and never attaches them, so an unregistered field would have grown the within-node parity allowlist for a field neither side actually disagrees about (both routes emit the same `const`). |
| **`export let`/`var` runtime-value emission (NEW #388)** | **`codegen/emit-server.ts`** `emitModuleValueExportLines` — widened from `const`-ONLY to `const \| let \| var`, each keeping its own keyword in the emitted line | before this fix, a mutable `export let` closed over by an in-process PEER CALLABLE (not a direct `<endpoint>` reference) fell through to nothing here — a boot/route `ReferenceError: <name> is not defined`, silent until executed. **Companion fix, same PR:** a `serve=` tool's dead-local-import scan (`generateServerJs`'s `scanBody`) now unions `fileAST._serveImportReachabilityExtra` (stashed by `emit-tool.ts` from every non-import top-level statement) as an extra reachability root, so an import referenced ONLY from `main`/a setup helper survives tree-shaking (`g-serve-tool-treeshakes-main-only-import`). Both `undefined`-gated for the web-app path — byte-identical there. |
| **§17.1.2 structural `if=` (S302)** | **ast-builder.js** (capture) → **native-walker/attrvalue-exprnode-walker.ts** (exprNode) → **type-system.ts** (scope) → **dependency-graph.ts** (reader credit) → **codegen/emit-html.ts** (emit) | one attribute, five consumers, two native mirrors — the full table is below. |
| **§6.8 reset init-thunk reassignment skip (NEW #417)** | **codegen/reactive-deps.ts** `collectStructuralDeclNames(fileAST)` (NEW — walks logic bodies incl. if/for/while/match/try for `structuralForm:true` state-decls) → **codegen/emit-reactive-wiring.ts** (computes once per file, threads into `EmitLogicOpts.structuralDeclNames`, publishes to the module-level fallback via `setStructuralDeclNamesForFile`) → **codegen/emit-logic.ts** `_emitInitThunkSidecar` (the skip check) | `codegen/index.ts`'s two `EmitLogicOpts` construction sites also thread `structuralDeclNames` directly. See domain.map.md for the defect this closes. |
| **§17.1 `W-IF-IN-EACH` (NEW #416, GH adopter #409)** | **codegen/emit-each.ts** `_eachIfCondReferencesItem(rawCond, itemNames)` (string-literal-fenced item-reference detector) + `_eachItemBindingNames(iterVarName)` (widens to an `as (k,v)` destructure pair via the live each-reconcile ctx) | `renderTemplateChildToJs`'s deferred nested-per-row-`if=` branch — pushes `CGError("W-IF-IN-EACH", …, "warning")`. See domain.map.md. |
| **§14.8.11 queried-table grants (S292)** | **sql-table-refs.js** (NEW — `tableRefsInSql`/`sqlBodiesInSource`/`tableRefsInSource`) -> **commands/db-migrate.js** (`parseProjectSchema` returns `{queriedTables, queriedPrivileges, undeterminedSql}`; `runPgApply`'s signature widened to carry the first two) -> **schema-differ.js** `diffSchema(options.queriedTables, options.queriedPrivileges)` | the `GRANT <privs> ON <table> TO scrml_app` branch for NON-db-authoritative tables the app's `?{}` bodies touch. See migrations.map.md. |
| DB-authoritative tier — §14.8.11/.1/.2 | schema-differ.js + codegen/db-authoritative.ts + codegen/sql-ident.ts + codegen/tenant-egress.ts + commands/db-migrate.js | codegen/index.ts wires `appDeclaresDbAuthoritative`/`wrapPrincipalTxn` into emit-server.ts's `generateServerJs`; emit-channel.ts imports `quoteIdent` (aliased `pgQuoteIdent`). See error.map.md / domain.map.md / schema.map.md / migrations.map.md. |
| Confidentiality — tenant-row floor (§14.8.10) | codegen/tenant-egress.ts (`buildTenantContext` — two-arg since S288, unioning `<schema>`-declared tables; `resolveTenantScoping`, `classifyTenantWrite`, `detectTenantRawEgress`, `rewriteSelectAddTenantId`, `rewriteInsertAddTenantId`, `_scrml_active_tenant`/`_scrml_active_caps`) | codegen/emit-server.ts: E-TENANT-WRITE/AGG/RAW-EGRESS + I-TENANT-STRIP/ACROSS |
| Client Router — landmark + shell composition (§20.8.1.1/§40.8.2) | codegen/emit-html.ts (`treeHasAuthorMain`) + codegen/index.ts (`findOutletMarkedOpenTag`/`findBareMainOpenTag`, `retagOpenTag`, `findMatchingCloseIdx`, **`computeDependencyClientScripts` — 4-arg since GH #235**) | TWO STAGES, one invariant, communicating ONLY through the emitted `data-scrml-outlet` marker. |
| **Client Router — cross-chunk soft nav (navigate-wave1c, §20.8.2/§20.8.7)** | **runtime-template.js** (`_scrml_nav_client_chunks`, `_scrml_nav_missing_chunks`, `_scrml_nav_load_chunks`, `_scrml_nav_chunk_failed`, `_SCRML_NAV_CHUNK_TIMEOUT_MS`, the `_scrml_chunk_loading` DEPTH COUNTER) + **codegen/emit-event-wiring.ts** (the IIFE + `_scrml_boot` boot dispatch) + **codegen/emit-variant-guard.ts** (the same eager-vs-DCL dispatch for engine/match arm wiring) | `W-NAV-CHUNK-LOAD-FAILED` (IMPLEMENTED and cataloged — see error.map.md). **For WHAT re-runs on a nav and what does not, read the module-init/rehydrator table below — it is a different question from what LOADS the chunk.** |
| **§51.11 engine `audit` (S307 port onto `<engine>`)** | **codegen/emit-engine.ts** (`emitEngineSubstrate`, :2054 — emits `_scrml_engine_audit_register(varName, closure)` AFTER the cell inits) + **codegen/index.ts** (`_scrml_engine_audit_register` added to `CELL_SCOPE_ACCESSORS`, :490) | **runtime-template.js** `_scrml_engine_audit_targets` (:5932) / `_scrml_engine_audit_push` (:5944), called from `_scrml_engine_advance` (:5988) + `_scrml_engine_direct_set` (:6107). **A REGISTRY, not a 9th positional argument** — those two helpers are called from nine emit sites across five codegen modules and a site that forgot the argument would silently record nothing. The registration takes a CLOSURE, not a cell NAME, because the write path is the chunk-scope wrapper and a raw name resolves in the wrong key space (emitted fine, log stayed empty, only a live transition caught it). |
| **§51.13 auto property tests on the modern `<engine>` (S307)** | **codegen/emit-machine-property-tests.ts** `projectStateChildRules(stateChildren)` (:487) | **codegen/index.ts** (:2354-2375) builds a `name -> TransitionRule[]` map off `fileAST.machineDecls ?? ast.machineDecls` and passes it as `generateMachineTestJs`'s 4th arg. The generator substitutes it **only where `machine.rules` is empty**, so every legacy path is byte-identical. FEEDING the existing machinery rather than re-pointing it was the deliberate choice — `collectVariants`/`reachableVariants`/`resolveRule` all key off the `rules` shape. |
| SSR auth-scoped omission + SQL-interp classifier (§52.15.5) | codegen/sql-lex.ts | imported by codegen/collect.ts AND codegen/rewrite.ts so they CANNOT diverge |
| Colorless-async classification | codegen/emit-library-shared.ts, codegen/scheduling.ts, codegen/emit-expr.ts | emit-library.ts, emit-server.ts, emit-tool.ts, emit-logic.ts, emit-control-flow.ts, emit-functions.ts |
| Batch-hoist / server-call fencing (§19.9.9.2) | codegen/emit-server.ts + codegen/scheduling.ts | full control-transfer set + filler-distance across control-flow guards |
| Reactive value= form-control write | codegen/emit-bindings.ts (file scope, i174) **+ codegen/emit-html.ts -> binding-registry.ts `directiveIsFormValue` -> codegen/emit-variant-guard.ts (arm bodies, i225, NEW this window)** | a reactive `value=` on `<input>`/`<textarea>`/`<select>` writes the `.value` PROPERTY, inequality-guarded so re-assigning the same string cannot reset the caret. Falls through to `setAttribute` when a sibling `bind:value`/`bind:valueAsNumber` owns it. |
| **Per-item reconcile family (S293/S294)** | **codegen/emit-lift.js** (`computeItemDerivedReplay`, `_collectDeclNodesInScope`) + **codegen/emit-each.ts** (`pickReferencedEnclosingCtxs`, `referencesFreeIdent`, `enclosingResolvePreludeLines`, `enclosingResolvePreludeForHandler`) | per-item text/class/attribute/if/event bindings re-resolve the live item BY KEY and replay item-derived locals on REPLACE. Shadow-safe: a nearer ctx's binding suppresses re-resolving a same-named enclosing var (a `let` redeclaration would be `E-CODEGEN-INVALID-LOGIC`). |
| Tailwind utility registry + lint | **tailwind-classes.js** (`registerColors`/`registerBorders`/`registerEffects`/`registerRing`/**`registerOutline` NEW D-3**/`registerGradient`/`registerTransform`/`registerTransition`…, `findUnsupportedTailwindShapes`, `findUnrecognizedClasses`, `validateArbitraryCss`) | `W-TAILWIND-001`, `W-TAILWIND-UNRECOGNIZED-CLASS`, `E-TAILWIND-001` — see error.map.md |
| Tool serve-harness | tool-program.ts, codegen/emit-tool.ts, codegen/emit-server.ts | §64.9 `serve=` listener-owning headless target |
| CSS emission / conflict check | codegen/emit-css.ts, codegen/emit-theme-reset.ts / codegen/css-conflict-check.ts | §65 Wave-1; E-STYLE-CONFLICT / W-STYLE-CONFLICT-POSSIBLE |
| Reactive-attr writer-ownership (#81) | codegen/emit-html.ts (`analyzeWriterConflict`) | `E-ATTR-WRITER-CONFLICT`, or a `LogicBinding` with `isReactiveValueAttr`/`valueAttrName`/`valueAttrKey` |
| Session establishment | compute-program-config.ts, route-inference.ts, codegen/emit-server.ts, codegen/emit-expr.ts | §20.5 `session.*` server builtin — see auth.map.md |
| **§18.5 match BLOCK-ARM in VALUE position — FOUR EMISSION ROUTES, ONE SHARED LEAF PREDICATE (#447 → #463 → #469/#470 → #479)** | **codegen/emit-logic.ts** owns the machinery: `planBlockArmLift(inner)` (:4715, **exported — the shared segmenter+plan for the TWO RAW-STRING routes only, exactly TWO call sites**: `:4738` here and `emit-control-flow.ts:2221`) · `_splitBlockStatements` (:7025) · `_closesBlockStatement` (:6995) + `_BLOCK_STMT_HEAD_RE` (:6965) + `_BRACE_CONTINUATION_RE` (:6973) · `_matchArmResultIsBlockBody` (:7082) · **`_blockTailIsValueExpr` (:7099) — THE SINGLE SHARED LEAF PREDICATE, and the only symbol all four routes touch** · `_emitBlockArmValueFromString` (:7241). **codegen/emit-control-flow.ts** imports all of `planBlockArmLift`, `_awaitMatchArmServerCalls`, `_matchArmResultIsBlockBody`, `_blockTailIsValueExpr` (:7099) and owns `emitIifeBlockArmBody` (:3323) + the structuredBody arm path (~:2320). | **⚠ CORRECTION TO THE PRIOR GENERATION OF THIS ROW, and it already cost a dispatch: `planBlockArmLift` is NOT "the single classifier every path routes through".** Four routes: **A** local-decl structured-AST (`emit-logic.ts:emitMatchExprDecl` :4763, predicate at :4882) · **B** local-decl raw-string (`_emitBlockArmValueFromString`, via `planBlockArmLift`) · **C** IIFE structured-AST (`emit-control-flow.ts` :2354, predicate DIRECT) · **D** IIFE raw-string incl. §18.19 multi-scrutinee (`emitIifeBlockArmBody`, via `planBlockArmLift`). **A grep for `planBlockArmLift` finds two of four. Grep `_blockTailIsValueExpr` to enumerate them all.** A/C do not segment because an AST body already IS a statement list — a design property, not an omission. **Scope from the layer that moved:** a segmentation defect reaches B and D only; a predicate defect reaches all four. Landed corrections in order: #463 moved the keyword fence OUTSIDE the alternation and to `(?![A-Za-z0-9_$])` not `\b` (scrml identifiers admit `$`; invariant 46); #469/#470 unified the tail classifier across value-position IIFE paths after a member/index-assignment tail was found LIFTING on one route and VOIDING on another; **#479 made a depth-0 `}` closing a block-bodied statement a statement boundary** — before it, `{ let a = 0; for (…) { a = 1 } a }` split into two segments, the tail was swallowed into a `for`-headed segment, and the arm evaluated to `undefined`, which does not exist in scrml (§42.1.1). **The defect was SEPARATOR-dependent, not position-dependent**, which is why the corpus never tripped it. Pinned by `match-block/{block-arm-tail-after-block-statement,block-arm-nested-assignment-fidelity,value-form-block-arm-all-paths,value-form-block-arm-derived-reactive,member-assign-tail-voids-all-paths}` + `unit/match-block-arm-tail-after-block-statement.test.js` (318L). |
| **§17.2 `show=`-false SSR hide — ~~#450~~ REVERTED IN FULL by #464 (`0536a90f`, operator-ruled)** | **codegen/emit-html.ts is BYTE-IDENTICAL to `71623be3`** (verified: `git diff 71623be3 6f176c0d -- compiler/src/codegen/emit-html.ts` is EMPTY). `buildInitialBoolMap`, the `initialBoolMap` local and the `_showInjectFreshStyle` / `_showMergeIntoStyle` emit-site flags **do not exist in this tree** — grep confirms zero hits. | **`show=` injects NO inline `display:none` at SSR time. §17.2 first paint is owned entirely by the client hydration controller.** Replaced by a regression guard pointing the OTHER way: `control-flow/ctrl-017..ctrl-020` each assert `count: 0` for `[style*="display:none"]`. **Why the revert, from `ctrl-017`'s rationale — this is the reusable lesson, not a one-off:** a `<match>` arm body is lowered by the SAME `generateHtml`, so an emit-time hide is baked into the string literal `dispatch` assigns to `_mount.innerHTML`; the re-mounted element carries no controller (`wire_<Arm>` does not re-bind a visibility toggle, `_scrml_nav_rewire` is never re-run on a variant swap), so the baked hide could NEVER be cleared. **§17.2 says "toggle"; a toggle needs a toggler.** The direction is now fail-OPEN — a missed hide is a brief flash, a wrong hide is permanently invisible content. The unit test `show-false-ssr-hidden-no-fouc.test.js` was deleted with the code. |
| **`<each>` `:`-shorthand markup-fn mount (#456) — NARROWED by #466 (S328)** | **codegen/emit-each.ts** — re-parses the shorthand child expr through `expression-parser.ts`'s `parseExprToNode` (a LAZY `require` at the use site, deliberately not a module-top import) and routes it through `maybeWrapEachPerItemEffect`. **NEW: one shared module-local `const _isRcdataBody = isRcdataElement(tagName)` (:1169)** read by BOTH per-item body branches — the shorthand branch (`shMarkupCapable && !_isRcdataBody` :1244, the `.value` write :1250) and the bare-body `_rcdataValueExpr` gate (:1183) — so the two cannot drift apart under §4.14 byte-identity. | a `:`-shorthand each body whose child is a markup-RETURNING fn call MOUNTS per row (`g-each-nested-residual-1`) **except inside RCDATA (`<textarea>`), where the mount is refused and the expression is written to `.value`.** **#456's own rationale block carried a FALSE premise and #466 left it in place verbatim rather than silently rewriting it:** it claimed a string-returning shorthand "never over-wraps -> no restricted-parent regression", but `shMarkupCapable` is a **MAY-analysis** — `fnBodyReturnsMarkup` admits a fn if ANY return is markup, so a mixed-return callee is markup-capable even on the calls handing back a plain string. `interpMayYieldNode` cannot tell the two apart, so that premise was never something the discriminant could deliver. **The name to grep is `_isRcdataBody`; `eachBodyLowering` / `TEXT_ONLY_CONTENT_ELEMENT_NAMES` / `EachBodyLowering` were the first attempt (`2c89086c`), rejected by the S239 gate and DELETED.** +3 conformance cases under `conformance/cases/each/`. |
| Content-hash asset naming | api.js pre-pass (`fnv1aHash`, gated on `contentHashAssets`) | build.js's `generateServerEntry` |
| Validate emit | codegen/validate-emit.ts | final artifact sanity |
| Meta-eval | meta-eval.ts | `^{}` meta-block execution |

## (carried) `ifRaw` / `ifCond` — ONE attribute, FIVE consumers, TWO native mirrors (§17.1.2, S302)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 15/17 code identifiers found in source (not found: `readStructuralIfAttr`, `stripSourceTextFromValue`); symbol line anchors: 0 confirmed, 1 re-derived to the current definition, 1 unresolved. Bare `file:line` anchors were NOT re-derived — grep._

The most useful thing to know about a structural `if=` is not where it is emitted — it is that
**every stage routes through the SAME function the markup `if=` path uses, deliberately, so a
structural predicate and a markup predicate are structurally incapable of diverging.** A private
re-implementation at any one of these is the defect this arc removed. Adding a second structural
attribute later means walking this exact list.

| # | Stage | Symbol | The rule |
|---|---|---|---|
| 1 | **Capture** | `ast-builder.js` `captureStructuralIfAttr` (**:2731** — was cited `:2705`) + `structuralHeaderAnchor` (**:2823** — was `:2797`) | Re-parses a SYNTHETIC `<x if=…>` opener through the SAME `tokenizeAttributes` + `parseAttributes` a markup opener uses. The value object is byte-for-byte what `<div if=…>` produces — that is what lets four hosts share one lowering. Offsets rebased −3 so diagnostics anchor in real source. |
| 2 | **ExprNode** | `native-walker/attrvalue-exprnode-walker.ts:208` | Populates `ifCond.exprNode` (and strips native's extra `sourceText`). |
| 3 | **Scope check** | `type-system.ts` `visitStructuralIfAttr` (**defined :13190**, called :12721 + :12811 — the map cited `:12688`, which is neither) → `visitAttr` | **Called BEFORE `scopeChain.push("each:…")`.** The opener predicate is evaluated OUTSIDE the per-item scope, so `if=item.ok` must NOT resolve against the row binding — reordering these two lines silently makes a wrong predicate compile clean. |
| 4 | **Reader credit (DG)** | `dependency-graph.ts` `creditFromAttrValue` (:2573), called for `ifCond` at :2930 | **`ifRaw` is deliberately NOT in the raw-scan lists** (:2964 / :3020 / :3088 carry that note). A private `/@ident/` scan over the raw text diverges in BOTH directions: it reads inside string literals (over-credit) and misses an `if=fn()` call-ref's `fnTransitiveReads` (under-credit). Without this consumer, a cell read ONLY by a structural gate false-fires `E-DG-002`. |
| 5 | **Emit** | `codegen/emit-html.ts` `emitGatedStructural` (**:1516** — was `:1498`) → `emitIfMountGate` (**:1439** — was `:1421`); kind test `isGateableIfValue` (**:1490** — was `:1472`) | The sole `if=` lowering; the `E-IF-IN-DISPATCHED-ARM` guard fires here too (**:1526** — was `:1508`; `refuseConditionalInDispatchedArm` is defined at `:802` and has THREE call sites — `:1526` structural, `:1755` if-chain, `:2745` markup). No `ifCond` field ⇒ byte-identical to the pre-§17.1.2 emitter. |
| — | **Native mirrors** | `native-parser/collect-hoisted.js` `readStructuralIfAttr` (:420); `native-parser/parse-file.js` (:762 match, :1081 each, `stripSourceTextFromValue` **:1611** (was cited `:1681`)) | A landing that adds an AST FIELD to a structural node owes these. An emit-time / runtime / CLI / message-only landing does not. |

**Field-shape invariant:** `ifRaw` and `ifCond` are **ABSENT, not null**, when the opener has no
`if=`. The within-node parser-parity canary compares FIELD SETS; null-stamping every
engine/match/each in the corpus surfaces as a divergence on the ~2 nested-engine positions where live
emits `text`/`comment` and native emits an `engine-decl`, growing the allowlist for a field neither
side actually disagrees about. Precedent on the same node family: `engine-decl.bodyChildren`.

**`ifCond` lives on the AST NODE, not in `engineMeta`.** That placement is load-bearing: it puts the
predicate out of reach of the JS-substrate emitters that build the engine's cell and rules, which is
what enforces §17.1.2.1's render-vs-lifecycle split structurally rather than by convention.

## (carried) §55 SYNTH-KEY RULE — FIVE COPIES, TWO RESOLUTION ORDERS, ONE OPEN DIVERGENCE (NEW section, S372)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 13/13 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

**The rule:** an `@<compound>[.field].<synthProp>` read (`isValid` / `errors` / `touched` /
`submitted`, the `SYNTH_PROPERTY_NAMES` set imported from `symbol-table.ts`) whose DOTTED key is a
registered §55 synth cell must lower to `_scrml_reactive_get("<dotted>")` — the flat key — **not** to
a member access on the compound's value object. The compound is a §6.3 Variant C NAMESPACE whose
value object carries only its field keys, so the member form reads `undefined` (silent, never mounts)
or dereferences `null` (a `TypeError` inside `_scrml_boot` → **the whole page never wires**).

**Read this table before you touch any of the five.** #704 exported one implementation to reduce the
copy count; `emit-expr.ts:1029-1030` states in as many words that this **did not make N equal 1**.

| # | Site | Resolution order | Consults `synthCellKeys`? |
|---|---|---|---|
| 1 | `emit-expr.ts` `emitMember` (**:2588**, synth branch **:2623-2631**) via `synthDottedKey` (**:2701**) | **LONGEST key first** — build the WHOLE chain, test that one key, no tail | yes (`ctx.synthCellKeys?.has(dotted)`) |
| 2 | `emit-expr.ts` **`resolveSynthCellPrefix`** (**:1032**, the export) | **SHORTEST prefix first** — scan segments upward, first synth-property segment whose prefix is registered wins, remainder returned as `tail` | yes (arg) |
| 3 | `emit-expr.ts` `collapseSynthSurfaceRefsInRaw` (raw-string client-statement fallback) | delegates to #2 | yes |
| 4 | `emit-event-wiring.ts` `computeDisplayToggleCondition`, `varName`+`dotPath` branch (**:541**) — the `if=`/`show=` toggle | delegates to #2, then applies a shape gate (below) | yes |
| 5 | `emit-event-wiring.ts` `computeChainBranchCondition`, `condition.name` arm (**:789-791**) — `else-if=@cfg.errors` | **NONE — emits `_scrml_reactive_get(<whole dotted path>)` with no membership test at all**, fabricating a key nothing registered | **no** |

⚠ **#1 AND #2 DISAGREE, AND THE DISAGREEMENT IS FILED, NOT THEORETICAL.** On
`@signup.errors.isValid` (a compound with a field literally named `errors`) longest-first resolves
`signup.errors.isValid` and shortest-first resolves `signup.errors` + tail `.isValid` — a read off the
rollup MAP, permanently `undefined`. **`emitMember` is the CORRECT side on that shape.** Converging
them means moving `emitMember` onto longest-key-first for both, a change to the AST member path with
its own blast radius — `g-synth-key-resolution-diverges-between-emitmember-and-shared-helper` (MED,
open). Site #5 is `g-else-if-dotted-cell-ref-emits-unregistered-flat-key` (MED, open, #692).
⚠ **THE LEDGER'S LOCUS FOR #5 IS STALE AT THIS WATERMARK** — `docs/known-gaps.md:2561` says
`emit-event-wiring.ts:647`; the arm is at **:789**, because #704 inserted 192 lines above it. Grep
for `condition.name`, do not seek `:647`.

**Site #4 carries a SHAPE GATE the other four do not, and it is not optional.** §55 does not give
every synth cell a scalar: the compound-level `errors` and `touched` rollups are OBJECT MAPS keyed by
field name, and an object literal is always truthy — collapsing them would turn a gate that read
`undefined` (never mounts) into one that is unconditionally true, rendering a pristine form's error
block at boot. The gate is DERIVED from the same key set the collapse reads (invariant 65), never an
allow-list: `<prefix>.submitted ∈ keys` IS the "prefix is a compound parent" test (§55.7 gives
`submitted` to parents only), and `seg` names a FIELD iff `<prefix>.<seg>.errors ∈ keys` **AND**
`<prefix>.<seg>.submitted ∉ keys`. The exact collapse/decline matrix, PA-measured by compiling at
this watermark, is in domain.map.md.

## (carried) Indirect callee resolution (#284, S303) — a SECOND call graph, on purpose
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 13/13 code identifiers found in source; symbol line anchors: 0 confirmed, 3 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

| Producer | Consumer | The rule |
|---|---|---|
| `indirect-callee-resolver.ts` — `resolveIndirectCallees` / `indirectResolvedCallees` / `aliasNamesResolvingTo` / `fnParamNameSet` / `dispatchTableNamesWithPeers` / `dispatchTablePeerMembers` | `route-inference.ts` (import :77) → `indirectInverseCallerMap` (:8087) → the Step 5c caller-context fixed point (:4774-4810) | **`inverseCallerMap` (:7787) stays BYTE-IDENTICAL** — it also drives `E-ROUTE-001` and the D4 `W-DEAD-FUNCTION` gate, and the S299 measurement of widening the shared walk was **72 corpus sites** of over-escalation. Indirect edges therefore get their own map, consulted by exactly one caller. |
| `indirectInverseCallerMap` | Step 5c placement | **ESCALATION-ONLY (FIX A, :4758).** SERVER indirect caller ⇒ promotion pressure. CLIENT indirect caller ⇒ **IGNORED** — counting it demotes a directly-server-called helper to client, and the server caller then references an undefined symbol → 500. |
| `markupReferencedNames` | the same fixed point (:4766) | **FIX B — a helper referenced from CLIENT MARKUP is EXCLUDED from indirect escalation.** Relocating it turns a synchronous render into a blanking async fetch. Its DIRECT-server-call escalation, if any, is baseline and left intact. |
| `aliasNamesResolvingTo` → `EmitLogicOpts.serverFnPeerAliasNames` | `emit-server.ts` → `emit-logic.ts` → `emit-control-flow.ts` (`_makeExprCtx`) → `emit-expr.ts` `EmitExprContext.serverFnPeerAliasNames` (:5400), consumed :1488 + :3013 | The await-lowering half: `alias(...)` is awaited like the peer it aliases. NULL/empty ⇒ byte-identical pre-fix emission — every threading site is written that way, so a file with no alias peers is unaffected. |

| **`IndirectResolution.dispatchCalledTargets` (NEW, :71)** | route-inference placement + emit-server emission, each intersecting it with its own function/peer universe | The names reached through a DIRECT dispatch CALL — `t["k"](…)` / `t.k(…)` resolve to that member, `t[dyn](…)` to the WHOLE member set (any could be the target). **Plus a RAW-TEXT scan for a dispatch call inside a template literal or a `?{}` SQL body:** a template's `${…}` is never decomposed into AST nodes, so a `t[k]()` there was invisible, its target got no caller edge, was dead-code-dropped, and the emitted call threw `ReferenceError`. The trailing `(` requirement keeps a bare member READ (`${t.a}`) from escalating. Reassigned tables never enter `tableBindings`, so they resolve to nothing. |
| `dispatchTableNamesWithPeers` / `dispatchTablePeerMembers` (`IndirectResolution.tableBindings`) | `codegen/emit-server.ts:3571` / `:3573` (import `:23`) — ⛑ **S384: the carried `:3043` / `:3045` were ALREADY WRONG pre-window; RE-DERIVED BY GREP** | **A DIRECT dispatch call `t[k](...)` / `t.k(...)` has a MEMBER/INDEX callee, not a bare ident, so it is absent from `calledNames` entirely** — the alias path cannot see it. Two exports because they answer two different questions: `…NamesWithPeers` gates AWAIT-lowering (conservative: the table has ≥1 peer member; over-awaiting a sync value is a no-op, under-awaiting leaks a Promise), `…PeerMembers` gates EMISSION (a `{k: peer}` entry references the peer as a VALUE, so the callable must exist even if `t[k]()` is never called — otherwise a bare `ReferenceError`). Reassigned tables are dropped before either runs. |

Resolution is **SAME-FILE first**, falling back to the global name set only when no same-file binding
exists (mirrors the 5c-bis precedent). A DEAD value reference is not a call and creates **no** edge.

## (carried) Module-init vs the soft-nav rehydrator — WHO emits what, and what re-runs on a nav
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 25/25 code identifiers found in source; symbol line anchors: 0 confirmed, 5 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. Cited gaps whose marker is no longer open: g-timer-poll-body-runs-once-at-module-init=resolved._

**The routing question the prior generation of this map could not answer.** A dev agent asking
"where is per-chunk module-init emission produced, and what owns the boundary between it and the
registered rehydrator?" was routed to `codegen/index.ts` + `runtime-template.js`. **Both are wrong
loci.** The producers are `emit-client.ts` (assembly), `emit-reactive-wiring.ts` (the lifecycle
bodies) and `emit-event-wiring.ts` (the boundary itself).

| What | Emitted by | Where it LANDS in the chunk | Re-runs on a soft nav? |
|---|---|---|---|
| cell inits, `<match>`/`<each>` dispatchers, engine substrate + hydration + opener `effect=` | `emit-client.ts` `generateClientJs` `lines[]` | **module-init** (script eval) | **NO** |
| `<timer>` / `<poll>` `_scrml_timer_start(scope, id, ms, fn, immediate)` | `emit-reactive-wiring.ts` `emitLifecycleNode` (via `emitReactiveWiring`, called at `emit-client.ts:2355`) | **module-init** | **NO — starts once, ever** |
| **the `<timer>`/`<poll>`/`<timeout>` BODY itself** | `emit-reactive-wiring.ts` (the tick / `setTimeout` callback) — **and, until #510, ALSO by `collect.ts`'s `collectTopLevelLogicStatements`, which descended the tag and emitted the body a SECOND time** | the callback; **pre-#510 also module-init** | **NO** — but pre-#510 it RAN ONCE AT LOAD before the timer ever fired (`g-timer-poll-body-runs-once-at-module-init`). Fixed by `DEFERRED_LIFECYCLE_BODY_TAGS`; `<request>`/`<channel>` deliberately excluded from that set because their descent IS their only correct emission |
| `<keyboard>`/`<mouse>`/`<gamepad>`, `<request>`, `<timeout>`, `_bindProps` | `emit-reactive-wiring.ts` (`classifyMarkupNodes` :2373) | **module-init** | **NO** |
| desugared `on mount { … }` | `emit-reactive-wiring.ts:536` (`_onMountEffect`) | **module-init**, inside a generated `(async () => {…})().catch(...)` when it calls a server fn | **NO** |
| `ref=` / `bind:` / `class:` wiring (`_scrml_bind_rewire`) | `emit-client.ts:2464-2470` | **module-init**, as a re-invokable root-scoped fn | **NO — deliberately NOT registered as a rehydrator** (it would re-attach listeners to elements that still carry boot's) |
| delegated `click`/`submit` document listeners | `emit-event-wiring.ts` (inline, inside `_scrml_boot`) | inside `_scrml_boot` | **N/A — they survive a swap on their own** |
| **non-delegable handlers + reactive DISPLAY binding** | `emit-event-wiring.ts` accumulators `nonDelegatedRewire` (:1228) + `reactiveRewire` (:1239) | **`_scrml_nav_rewire(root)` at :2165**, inside `_scrml_boot` | **YES — this is the entire rehydrator** |
| §20.8.3 link-boost | `emit-client.ts:2497-2503`, gated on `fileHasOutlet` | module scope, its own `DOMContentLoaded` handler registered AFTER the author's | N/A (delegated on `document`) |

**NEW THIS WINDOW (#510, §6.7.6) — the immediate first tick has a SPLIT locus, and both halves
matter.** The GATE is at the emit site (`emit-reactive-wiring.ts` decides whether to append `, true`,
`, _scrml_reactive_get("<var>")`, or nothing, based on tag and `running=`); the FIRE is at the arm
site (`runtime-template.js` `_scrml_timer_start`'s fifth `immediate` param calls `tick()` once, after
`setInterval`). **It routes through the same `tick()` as every other tick, so it inherits the queuing
and error handling rather than duplicating them** — and it is never re-fired on resume, because it
lives in `_scrml_timer_start` and not in `_scrml_timer_resume`. `<timer>` passes no fifth argument at
all (§6.7.5), so its emission is byte-identical to pre-fix.

**The boundary is emission ORDER, not a structure.** `emit-event-wiring.ts:715-716` pushes
`(function() {` + `function _scrml_boot() {`; `:2186-2193` closes them and emits the dispatch
(`_scrml_chunk_loading` truthy ⇒ boot NOW; else defer to `DOMContentLoaded`). So everything
`emit-client.ts` pushed BEFORE its `emitEventWiring(...)` call at `:2475` is module-init, and
everything that call returns is inside the boot fn. Nothing marks the seam.

**Registration:** `_scrml_register_rehydrator` (`runtime-template.js:2684`) → `_scrml_rehydrators`
(:2683) → replayed by `_scrml_rehydrate_region(root)` (:3162), which `_scrml_nav_apply_html` (:3557)
calls at :3094 — ⛑ **S384: ALL FIVE were ALREADY WRONG before this window (`:2629`/`:2628`/`:3098`/`:2996`/`:3032`);
`runtime-template.js` below :5599 did NOT move this window, so the drift predates it. RE-DERIVED BY GREP** — AFTER `_scrml_teardown_region(liveOutlet)` at :3026.

**The emit-time region↔resource association EXISTS and is LEXICAL** — `emit-reactive-wiring.ts`
`classifyMarkupNodes` carries an `insideOutlet` flag and stamps `node._outletResident` (:2428 for
`<timer>`/`<poll>`, :1114 for input-state), which routes the teardown into `_scrml_region_cleanups`
(:1273-1277 / :1310) instead of the boot-once `_scrml_register_cleanup`. **It never fires for route
content, because route content is in a different FILE from the shell that owns the `<outlet>` and is
therefore never lexically inside one.** `fileHasOutlet(fileAST)` (:1042) discriminates SHELL files
and is likewise insufficient for the single-file `<page>` form. Read this before scoping
`g-route-timer-poll-not-stopped-on-soft-nav`: the machinery is right, the granularity is wrong.

## (carried) Runtime-chunk gating — the tree-shake locus (READ BEFORE FIXING A BUNDLE ReferenceError)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 14/14 code identifiers found in source; symbol line anchors: 0 confirmed, 4 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

Three files, one decision, and **none of them is `codegen/index.ts`**:

1. **`codegen/emit-client.ts` `detectRuntimeChunks(fileAST, ctx)` (:273)** — the PRE-EMIT AST walk.
   Registers a chunk when a walkable AST shape proves it is needed. Reads `compute-pgo-flags.ts`
   results for the `reset` / `equality` / for-stmt gates and `ctx.hasPrefetchableLinks`. Several
   emitters (`emit-control-flow.ts:625`, `emit-html.ts:3314/3890`, `route-splitter.ts`,
   `reactive-deps.ts`, `emit-synth-surface.ts`, `context.ts`) carry "both sites must agree" comments
   pointing back here — those are MIRRORS of the gate, not the gate.
2. **`codegen/emit-client.ts` `POST_EMIT_HELPER_CHUNK_GATES` (:63)** — the POST-EMIT reference
   scan, for helpers no pre-emit AST walk can see (wiring minted from the binding registry at emit
   time). Entries match as **SUBSTRINGS** of an emitted line: a trailing `(` pins a CALL site, a
   bare name also catches a VALUE / `typeof` reference. Current table:
   `["_scrml_structural_eq(", "equality"]`, `["_scrml_reset(", "reset"]`,
   **`["_scrml_message_for", "messages"]` (NEW, GH #234)**. The scan runs BEFORE
   `cell-accessor-rename.ts`'s `_scrml_cs_` rename, which is why the bare-name entry is exact
   (`_scrml_cs_message_for` does not contain `_scrml_message_for` as a substring).
3. **`codegen/runtime-chunks.ts` `CHUNK_DEPENDENCIES` (:576)** — declarative cross-chunk edges,
   transitively closed at the END of `detectRuntimeChunks` before the chunk set is frozen.
4. **`codegen/runtime-chunks.ts` `RUNTIME_CHUNK_ORDER`'s `stdlib-*` MEMBERS (NEW LOAD-BEARING ROLE, #669)** —
   the stdlib half of this array is not a tree-shake hint, it is the **CLIENT CONTRACT**. A client-side
   `import { x } from 'scrml:NAME'` lowers UNCONDITIONALLY to `const { x } = _scrml_stdlib.NAME;` and
   that property is defined by the `stdlib-NAME` entry **and by nothing else** — absent, the
   destructure reads `undefined` and THROWS AT BUNDLE LOAD, killing the whole page. **4 -> 13 chunks
   this window; 17 of 21 modules were DOA before it.** `STDLIB_CLIENT_CHUNK_MODULES` (:413) and
   `hasStdlibClientChunk` (:445) are DERIVED from this same array so the gate
   (`E-STDLIB-CLIENT-CHUNK-MISSING`, `emit-client.ts:3817`) and the outcome cannot drift — the S368
   defect was a gate reading `existsSync` of a shim FILE (all 21 exist) while the deciding property
   was chunk registration. ⚠ **Matching is EXACT: a SUBMODULE does not inherit its root's chunk**,
   because `scrml:auth/jwt` lowers to `_scrml_stdlib.auth/jwt`, which JS parses as the DIVISION
   `_scrml_stdlib.auth / jwt`. **If you are fixing a bundle `TypeError` on a `scrml:` import, this is
   the list — not the shim directory.**

**GH #234, the shape to recognize:** `<errors of=…/>` wiring (emit-event-wiring.ts) captures
`_scrml_message_for` as a VALUE behind `typeof` rather than calling it, so the call-form gate could
not match; the `messages` chunk that DEFINES it was gated only on a state-decl validator carrying an
inline override. The `typeof` guard did NOT save it: `_scrml_message_for` is a
`CELL_SCOPE_ACCESSOR`, so the post-hoc namespace rename rewrote BOTH occurrences — including the one
inside `typeof` — to `_scrml_cs_message_for`, whose wrapper the chunk prologue ALWAYS defines. The
guard therefore always took the true branch and the `ReferenceError` fired inside the wrapper body
at the top of `_scrml_boot`, aborting boot before any handler bound. Adopter symptom: a login form
issuing zero network requests while every server route was green.

## (carried) Coordinate space — SOURCE vs DIST (D-4, S296). The class, not just the bug.
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 6/6 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

**The dist tree is NOT a mirror of the source tree.** SPEC §47.9.5 strips a leading `pages/`
segment from `dirname(relative(outputBaseDir, source))`, so `pages/login.scrml` lands at
`dist/login.server.js`, NOT `dist/pages/login.server.js`. The strip applies to the DIRNAME only;
the basename is untouched.

- **Emission.** `emit-server.ts` previously swapped only the extension on `stmt.source`, which
  overshoots by exactly one segment for every importer under `pages/`: a source-space
  `../models/auth.scrml` became `../models/auth.server.js`, which from `dist/login.server.js` points
  ABOVE `dist/`. The compile stayed GREEN (a missing file is not a syntax error) and the bundle died
  at runtime with `Cannot find module`. Now `distRelativeServerSpecifier` expresses BOTH endpoints in
  post-strip dist space and takes the relative path between them, prefixing `./` when needed (a bare
  `models/auth.server.js` would be a node_modules lookup). Falls back to verbatim when
  `outputBaseDir` is absent or either endpoint is outside the base. On a project with no `pages/`
  segment the two spaces coincide and the emit is byte-identical.
- **Reversal.** `api.js` must reverse an emitted specifier back to a SOURCE path to look the target
  up in `cgResult.outputs` (source-keyed). The inverse transform is **AMBIGUOUS** — a dist
  `models/auth.server.js` could come from `models/auth.scrml` OR `pages/models/auth.scrml` — so
  reversal is a FORWARD INDEX, not an inverse: `distServerKeyToSource` maps every compiled source to
  the dist-relative `.server.js` it writes, through the same `pathFor` transform.
  `serverImportTargetSource` is two-tier (dist first, source as the legacy no-`outputBaseDir`
  fallback), mirroring emit-server's two emission modes one-for-one.
- **Why the guard was silent.** `W-SERVER-IMPORT-UNEMITTED` exists precisely to catch a runtime
  `Cannot find module`, and it stayed quiet on the D-4 reproducer because it validated in the ONE
  space where the path is always self-consistent. **The oracle inherited the implementation's
  coordinate assumption** (the S276 shape). `rewriteRelativeImportPaths`'s `.server.js`/`.client.js`
  skip is still correct, but its OLD justification ("they live at the same relative position as
  their source") was FALSE — the skip is correct only because the emitter now speaks dist space.

## (carried) §14.8.11 DB-authoritative tier — the `scrml db-migrate` command graph
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 8/8 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

`commands/db-migrate.js`'s `runDbMigrate(args)`: `parseArgs` (`--db`, `--dry-run`,
`--allow-destructive`) -> `parseProjectSchema` (live parse pipeline `splitBlocks`->`buildAST`, then
`extractDesiredSchema` per file, merging first-decl-wins; **NOW ALSO** unions
`tableRefsInSource(source)` across every file into `{queriedTables, queriedPrivileges,
undeterminedSql}`) -> the `E-DBAUTH-SQLITE` / `E-DBAUTH-NO-TENANT-COLUMN` pre-flights + an explicit
operator warning per `undeterminedSql` entry -> either `runPgApply({connectionString, desired,
dryRun, allowDestructive, queriedTables, queriedPrivileges})` or `runSqliteApply`. `printPlan(plan,
actualTableCount, warnings)` distinguishes an EMPTY plan from a WITHHELD one.

`schema-differ.js`'s `parseSchemaBlock` is the SHARED parser both `db-migrate` (via
`extractDesiredSchema`) and the pre-existing SQLite migrate path consume — brace-depth-aware,
returns `{tables, fns}` (`fns` is ADDITIVE, so all five pre-existing `.tables` consumers —
protect-analyzer.ts, channel-watches.ts, gauntlet-phase1-checks.js, codegen/index.ts,
db-authoritative.ts — are unaffected).

## (carried) Internal Module Graph — supporting layers
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 59/61 code identifiers found in source (not found: `isUnitCCExempt`, `scanEmittedCode`); symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

| Module | Role |
|---|---|
| **sql-table-refs.js (NEW S292)** | A bounded identifier SCANNER over `?{}` SQL bodies — **explicitly not a SQL parser**. `tableRefsInSql(sql)` / `sqlBodiesInSource(source)` / `tableRefsInSource(source)` return `{tables, privileges, undetermined}`. `TABLE_INTRODUCERS` pairs each clause with the privilege it implies (`PRIV_RANK` resolves `DELETE FROM`'s double match); `UNRESOLVABLE` enumerates the five deliberately-unhandled shapes (CTE, subquery in FROM/JOIN, LATERAL, dynamic EXECUTE). **A caller MUST NOT read an empty `tables` as "touches nothing"** — that is how the bug re-reproduces on a different table, and it fails closed at runtime as an opaque `permission denied`. Consumed ONLY by commands/db-migrate.js. |
| codegen/scheduling.ts | Colorless-async + batch-hoist scheduling, **plus (NEW this window) the emitted-JS scanner family**: `scanEmittedCode` tracks code / `'` / `"` / template-literal (incl. re-entrant `${}`) / `//` / block-comment modes, raises one depth counter on `(`/`[`/`{`, and reports depth-0 statement ends + depth-0 BLOCK brace groups (an object literal's closer is NOT a statement end). Consumed by emit-reactive-wiring.ts only. |
| codegen/db-authoritative.ts | `appDeclaresDbAuthoritative` (conditional-engagement gate), `wrapPrincipalTxn` (A1/S2 scope-aware txn wrapper, brace-scope-stack tracked so module-level infra helpers are never wrapped), `extractDesiredSchema` (+ `W-DBAUTH-MARKER-NEARMISS`). Unchanged this window. |
| codegen/sql-ident.ts | `quoteIdent(name)` — doubles an embedded `"`. The ONLY safe way to interpolate a DB identifier anywhere in the pipeline. Imported by schema-differ.js and codegen/emit-channel.ts (aliased `pgQuoteIdent`). Unchanged this window. |
| schema-differ.js | The differ + DB-authoritative DDL emitter. Exports: `parseSchemaBlock`, `readActualSchema`, **`columnConstraintDrift` (NEW)**, `diffSchema`, `generateCreateTable`, `DBAUTH_ROLE`/`DBAUTH_POLICY`/`DBAUTH_TENANT_GUC`/`DBAUTH_CAPS_GUC`, `generateBoundedRoleDDL`, `generateDbAuthoritativeDDL`, `generateScrmlHasCapDDL`, `generateSecdefDDL`, **`referencesHint` (NEW)**, `findNonLiteralSetItems`, `mapPgTypeToScrml`, `emitScrmlSchemaSource`. |
| codegen/chunk-namespace.ts | per-compilation-unit namespace for the runtime-global token space. Owns `nsId`/`nsName`/`nsCellKey`/`stripNsName`, `chunkNamespaceToken`, `resolveProjectRoot`, `buildCellOwnerMap`, and `assertChunkTokensDistinct` (a hard error, deliberately NOT `E-CG-010`). |
| codegen/cell-accessor-rename.ts | `renameCellAccessors` — the Acorn-parse + range-SPLICE pass rewriting every cell-accessor CALL to its `_scrml_cs_` chunk-local wrapper. The SOLE producer of `_scrml_cs_*`. **Runs at bundle assembly in index.ts, AFTER emit-client.ts's post-emit chunk scan** — that ordering is what makes the bare-name gate entry exact. |
| codegen/fnv1a-hash.ts | the shared FNV-1a 32-bit -> 8-char base36 primitive (§47.1.3). |
| **codegen/log-loc.ts** | the §20.6 per-file source registry (`registerFileSource`) and **TWO projections off it**: `resolveLogLoc` -> a `"basename:line"` STRING baked into emitted JS for the `log()` origin tag, and **`resolveSpanLineCol` (NEW S397, `:123`) -> numeric `{line, col}` for a DIAGNOSTIC span, or `null`**. ⚑ It exists because `expression-parser.ts`'s `spanFromEstree` hard-codes `line: 1, col: 1` — only `start`/`end` are true source coordinates on an expression-derived node. Dependency-light on purpose (its own `baseName`, no `node:path`). |
| **~~default-logic-exemption.ts~~ (⛑ S445: DELETED #1196 — row SUPERSEDED)** | `isDefaultLogicBodyTopExempt(filePath)` (:88) — the per-file suppression predicate for the §40.8 default-logic BODY-TOP diagnostics, over `unit-cc-exemption-list.json` (loaded once at module init; malformed/absent JSON → empty list). Strict `Set` membership, then a `/`-boundary suffix match (spans carry ABSOLUTE paths; the list is repo-relative; a worktree harness inserts `.claude/worktrees/agent-XXX/`). **ZERO local imports, and that is the contract** — TAB runs before SYM, so `ast-builder.js` may not import `symbol-table.ts`; this leaf is what both stages may depend on. Extracted from `symbol-table.ts` at S379 for a SECOND consumer that is **HELD and not in the compiler**; as of S383 there are TWO held would-be consumers (`E-CALL-NOT-IN-LOGIC-CONTEXT`, and ruling 3's §40.8 arm of `E-CONTROL-FLOW-IN-MARKUP`). **Sole LIVE consumer: `symbol-table.ts` PASS 3 via the `isUnitCCExempt` alias (`E-WRITE-NOT-IN-LOGIC-CONTEXT`).** Do not fold it back in. |
| codegen/runtime-chunks.ts | the runtime chunk catalog + `CHUNK_DEPENDENCIES`. |
| compute-pgo-flags.ts | the profile-guided flags `detectRuntimeChunks` reads for the `reset` / `equality` / for-stmt gates. Its header comments are the best in-tree narrative of what a missed gate costs. |
| codegen/sql-lex.ts | the pure LIVE-vs-INERT `${}` classifier (§52.15.5). One function feeds BOTH collect.ts and rewrite.ts. |
| codegen/tenant-egress.ts | the §14.8.10 tenant-row isolation floor; also owns `_scrml_active_tenant`/`_scrml_active_caps`. |
| codegen/index.ts | the codegen dispatcher; chunk-namespace WIRING; §40.8.2 shell composition (`computeDependencyClientScripts` is 4-arg since GH #235); the `E-DBAUTH-SQLITE` compile-time gate. |
| codegen/emit-html.ts | markup emission; `analyzeWriterConflict` (#81); `treeHasAuthorMain` (§20.8.1.1); **`directiveIsFormValue` computation for arm-body `value=` (i225)**. |
| codegen/binding-registry.ts | pure data registry, no imports. `LogicBinding` carries `isReactiveValueAttr`/`valueAttrName`/`valueAttrIsFormValue`/`valueAttrKey` and **`directiveIsFormValue` (NEW, i225)**. |
| codegen/emit-variant-guard.ts | `<match>`/`<engine>` arm wiring; consumes `directiveIsFormValue`; carries the navigate-wave1c eager-vs-DCL dispatch for arm wiring. |
| codegen/emit-event-wiring.ts | event-handler wiring; owns the `_scrml_boot` IIFE + boot dispatch. |
| codegen/route-splitter.ts | per-route chunk manifest serialization (`serializeChunksManifest`); several comments mirror the `detectRuntimeChunks` activation gates. |
| codegen/db-driver.ts | `resolveDbDriver(url)` -> `{driver, connectionString}`. |
| tailwind-classes.js | the Tailwind v3 utility registry + the three `*-TAILWIND-*` diagnostics. |
| module-resolver.js | resolves `scrml:*` stdlib imports (`STDLIB_ROOT` via `fileURLToPath` — hence `stdlib/` in the publish allowlist) + relative imports. |
| semdiff.ts | emit-identity Tier-0 compare; `canonicalizeChunkNamespaceToken` neutralizes per-path tokens. |
| expression-parser.ts | `parseExprToNode`, `exprNodeCollectCallees`, **`forEachIdentInExprNode` (consumed by D-5)**. |

## (carried) THE `~` DIAGNOSTIC SINK — a THREE-MODULE cycle-free seam (NEW section, S397, #832)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 9/10 code identifiers found in source (not found: `_foreignCrossingErrors`); symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

**TWO NEW INTERNAL EDGES LANDED THIS WINDOW AND BOTH ARE INSIDE `codegen/`.** They are here because
the shape is reusable and because deleting either half looks harmless at the call site.

| edge | what crosses it |
|---|---|
| `codegen/emit-expr.ts` -> `codegen/log-loc.ts` | **NEW: `resolveSpanLineCol`**, imported alongside the existing `resolveLogLoc` |
| `codegen/index.ts` -> `codegen/emit-expr.ts` | **NEW: `resetTildeUnresolvedErrors` / `drainTildeUnresolvedErrors`**, added to the existing setter import list |

⛑ **WHY A MODULE-LEVEL SINK AND NOT `ctx.errors` — AND THIS IS THE THIRD INSTANCE OF THE SAME PATTERN,
SO IT IS A PATTERN AND NOT A HACK.** `EmitExprContext.errors` is optional and was **MEASURED
`undefined` at every site the `~` orphan reaches** — the orphan arises deep inside client-mode
expression emission, on paths that construct a context without one. Threading `errors` through every
one of those constructors is a far larger change than the arc allowed and is the wrong shape anyway.
The existing siblings: **`_sessionValueUseErrors`** (same file) and **emit-server's
`_foreignCrossingErrors`**. ⚠ **`emit-logic.ts`'s `(opts as any).preparedStmtErrors` for `E-SQL-006` is
the SAME class**, and the standing lesson from that code is the one that matters here: **the detector
was always correct and the narrow sink was NOT DRAINED, so a live diagnostic looked dead for months.**
If you add a fourth, add its drain in the same commit.

⛔ **THE LIFECYCLE IS WIDER THAN THE SESSION SINK'S, DELIBERATELY, AND BOTH DRAINS ARE LOAD-BEARING.**

- **Reset ONCE**, at the top of `runCG` (`codegen/index.ts:1192`) — not per-file, so no path through
  the loop can skip the arm. ⚑ A stale sink from a PREVIOUS `runCG` **in the same process** would
  attribute one compile's orphan to the next, and **every test file drives multiple `runCG` calls**.
- **Drain TWICE**: `:2649` in the per-file loop's `finally`, and `:3517` immediately before `runCG`
  returns. The tool (`outputs.set(filePath, toolOutput)`) and library (`libOutput`) paths each leave
  the iteration by their **own `continue`**, so a drain at the loop's last statement would collect the
  browser path only. And emission **continues after the loop closes** — per-page shell composition and
  the §40.9.7 route splitter both re-enter expression emission. Draining clears, so it is idempotent.
- **The drain point decides WHEN, not WHICH FILE.** Each `CGError` carries its own `span.file`, so
  file attribution is sound regardless of where it is collected. ⚠ **Within-file POSITION is not** —
  see `log-loc.ts` in structure.map.md and the `E-CG-TILDE-UNRESOLVED` section in error.map.md.

⚑ **`log-loc.ts` IS NOW A TWO-PROJECTION MODULE OFF ONE REGISTRY.** `resolveLogLoc` bakes a
`"basename:line"` STRING into emitted JS for the §20.6 `log()` origin tag; `resolveSpanLineCol` returns
numeric `{ line, col }` for a DIAGNOSTIC span. Same registry, same `LineIndex`, same cache — only the
projection differs. **`codegen` stays dependency-light here on purpose** (the file's own `baseName`
avoids `node:path`); do not add an import to it casually.

## (carried) `escalationReasons` — the placement value that crosses the RI -> codegen seam (NEW section, S299)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 5/5 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

The complete producer/consumer set at this HEAD. It is SHORT, which is the point: an
`EscalationReason` variant is a cross-module contract, not a local enum, and adding one touches every
row below.

| Role | Site | What it does |
|---|---|---|
| TYPE | `route-inference.ts:262` (`RouteInfo.escalationReasons: EscalationReason[]`) + the header contract at `:14` (*"empty if client"*) | the union. Kinds in use: `explicit-annotation`, `server-only-resource`, `protected-field`, `session-access`, `channel-*`, `middleware-handle`. |
| PRODUCER | `route-inference.ts:5512` (`escalationReasons: deduped`) | the main per-function assembly, deduped. |
| PRODUCER | `route-inference.ts:5230` | the middleware-handle arm (`_handleEsc?.deduped ?? [{kind:"middleware-handle"}]`). |
| CONSUMER | **`codegen/emit-server.ts:843`** (`isBodyOnlyEscalation`; the `escalationReasons` read is `:844`, the `.every()` `:848`, and the sole call site `:2028`) — ⛑ **S384: the carried `:727`/`:728` were ALREADY WRONG pre-window (a doc-comment run); RE-DERIVED BY GREP** | §12.6 library mode. **Gates on EVERY reason being `server-only-resource`** — the `.every()` that makes a NEW reason kind a breaking change: a fresh kind fails it and silently re-attaches an HTTP wrapper §12.6 says to drop. `:1777` carries the comment recording that expectation. |
| CONSUMER | `describeServerTrigger` (message rendering) | renders `server-only-resource` as "the server-only resource `<resourceType>`"; sorts `explicit-annotation` last, which is what makes `W-DEPRECATED-SERVER-MODIFIER` report a redundant `server` keyword correctly. |

**This is why S299's Trigger 3 reuses `server-only-resource` with `resourceType` = the module
specifier instead of adding a variant.** If you are about to add an `EscalationReason` kind, the
`.every()` at `emit-server.ts:848` (⛑ **S384: `:727` was ALREADY WRONG pre-window; `isBodyOnlyEscalation` is `:843` and the `.every()` is `:848` — re-derived by grep**) is the thing to check first.

## (carried) Colorless-async (Seam-A / Phase-2 combinators, GITI-037/GITI-038) — TWO new destinations this window
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 10/10 code identifiers found in source; symbol line anchors: 0 confirmed, 1 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. Cited gaps whose marker is no longer open: g-reset-writes-pending-promise-when-init-thunk-calls-a-server-fn=resolved. Paths cited that do NOT exist at f92d1a8fb: `samples/.../phase1-function-with-sql-002.scrml`._
A plain (non-`?{}`) function calling a Promise-returning host primitive — directly, transitively, or
as a returned closure — is compiler-classified `async` and auto-awaited; there is no `async`/`await`
in scrml source (§13.1/§13.2). Seam-A Phase-1 unified the classifiers onto `computeAsyncFnNames`
with `E-ASYNC-STDLIB-IN-SYNC-CALLBACK` as the no-silent-leak backstop; the Phase-2 combinator
transform lives in `codegen/async-combinators.ts`; GITI-038 split Q1 (own-signature async) from Q2
(needs AST re-emission, `computeNestedAsyncFnHolders`); i87 gave `injectPromiseAwait` its
position-invariance. **GH #237 extends the same §13.2 obligation to a THIRD destination —
a desugared `on mount { … }` body, which is emitted at MODULE scope inside a SYNC IIFE where
`await` is illegal.** Before the fix, every server call in a mount block landed as a bare pending
Promise, so an `if (u is not) { redirect("/login") }` guard could never take its deny branch —
fail-OPEN. The sibling reactive-cell destination (`@you = loadMe(1)`) was already correct
(emit-client.ts lifts it into its own async IIFE).

**Two MORE destinations landed this window, both narrower than GH #237's mount-body fix.**
(a) **A value-form `match`-arm result (#394)** — see `parenthesizeAwaitServerCallsInExpr` in the
pipeline table above; the arm result re-emits from a raw EXPRESSION STRING, a shape the statement-level
injector never reached, and the fix wraps the call node rather than prefixing `await` because the arm
value is often a RECEIVER expression (`fn().field`), not a bare call. (b) **A cross-module ASYNC
import consumed inside a markup `${…}` interpolation (#391)** — `emit-client.ts` / `emit-reactive-
wiring.ts`; the wrap decision is made off the injector's OWN EMITTED OUTPUT rather than a re-derived
predicate, after an S239 catch surfaced a page-breaking SyntaxError from an earlier version of the fix.
Neither of those two narrower fixes touched `scheduling.ts`'s `isControlFlowBoundary` treatment of
`given`/`if`/`match` bodies directly — that was the separate, larger arc, and **it has since LANDED**
(PR #405, `649d6fce`, reviewed clean at `bbd77bec`): see the "§13.2 CPS auto-await CHOKE-POINT" row
above for what changed and which gaps it closed.

**THIS WINDOW closes the arc's SHAPE, not its bug class.** Two landings, in order: **#429** put the
`await` at the CALL SITE for a client server fn (the fourth `emitCall` await branch) — the only place
that reaches receiver-tail and nested-argument positions; **#442** then removed the reason the three
consumers could disagree at all, by giving them ONE provider. Read the two new pipeline rows above
before touching any of it.

**The honest status, and it is deliberately recorded here rather than in a changelog line: the
auto-await family is NOT closed.** **142** bare (unawaited) client server-fn call sites survive in
cleanly-compiling corpus sources, with a base->head delta of **ZERO**, measured two independent ways
(an independent reviewer sweep: 49 bare of 148 across 70 sources; the harness's own wider/looser
metric: 150 bare of 472 across 103 sources). Four are unambiguous instances of the target bug in
sources that compile cleanly on EVERY revision:

- `examples/19-lin-token.scrml:107` — a bare `_scrml_fetch_mintTicket_12(…)` in an **async** host whose
  sibling call on the next line **is** awaited
- `samples/compilation-tests/gauntlet-r10-rails-blog.scrml:331,334` — a pending Promise written into a
  cell and then rendered
- `examples/17-schema-migrations.scrml:100` — `for (const n of _scrml_fetch_listNotes_13())`
- `samples/.../phase1-function-with-sql-002.scrml:55` — `await (_scrml_fetch_loadUsers_3().length)`,
  verbatim the precedence bug `isAwaitedClientServerFnCall`'s own doc-comment cites as its reason to exist

**A changelog line reading "closes the auto-await family" would be false.** The unreached shapes use
DIFFERENT emitter paths — the CPS / failable-fn wrapper, module top-level init, and the
markup-interpolation lift. Tracked as `g-auto-await-family-not-closed-150-bare-server-call-sites-in-
clean-sources` (HIGH, open); **the 142/150 count is now produced by the harness itself**, so the next
change to this class has a measurable before/after rather than an argument.

**Sibling HIGH filed the same window, on a path nothing in the arc touched:**
`g-reset-writes-pending-promise-when-init-thunk-calls-a-server-fn` — `runtime-template.js:1219` does
`_scrml_reset_apply(name, _scrml_init_fns[name]())` with **no `await`** (⛑ **S384: `:1168` was ALREADY
WRONG — a doc-comment line — and the write now routes through `_scrml_reset_apply` (:1402), not a bare
`_scrml_reactive_set`. RE-DERIVED BY GREP**), so `reset(@cell)` on a cell
whose init expression calls a server fn writes the PROMISE into the cell. The DECLARATION path awaits
(the codegen injectors cover it); the RUNTIME reset path re-invokes the same thunk and does not — a
cell can be correct at mount and wrong after `reset()`. PA-reproduced on shipped
`examples/03-contact-book.scrml`. The obvious fix makes `_scrml_reset` async, which changes every call
site — the same §13.2-vs-§19.6 shape as the S322 absorb ruling (option **C**: await the IIFE AND keep
its `.catch`), **which is RULED but NOT YET BUILT** and sequences after U1 because it touches the same
file.

## (carried) Defense-in-depth: stdlib async classification (api.js STDLIB-EXPORT-SEED)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 2/2 code identifiers found in source; symbol line anchors: 0 confirmed, 2 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
A server-only `scrml:*` re-export whose `{kind, isAsync}` cannot be resolved FAILS CLOSED (defaults
to async). Mechanism unchanged. **What CHANGED at S299 is what may be reused from it: nothing.**
This backstop is driven by `route-inference.ts`'s `SERVER_ONLY_SCRML_MODULES` (:685), a set tuned for
a decision where OVER-inclusion is free. §12.2 Trigger 3 placement is driven by the separate
`ESCALATION_SERVER_ONLY_MODULES` (:762). Two sets, two safe-error directions, one file — see the
Trigger-3 row in the pipeline table and domain.map.md's section.

## (carried) stdlib module pairing (compiler/runtime/stdlib/*.js <-> stdlib/*/index.scrml)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 3/3 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
21 modules: auth, compiler, cron, crypto, data, format, fs, host, http, math, mcp, oauth (+5
provider sub-modules), path, process, random, redis, regex, router, store, test, time. Each ships
BOTH a canonical `.scrml` source and a JS host shim. Unchanged this window — but `stdlib/` is now
part of the PUBLISHED package surface.

**Client-safety classification of those 21 (S299, §12.2 Trigger 3 — derived from BOTH the
`stdlib/<mod>/**.scrml` sources AND the shipped `compiler/runtime/stdlib/<mod>.js` shims):**

| Escalation-server-only (10) | Why |
|---|---|
| `scrml:auth` | `Bun.password` (argon2id) |
| `scrml:crypto` | `Bun.CryptoHasher`, `Bun.password` |
| `scrml:cron` | `Bun.cron` |
| `scrml:fs` | `node:fs` |
| `scrml:process` | `process.{argv,cwd,env,exit,platform,memoryUsage}` |
| `scrml:redis` | `import { redis, RedisClient } from "bun"` — **BARE `bun`, no colon** |
| `scrml:store` | `bun:sqlite` |
| `scrml:path` | `node:path` |
| `scrml:mcp` | `node:fs` / `node:path` / `node:url` (the host surface is in the `.js` shim, not the `.scrml`) |
| `scrml:oauth` | **no host reach at all** — transmits `client_secret`; module header says SERVER-SIDE ONLY |

**Verified NOT members** against both limbs — do not "fix" these back in without re-running the
derivation: `scrml:data` (pure transforms + compile-time type-as-argument primitives; 72 of the
corpus's 116 server-only-module import sites and it ships a real client implementation) and
`scrml:http` (fetch wrappers; `fetch` is browser-native and the module takes no credential of its
own). **A hand-maintained derived list rots silently** — that is the `docs/FACTS.md` lesson, and it
is why the two membership limbs are recorded next to the list in the source.

**⚑ THE SAME CRITERION NOW ALSO DECIDES THE CLIENT RUNTIME CHUNK LIST (#669), AND THAT IS THE
LOAD-BEARING NEW FACT IN THIS SECTION.** A module is client-registered in
`codegen/runtime-chunks.ts:RUNTIME_CHUNK_ORDER` **iff it is NOT an escalation-server-only module
under this same two-limb criterion** (`route-inference.ts:ESCALATION_SERVER_ONLY_MODULES`).
Membership is DERIVED, not curated:

| | modules |
|---|---|
| **Client-registered (13)** | `auth` · `compiler` · `crypto` · `data` · `format` · `host` · `http` · `math` · `random` · `regex` · `router` · `test` · `time` |
| **Deliberately absent (8)** | `cron` · `fs` · `mcp` · `oauth` · `path` · `process` · `redis` · `store` — each carries a one-line reason AT the absent block in `runtime-chunks.ts` |

**`auth` and `crypto` fail the criterion yet carry a chunk. That is PRE-EXISTING (S95 Bug 18) and
was left alone DELIBERATELY** — removing a chunk is a behaviour removal, out of scope for the
dispatch that added the rest of the list. Do not "correct" it as an inconsistency without treating
it as its own change.

**Before #669 only FOUR of these had chunks**, so a client-side `import` from any of the other
seventeen compiled clean, emitted a shim nothing loaded, and threw `TypeError` at bundle load with
**zero diagnostics**. Measured matrix at the fix: base 4 execute → tip **13 execute / 8 refused
loudly with `E-STDLIB-CLIENT-CHUNK-MISSING` / 0 silent**. `path` deserves its own note: the shim
loader **strips DEFAULT imports**, and `path`'s shim is `import nodePath from "node:path"`, so even
if it passed the host-reach limb every export would `ReferenceError`.

## Section audit (dependencies.map.md, pre-f92d1a8fb → this file)
| old section | disposition |
|---|---|
| dated `S4xx — … DELTA` / `ZERO DIFF FOR THIS MAP` blocks and the stacked header stamps | dropped: dated stamp blocks |
| MANIFEST SHAPE — one manifest, allowlisted | carried above as "(carried) …" (0/0 ids; anchors 0 ok/0 re-derived; flags 0) |
| Runtime Dependencies — root package.json (v0.8.0, the SOLE manifest) | now lives in dependencies.map.md "Runtime Dependencies" (re-read with installed versions) |
| Dev / Build Dependencies — root package.json | now lives in dependencies.map.md "Dev / Build Dependencies" |
| Published surface (`files` allowlist — new this window) | carried above as "(carried) …" (2/2 ids; anchors 0 ok/0 re-derived; flags 0) |
| Editor-tooling Dev Dependencies — editors/vscode/package.json | carried above as "(carried) …" (0/0 ids; anchors 0 ok/0 re-derived; flags 0) |
| CI-only External Actions (not npm deps — GitHub Actions) | carried above as "(carried) …" (3/3 ids; anchors 0 ok/0 re-derived; flags 1) |
| Runtime Engine | carried above as "(carried) …" (0/0 ids; anchors 0 ok/0 re-derived; flags 0) |
| Internal Module Graph — compiler pipeline (compiler/src/api.js is the spine) | carried above as "(carried) …" (233/238 ids; anchors 0 ok/30 re-derived; flags 0) |
| `ifRaw` / `ifCond` — ONE attribute, FIVE consumers, TWO native mirrors (§17.1.2, S302) | carried above as "(carried) …" (15/17 ids; anchors 0 ok/1 re-derived; flags 0) |
| §55 SYNTH-KEY RULE — FIVE COPIES, TWO RESOLUTION ORDERS, ONE OPEN DIVERGENCE (NEW section, S372) | carried above as "(carried) …" (13/13 ids; anchors 0 ok/0 re-derived; flags 0) |
| Indirect callee resolution (#284, S303) — a SECOND call graph, on purpose | carried above as "(carried) …" (13/13 ids; anchors 0 ok/3 re-derived; flags 0) |
| Module-init vs the soft-nav rehydrator — WHO emits what, and what re-runs on a nav | carried above as "(carried) …" (25/25 ids; anchors 0 ok/5 re-derived; flags 0) |
| Runtime-chunk gating — the tree-shake locus (READ BEFORE FIXING A BUNDLE ReferenceError) | carried above as "(carried) …" (14/14 ids; anchors 0 ok/4 re-derived; flags 0) |
| Coordinate space — SOURCE vs DIST (D-4, S296). The class, not just the bug. | carried above as "(carried) …" (6/6 ids; anchors 0 ok/0 re-derived; flags 0) |
| §14.8.11 DB-authoritative tier — the `scrml db-migrate` command graph | carried above as "(carried) …" (8/8 ids; anchors 0 ok/0 re-derived; flags 0) |
| Internal Module Graph — supporting layers | carried above as "(carried) …" (59/61 ids; anchors 0 ok/0 re-derived; flags 0) |
| THE `~` DIAGNOSTIC SINK — a THREE-MODULE cycle-free seam (NEW section, S397, #832) | carried above as "(carried) …" (9/10 ids; anchors 0 ok/0 re-derived; flags 0) |
| `escalationReasons` — the placement value that crosses the RI -> codegen seam (NEW section, S299) | carried above as "(carried) …" (5/5 ids; anchors 0 ok/0 re-derived; flags 0) |
| Colorless-async (Seam-A / Phase-2 combinators, GITI-037/GITI-038) — TWO new destinations this window | carried above as "(carried) …" (10/10 ids; anchors 0 ok/1 re-derived; flags 0) |
| Defense-in-depth: stdlib async classification (api.js STDLIB-EXPORT-SEED) | carried above as "(carried) …" (2/2 ids; anchors 0 ok/2 re-derived; flags 0) |
| stdlib module pairing (compiler/runtime/stdlib/*.js <-> stdlib/*/index.scrml) | carried above as "(carried) …" (3/3 ids; anchors 0 ok/0 re-derived; flags 0) |
| Tags | replaced by the new footer |
| Links | replaced by the new footer |

## Tags
#scrml #map #dependencies #packages #module-graph

## Links
- [primary.map.md](./primary.map.md)
- [structure.map.md](./structure.map.md)
- [bootstrap.map.md](./bootstrap.map.md)
- [master-list.md](../../master-list.md)
- [pa.md](../../pa.md)
