# progress — s477-boot-kind-tool

- started at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-ae74bcc691a0b9416 (base 709f53429 == origin/main)
- maps read: primary.map.md (stamp f92d1a8fb) + bootstrap.map.md + the Bootstrap routing rows. Load-bearing:
  the B1 rule (a new Core variant needs an arm in every total match — walk/measure/print/check), the
  `SQuery` suspension pattern (analyze `serverSuspendKind`, lower `suspendStmts`), print-server.scrml's
  `printServer` shape (reused for the tool module), and the scrml-boot `compileSource`/`compileFile` split.

## Governing sentences (quoted before each meaning / acceptance change)

### §64 — the kind (analyze `kindAttrDiag`, nested `kind=`)
> "The vocabulary is `"tool" | "service"` (closed vocabulary, mirroring §23.5.3); other values → `E-TOOL-002`.
> `kind=` on a NESTED `<program>` → `E-TOOL-002` (§43 infers nested kinds)."

`kind="service"` (§68, DRAFT): refused by name, **INTERIM** (E-BOOTSTRAP-UNSUPPORTED naming
`g-boot-kind-service-unbuilt-s473`) — the brief puts §68 outside this lane.

### §64.1 — the emit (print-server.scrml `printTool`)
> "A `kind="tool"` top-level program emits a plain ES module: NO html, NO client.js bundle, NO CSRF
> scaffold. The module contains the file's logic (fn/const/type declarations), its `_{}` foreign blocks
> (via `lang=`), its `?{}` db calls (via `db=` + §44), and the `main()` invocation harness (§64.3). It is
> runnable directly (`bun <emitted>.js <args…>`)."
> "A tool with NO `serve=` emits NO HTTP-web server routes"

The module imports the bootstrap's server runtime (`./scrml-server-runtime.js`, written beside it) — the
bootstrap has no inlined-helper tool emit, so E-TOOL-005 (the helper-coverage boundary of impl#1's
inlining emit) has no trigger here: every helper the module calls is in the runtime it ships with.

### §64.2 — the entry (analyze `toolBodyDiags`, `mainShapeDiags`)
> "A `kind="tool"` program SHALL declare exactly one top-level entry `function main`. Its parameter is the
> argv slice (`string[]`); its return type governs the process lifecycle (§64.3). A `kind="tool"` program
> with NO `main` → `E-TOOL-001`."
> "A `fn main` in a `kind="tool"` program is `E-TOOL-004` (steer to `function main`)."
> "The tool body is an admitted bare-`_{}` context."

SPEC SILENT (searched §64.2, §64.3, §64.6, §34 E-TOOL rows): a `main` with two parameters, a parameter
that is not `string[]`, a return type other than numeric, a failable (`!`) `main`. Each is refused by name,
**INTERIM** (E-BOOTSTRAP-UNSUPPORTED "… the bootstrap refuses it (INTERIM)"). **Ruling owed**: what each
means (or which E-TOOL code it is). A `main` with NO parameter is admitted (argv not passed).

### §64.3 — the harness (printTool)
> "`function main(args: string[]): number` (declares a numeric return) → exit-harness:
> `const code = await main(process.argv.slice(2)); process.exit(code);` … `function main(args: string[])`
> (NO declared return) → invoke-only harness: `await main(process.argv.slice(2));` — and then NOTHING. The
> harness does NOT call `process.exit`." "Both arms `await main(...)`".

"declares a numeric return": `-> number` and `-> int` both select the exit-harness.

**SPEC contradiction (ruling owed)**: §64.2 / §64.3 / §34 E-TOOL-001 spell the return type `): number`,
but §14 (SPEC.md:8871) says "`->` is the sole return-type annotation syntax for `function` and `fn`
declarations." The bootstrap follows the explicit normative "sole" sentence (`-> number`); a `): number`
is a parse error there, as it is for every other function. Consequence: the 9 corpus tool cases written
`): number` (print/tool-println-clean-stdout, server-fn/session-value-in-tool-neg,
sql/prepare-tool-in-block-e-sql-006-neg, six foreign/*-in-block / slice cases) move from UNSUPPORTED
(masked by the `kind=` refusal) to FAIL parse-reject. The new `conformance/cases/tool/` cases are written
in the ruled spelling.

### §64.4 — UI in a tool (toolBodyDiags `toolItemWhy`)
> "`<page>` children, markup body content, or client-reactive UI state inside a `kind="tool"` program →
> `E-TOOL-003` (a hard error, never silently dropped). The tool body is logic + `fn`/`function`/`type`
> declarations + `_{}` + `?{}` + `main`."

A §66 declaration item (`let <n:int=0/>`, a component) is "client-reactive UI state" → E-TOOL-003.

### §64.5 / §64.5.1 — composition and imports (placement; programStub / programShapeDiags)
> "`kind="tool"` + `db=` + W5b lowers `?{}` identically to a `<program db>` web app; only the emit shape
> differs." "the tool is an in-process monolith with no client boundary, so it runs the SQL directly."
> "A tool may import only an IMPORTABLE local `.scrml` module — a §21.5 library-shaped file
> (exports-bearing, no top-level `<program>` / page markup) … A tool importing a page-shaped / no-export
> `.scrml` is `E-TOOL-006`"

Every `function` of a tool is server-placed (analyze `FnFacts.tool` → `serverTriggered`), so `main` and
its callees run in place (§13.4) and `?{}` is the same Core Query the server artifact prints. A library
import is LINKED into the one module (the bootstrap links a program's files into one Core), which is the
§64.5.1 behaviour minus the separate `<base>.js` file — recorded as a residue (below).

### §64.6 / §64.9 — `serve=` (analyze `serveAttrDiag`)
> "`E-TOOL-SERVE-MISPLACED` | `serve=` on a non-`kind="tool"` top-level `<program>` … OR `serve=` on a
> nested `<program>`" · "`E-TOOL-SERVE-PORT-INVALID` | `serve=` value is neither an integer literal
> (`serve=7878`, 0–65535; 0 = ephemeral) nor a `${expr}` runtime port"

A well-formed `serve=` on a tool asks for the §64.9 serve-harness, not built: **INTERIM** refusal by name
(`g-boot-tool-serve-unbuilt-s477`, new). E-TOOL-SERVE-AUTH-UNSUPPORTED / -MAIN-EXITS / E-TOOL-ROUTE-
NEEDS-SERVE ride on the serve-harness (and on `<endpoint>` / SSE routes, which the bootstrap does not
build) — the same residue gap.

### §23.2.4 / §23.2.4a / §23.2.3 — the tool-body foreign block (analyze `resolveForeignAt`,
`SuspendK.SForeign`; lower `foreignAt`; Core `Expr.Foreign`; check C-F1; runtime `foreignSeal`)
> §23.2.4 form 3: "a bare non-value-returning `_{}` (as well as the inline value-returning form) in the
> body of a top-level `function` — including `main` — of a `kind="tool"` program (§64)."
> §23.2.3 CG: "evaluates the verbatim slice as an async function in a SEALED scope whose parameters are
> the `in:{}` names (no free lexical capture), called with the same-named enclosing values + a
> codegen-injected boundary `await` … server-only"
> §23.2.4a: "The slice is built ONCE per distinct slice, not on every evaluation of the block." · "A
> settled `null`/`undefined` OUT arrives as scrml `not` (§42.9)" · the single-expression vs
> multi-statement discrimination · E-FOREIGN-006 (crossing shadow) · E-FOREIGN-007 (unbuildable slice).

The slice's shape, E-FOREIGN-006 and E-FOREIGN-007 are decided by impl#1's parser-token scans
(`compiler/src/codegen/foreign-seal.ts`, imported read-only by `slice-m1/tool-slices.js`) — the proven
path: a hand scanner misreads regex literals (s456). The bootstrap front end has no JS reader, so this
runs in the driver (scrml-boot `compileTool`, and bootstrap-conformance.ts). A value block in a WEB
APPLICATION's server function stays refused by name (`g-boot-foreign-block-emission-unbuilt-s473`,
narrowed to that locus).

## Units
1. analyze — kind / serve / tool body / main shape / E-TOOL-006 / tool placement / SForeign.
2. Core `Expr.Foreign` + `ForeignSlice` + `CoreProgram.tool` (`CoreTool`); walk / measure / check (C-F1) /
   print arms; lower `foreignAt`.
3. print-server.scrml `printTool` + `toolSlices`; js.scrml `JText` (a template literal string).
4. server-runtime.js `foreignSeal`.
5. driver: slice-m1/tool-slices.js; scripts/scrml-boot.ts `compileTool` (+ dev refuses a tool);
   scripts/bootstrap-conformance.ts runs a tool's stdout half and its slice checks.
6. tests: slice-m4/kind-tool-s477.test.js (27); foreign-blocks-s473 / program-shape updated.
7. conformance: conformance/cases/tool/ (11 cases; all PASS on impl#1 and on the bootstrap).
8. samples: samples/{echo-args,line-count,notes-db}.scrml — compiled and RUN by the test.

## Residue (new gaps)
- `g-boot-tool-serve-unbuilt-s477` — §64.9 serve-harness (+ the three serve-only codes, E-TOOL-ROUTE-NEEDS-SERVE).
- `g-boot-tool-data-root-s477` — folded into the existing `g-boot-server-runtime-data-root-s473` instead
  (the tool resolves a SQLite path against the recorded source root; `SCRML_DATA_DIR` not read — §47.14).
- `g-boot-tool-library-module-s477` — §64.5.1 "REAL ES `import` statements … `<base>.js`": the bootstrap
  links the library into the tool module instead (same behaviour, one file).
- `g-spec-tool-colon-return-s477` — the §64 `): number` vs §14 "`->` is the sole" contradiction (ruling owed).

## Measured (before the unit commit)
- slice-m1 167/0 (both `SLICE_CORE` modes) · slice-m2 619/0 · slice-m3 60/0 · slice-codec 166/0 ·
  slice-m4 5646 pass / 0 fail / 113 skip (kind-tool-s477: 27) · e2e-render-map 259/0 · lint-no-default-arm 0 ·
  lint-duplicate-fn 0 · spec-coverage-check 0 violations · state.ts --check parses (counts stale: bot-owned).
- conformance/cases/tool/ (11): PASS on impl#1 (conformance/run.ts) and on the bootstrap.
- Bootstrap conformance (`bun scripts/bootstrap-conformance.ts`), vs docs/bootstrap-conformance.md @ f92d1a8fb:
  attempted 1827 → 1838 (+11 new cases) · PASS 302 → 313 (+11) · FAIL 243 → 252 (+9) ·
  UNSUPPORTED 658 → 649 (−9) · NOT-TWINNED 624 = · CRASH 0 · INVALID 0 · runtime half executed 109 → 112.
  The +9 FAIL are the nine legacy `): number` tool cases (UNSUPPORTED behind the old `kind=` refusal,
  now FAIL parse-reject — g-spec-tool-colon-return-s477). No other case moved.
