# test.map.md
# project: scrml
# updated: 2026-11-08T16:47:39Z  commit: f92d1a8fb
# File counts are `git ls-files … | grep .test.` at f92d1a8fb. Suites were NOT re-run for this map, except the bootstrap conformance probe (figures in bootstrap.map.md).

## Test Framework
Runner: bun test (bun >=1.3.13; CI pins 1.4.3). Playwright@1.60.0 for e2e/. happy-dom@20.8.9 for DOM. puppeteer@24.40.0 for Chromium oracles.
Config: bunfig.toml — [test].root = compiler/tests/, preload compiler/tests/helpers/tmp-root-preload.js (per-run TMPDIR under ~/.cache/scrml-test-tmp/). Per-test budget is bun's default 5000 ms; long tests declare `{ timeout }` at the site.
Run all (impl#1): `bun test` (runs `pretest` first: merge driver + scripts/compile-test-samples.sh)
Run single: `bun test compiler/tests/unit/<file>.test.js`
Run bootstrap: see bootstrap.map.md "Tests" (the slice dirs are outside the bunfig root; `bun test ./compiler/self-host-v2/slice-m4/`)
Conformance (both impls): `bun conformance/run.ts` / compiler/tests/conformance/*; bootstrap grading: `bun scripts/bootstrap-conformance.ts`

## Test Categories (compiler/tests, 1,872 test files)
Unit: compiler/tests/unit/**/*.test.js — 1,227 (CI `unit` job, 3 shards, together with conformance)
Integration: compiler/tests/integration/** — 306 (CI `integration`, 3 shards, with lsp + commands; needs pretest fixtures). Packs: security-await-pack/, security-failable-pack/ (shapes/, known-fail.js `KNOWN_FAIL`)
Browser: compiler/tests/browser/** — 145 (CI `browser`; gated by scripts/browser-baseline.ts failure NAME-SET)
Conformance wrappers: compiler/tests/conformance/** — 137
Commands: compiler/tests/commands/** — 32; LSP: compiler/tests/lsp/** — 12
e2e-render-map: compiler/tests/e2e-render-map/ — 2 test files (CI `slices` + windows; not in the hook globs)
Parser conformance: compiler/tests/parser-conformance-*.test.js (top level) + parser-conformance/ fixtures
Types baseline: compiler/tests/TYPES-BASELINE.json (scripts/types-gate.ts)
S475 additions: unit/ci-postgres-live-pipefail-s475, unit/ci-pr-base-s475, unit/scrml-boot-write-outputs-s475; helpers/actions-shell.js

## Bootstrap suites (compiler/self-host-v2)
slice-m1: 11 · slice-m2: 12 · slice-m3: 5 · slice-m4: 164 · slice-codec: 2 test files; acceptance/: 285 cases in 27 categories (graded by slice-m4/acceptance.test.js `STATUS`).
S475 added slice-m1/request.{core,runtime}.test.js and 35 slice-m4 `*-s475.test.js` (request-*, pending-cells, lifecycle-*, pg-envelope, sql-error-pg, statement-savepoint{,-pg}, pg-key-columns, namespace-import{,-chromium}, local-tape-edits, literal-carriers, transport-every-client-bang, caller-transport, nonbang-callee-envelope, value-if-object-arm, struct-context-valueif-followups{,-r1}, partial-followups{,-r1}, handled-landing-check{,-r1}, optgroup-narrow, parser-residue, failable-arm-qualifier, tx-connection-guards, unmatched-failure-tag, w-match-001-failing, boot-small-gaps2, boot-file-scope-own-value, request-id-unreferenceable, scrml-boot-output-hardening).
Live Postgres: pg-*-s475 tests need SCRML_TEST_PG_URL (CI `postgres-live` sets it + SCRML_TEST_PG_REAL=1); `SCRML_PGTEST=0` skips.

## Conformance corpus
conformance/cases/<category>/<case-id>/{case.scrml, expected.json[, aux *.scrml]} — 65 categories, 1,827 cases. expected.json: id, description, language-version, spec, source-test, rationale, expect {codes, notCodes, severity, runtime…}.
Adapters: conformance/adapters/impl1-ts.ts, hybrid.ts. driver.ts = the 8-verb input vocabulary; fake-clock.ts; normalize.ts (DOM normalization).

## E2E
e2e/tests/*.spec.ts — 6 specs (02-counter, 03-contact-book, 05-multi-step-form, 14-mario, docs-website, todomvc); e2e/fixtures/dev-server-fixture.ts.

## Fixtures & Factories
compiler/tests/fixtures/ — scrml inputs (chunk-namespacing/, promote-multi-file-app/, semdiff/, native-lift-*.scrml, …)
compiler/tests/helpers/ — tmp-root-preload.js, per-run-tmp.js, chunk-scope.js (`unwrapChunkScope`), host-view.js, mount-isolation.js, native-ast.js, raw-http-get.js, md-render.js, mcp-sidecar-compile.js, actions-shell.js, expr.ts, …
compiler/tests/unit/fixtures/spec-coverage/ — fixture docs for spec-coverage-check tests
samples/compilation-tests/ — compiled by pretest into */dist for integration/browser tests
compiler/self-host-v2/slice-m4/{harness.js, fixtures.js, diag-diff.js, grant-scan.js, server-artifact-harness.js, src/}; slice-m1/harness.js, load-program.js, cores.js; slice-m2/harness.js `loadM2()`

## Pattern
Tests import `describe/test/expect` from "bun:test". impl#1 tests typically write a .scrml source into a tmpdir, call `compileScrml` from compiler/src/api.js, then assert on emitted diagnostics codes, emitted JS text, or (with @happy-dom/global-registrator) the runtime DOM after events. Bootstrap tests load the bundled bootstrap through the slice harnesses, compile a source string, and assert exact diagnostic code sets (diag-diff.js) or run the printed program in happy-dom. Test files are named by topic with a session suffix (`-sNNN`). Cases graded across implementations go in conformance/cases, not in a unit test.

---

# Carried detail (pre-f92d1a8fb body sections)
The sections below are the previous map generation's body (mostly impl#1, `compiler/src`), carried rather than lost. They were NOT re-read line by line. Each carries a verification line from f92d1a8fb: code identifiers checked to exist, `symbol` :line anchors re-derived by grep, cited paths checked, cited gaps whose marker is no longer `open`, and STALE-RISK flags for the CI/bot facts that changed in S468–S475. Where a carried section disagrees with a refreshed section above, the refreshed section wins.

## (carried) THE CONFORMANCE `expect` VOCABULARY IS NOW A DECLARED TABLE (NEW #652, `conformance/run.ts:179`)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 10/10 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

Before this window the `expect` block's key set was implicit — a typo'd container name was silently ignored and the case passed while asserting nothing. `EXPECT_SHAPES` makes the whole vocabulary enumerable and `validateExpectContainers(ex)` refuses anything outside it, naming the known keys in the diagnostic.

| key | kind | empty | half |
|---|---|---|---|
| `codes` | stringArray | — | (a) codes |
| `notCodes` | stringArray | — | (a) codes |
| `notCodePrefixes` | stringArray | — | (a) codes |
| `severity` | record, values `error`/`warning`/`info` | **reject** | (a) codes |
| `codeCounts` | record | **reject** | (a) codes |
| `input` | objectArray | — | (b) runtime |
| `dom` | string | — | (b) runtime |
| `domAnchored` | objectArray | — | (b) runtime |
| `state` | record | **reject** | (b) runtime |
| `serverStub` | record | **allow** | (b) runtime — a MOCK TABLE, not an assertion |
| `serverDb` | record | **allow** | (b) runtime — a SEED, not an assertion |
| `sqlEngine` | enum `stub` \| `real` | — | (b) runtime |
| `ssr` | boolean | — | (b) runtime |
| `firstPaint` | record | **reject** | (b) runtime |
| `stdout` | string | — | (b) runtime |

**The `empty` column is the load-bearing one.** An empty `{}` is REJECTED for every container that is an ASSERTION (`severity`, `codeCounts`, `state`, `firstPaint`) — an empty assertion asserts nothing and reads green. It is ALLOWED only for `serverStub` and `serverDb`, which are inputs (a mock table and a seed), where empty is a meaningful value.

**`validateExpectContainers` is EXPORTED and is driven directly by `compiler/tests/conformance/expect-container-policy.test.js`** (NEW, 316 lines). The reason is written at the export site and is the window's generalisable rule: *a validator that can only be reached by running the whole corpus is indistinguishable from one that never fires.* Called from the case runner at `run.ts:418`.

⚠ **Related, and it is the standing trap when auditing conformance coverage: a grep-match for an E-code inside a case directory is NOT proof the case asserts it.** The hit may be rationale PROSE. Read the `expected.json` and confirm the code appears in a `codes` / `notCodes` container before recording "already covered".

## (carried) INSTRUMENT INTEGRITY — the `bracketed !== parsed` refusal (NEW #646/#652)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 5/5 code identifiers found in source; symbol line anchors: 0 confirmed, 5 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

**Five gates were reporting green while measuring nothing** (#646). The fix pattern is worth copying into any new probe that parses a population out of a text file:

- `scripts/delta-lint.ts` (NEW this window) counts `[NNNN]`-bracketed lines in the live scope and separately counts regex matches. **`refuseUnparsedEntries()` / `refuseDegenerateScope()` exit 2 if the two disagree, or if the scope is empty.**
- `scripts/state.ts` gained the same guard — `refuseUnparsedDeltaEntries()` (`:1050`), called from `runWrite` (`:616`), `runCheck` (`:699`) and `runDigest` (`:1146`); `parseDeltaLog` (`:1000`) returns `bracketed`, `unparsed` and `scopeStart` so the diagnostic can print REAL file line numbers.
- **Exit codes are partitioned on purpose: 1 = "the log is wrong", 2 = "the instrument is broken".** Neither is reachable as a PASS.
- **What made it necessary:** the shared entry shape was `[NNNN] <kind> · <body>` (three tokens) while the writing convention had drifted to `[NNNN] <emoji> <kind> · <body>` (four). The narrow regex could not parse the four-token form, so four live entries (`[561] [562] [565] [727]`) were invisible to the gate AND to the digest. The regex now carries an OPTIONAL marker token (`delta-lint.ts:72`).
- **Pre-existing debt is BASELINED, not enforced** — `handOffs/delta-log-dupes.baseline.json` carries nine known collisions so the gate is not instantly red for reasons no change caused; only a NEW duplicate fails. The baseline may shrink and must never grow silently.
- **The companion is `.gitattributes` `merge=union` on the delta log.** It trades a merge conflict for a duplicate, which is only the right trade because this gate is loud about duplicates. **The two land together; neither is sufficient alone.**
- **Deliberately NOT a monotonicity check** — under union-merge two sessions' entries interleave by content, not by number. Enforcing order would fail every honest concurrent merge.

## (carried) WHICH RUNTIME EACH TIER ACTUALLY EXECUTES — read this before believing a green runtime half
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 8/8 code identifiers found in source; symbol line anchors: 0 confirmed, 5 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

⚑ **NEW S371-bryan, PA-MEASURED AT THIS WATERMARK. EXECUTING `SCRML_RUNTIME` IS NOT TESTING WHAT
SHIPS.**

There are TWO different runtime artifacts and they are not interchangeable:

| artifact | what it is | who loads it |
|---|---|---|
| `SCRML_RUNTIME` (`compiler/src/runtime-template.js:547`) | the MONOLITHIC template string — every chunk, always | **nothing in production** |
| `scrml-runtime.<hash>.js` | the PRUNED per-app assembly — `assembleRuntime(chunkNames)` (`codegen/runtime-chunks.ts:541`) over `RUNTIME_CHUNKS` (`:542`), chunk set chosen by `detectRuntimeChunks` (`codegen/emit-client.ts:828`) | **the browser, always** |

**Tier-by-tier, measured (not inferred):**

| tier | what it executes | can it catch a chunk-pruning defect? |
|---|---|---|
| **conformance (b) half** — `conformance/adapters/impl1-ts.ts:467` and `:924` | `"(function () {\n" + SCRML_RUNTIME + "\n" + clientJs + …` — the FULL monolith | **NO. All 883 cases, by construction.** |
| **browser tier** — 94 files in `compiler/tests/browser/` | **SPLIT: 25 import `SCRML_RUNTIME`; 66 read `result.runtimeFilename` (the emitted pruned artifact); 2 do both; 5 neither** | **only the 66** |

**THE PROOF IS A SHIPPED CONFORMANCE CASE, NOT A HYPOTHETICAL.**
`conformance/cases/each/ternary-markup-giti033` compiles exit 0 and PASSES its own suite. Its
`page.client.js` contains BARE calls to `_scrml_each_clear` (`:2831`, `:101`, `:159`) and
`_scrml_resolve_item` (`:2879`, `:54`, `:66`, …) — both defined in the **`reconciliation`** chunk,
which is **not in the emitted runtime** for that file. First each render → `ReferenceError` → dead
page. Reproduced by compiling the case standalone and diffing the client's `_scrml_*` reference set
against the emitted runtime.

⚑ **A SYMBOL DIFF ALONE OVER-REPORTS — READ THE CALL SITE.** Two further symbols are also absent from
the pruned runtime, `_scrml_register_rehydrator` (`:3193`) and `_scrml_chunk_loading` (`:3489`, both
`utilities`), **and both are `typeof`-guarded at their call sites, so they are HARMLESS.** Only the
two BARE-CALL `reconciliation` symbols kill the page. A probe that counts unresolved names without
reading the call site reports 4 defects where there is 1.

**HOW TO ACTUALLY VERIFY A CLIENT-RUNTIME FEATURE** (the S265 theme-switch lesson, extended):
1. Compile the target to a real `dist/`.
2. Execute **the emitted `scrml-runtime.<hash>.js`**, not the template.
3. Assert on observed DOM/behaviour, not on the presence of a marker in emitted text.

**And when you write the claim down, name which runtime you ran.** "The runtime executed it" is not
a result — it is ambiguous between the two artifacts above, and the ambiguity has already shipped a
dead page past a green suite. primary.map.md invariant 67.

## (carried) THE BROWSER TIER IS NOW GATED — and the mechanism generalizes
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 2/2 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. STALE-RISK: describes CI `gate`: since S468–S475 `gate` is an aggregator over checks/unit/integration/browser/slices/host-global/windows/postgres-live (build.map.md "CI/CD Pipeline")._

**Read this before adding a tier to a gate, or before "fixing" a browser test.**

`compiler/tests/browser` carries a DOCUMENTED FAILURE BASELINE and always exits 1. The consequence
was not "we lose browser coverage" — it was worse and two-sided:
1. **A real regression was invisible**, because a tier that always fails is indistinguishable from a
   tier that has REGRESSED. That is `pa-base` §8's "a gate that has never failed is
   indistinguishable from a gate that CANNOT fail", in its purest form.
2. **A failed step HALTS the job**, so every `tracking` step AFTER the browser step was skipped.
   Verified, not assumed: on run `30742472551` the `Within-node parser-parity + canary` step reports
   `skipped` and had therefore **never run at all** — the S302 gate-hole class recurring one job over.

**The fix is to gate on the WRONG THING LESS.** `scripts/browser-baseline.ts --check` asserts the
failure **NAME SET**: exit 0 while unchanged, exit 1 the moment a name joins or leaves it. It is now
a step in BOTH the blocking `gate` and `tracking`.

- **Key = `<suite> > <test name>` and nothing else.** Timings, pass/fail COUNTS, file paths and
  bun's file ordering are deliberately stripped — each would flap red for reasons no commit caused,
  and a count moving is not information about WHICH test moved.
- **BIDIRECTIONAL.** A name JOINING is a regression. **A name LEAVING means the baseline is STALE —
  prune it in the same commit that fixes the test.** A baseline nobody prunes silently re-acquires
  the blind spot it was built to remove.
- **Baseline artifact:** `compiler/tests/browser/FAILURE-BASELINE.json` — 48 failure names + 2
  `envExcluded` entries, `recordedAt` 2026-08-02, `@generated` by `--write`.
- **Do NOT record a new baseline to make a red check green.** `--write` is for a landing that
  legitimately moves the set, in the same commit.
- **Scope is the browser tier only.** lsp / commands / self-host carry their own undocumented
  baselines and have NO name-set assertion — `g-lsp-commands-selfhost-tiers-have-no-failure-name-set-assertion`
  (LOW). Extending the shape is mechanical.
- **Deliberately NOT in pre-push.** Local environments vary far more than CI, and it was exactly a
  local environment difference that made the first recorded baseline wrong.

**The two ORIGINAL gate-topology failure modes still stand** (build.map.md has the long form):
a tier that NOTHING blocking runs is where a regression hides (the 14 root-level files, fixed S302);
a blocking tier pointed at a tree with a documented failure baseline is structurally unpassable and
gets bypassed then deleted (pre-push, fixed S301). **The name-set shape is what reconciles them.**

## (carried) Coverage shapes worth knowing before writing a test here
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 4/4 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

**A grep-hit is not an assertion — and this now has a machine oracle.** A conformance case may
MENTION an E-code in `description`/`rationale` prose without asserting it; `notCodes` asserts ABSENCE
and does not prove the code can fire. **Only `expect.codes` is a positive pin**, and
`bun scripts/s34-census.ts --full` computes the pinned set that way (**343 PINNED at this watermark — this line read `338` and was stale; `--full` and the plain census return the SAME number, so the two modes have never disagreed**). Read
the `expected.json` before recording a code as covered.

**A §34 row is not evidence of a fire site, and now neither is an emitter string.** Two live shapes:
`E-CHANNEL-INSIDE-PAGE` was cataloged and never wired (S301); `E-MW-006` has a `code:` push that the
guarded shape cannot reach — **middleware is dropped silently** (ss63). Execute, or trace the caller.

**A RUNTIME-SURFACED code has no diagnostic to assert.** Three codes (`E-PARSEVARIANT-*`) are
implemented as a runtime enum VALUE, not a diagnostic push, so they appear in zero emitters while
being fully built. They were written up as the pre-freeze arc's sharpest false-claim case before the
runtime was checked. **Verify the runtime, not `result.errors`.**

**A runtime-only diagnostic cannot be asserted from `result.errors`.** `W-NAV-CHUNK-LOAD-FAILED` is
emitted by `runtime-template.js` inside the GENERATED app. Browser + conformance are its only coverage.

**Lint diagnostics are a THIRD stream.** `W-LINT-*` and the three `*-TAILWIND-*` codes return into
`lintDiagnostics[]` (the ghost-error lint pre-pass in `api.js`), not `errors[]`.

**Warning-partitioned codes need BOTH streams.** `W-`/`I-` codes with `severity:"info"|"warning"`
route to `result.warnings`; everything else to `result.errors`. `result.errors.filter(...)` alone is
the classic false-green.

**Emitted-text assertions are not execution proof — the trap has FOUR recorded occurrences now.**
S265 theme-switch, S268 component-root, GH #234, and **S307's `<engine>` audit port**, where the
registration emitted correctly and the log stayed empty because the raw cell name resolved in the
wrong chunk key space. **Only executing a transition caught it; grepping the bundle for the
registration passes either way.** Execute the bundle.

**An auto-GENERATED test artifact must not be able to report a false green.** §51.13's generator used
to emit `test("no qualifying machines", () => expect(true).toBe(true))` for an empty run — a passing
assertion verifying nothing, landing in an ADOPTER's suite as a green tick, and firing precisely for
the canonical modern `<engine>` state-child form. It is now `test.skip(...)` naming why. When you add
a generated-test path, make the empty case SKIP, never PASS.

**A structural-`if=` POSITIVE case is deliberately DOM-indistinguishable from no-`if=` at all.**
`if=true` MUST render exactly what an ungated element renders — that non-perturbation *is* the claim.
Discrimination comes from (a) the `codes` half (`notCodes: ["E-DG-002"]`) and (b) the `-absent-rt`
companion. **Write structural-gate cases in mounts/absent PAIRS with a `notCodes` on the positive
one**, or the positive case proves nothing.

**A gated `<engine>` case must exercise a transition WHILE the gate is false.** `if-on-engine-render-gate-mounts-rt`
has LOAD-BEARING input order: transition first, reveal second. An implementation that gated the
engine's CONSTRUCTION renders the `initial=` arm, and only that order catches it.

**A `-rt` suffix means the case EXECUTES** (`input` + `state` + `domAnchored` in `expected.json`).
A compile-only case cannot see a mount/unmount, hydration or teardown defect.

**A route-lifecycle test must exercise a NAVIGATION, not a mount.** The §20.8.8 contract's edges are
route-leave/route-enter, and the two are wired to nothing today. The verification the impl owes is
recorded in `docs/changes/route-region-teardown/SCOPING.md`; the single most important item there is
the NEGATIVE one — **a `<timer>` in the SHELL must SURVIVE navigation**, because the fix necessarily
touches where timers are CREATED and a misclassified shell timer silently killed by a nav is a worse
failure than the leak it closes.

**A migration/codemod test must assert the FAIL-CLOSED branch.** `scrml migrate`'s §51.9 projection
rewrite leaves the whole declaration untouched on any unparseable body line, because half-migrating a
projection silently drops mappings. Fixtures live in
`compiler/tests/commands/migrate-program-shape-fixtures/`.

**A re-parse that SWALLOWS sub-errors needs its own positive test, not just the happy path (NEW,
#396).** `ast-builder.js`'s `export` re-parse used to suppress every sub-error from its inner parse —
a top-level `E-FN-EQUALS-BODY` test would NOT have caught the exported form silently compiling to an
empty function. The fix's test coverage therefore pins BOTH shapes (top-level decl-body AND `export`)
at each of the four+one call sites, not one representative site — a lesson worth generalizing to any
future fix at a re-parse boundary.

**A choke-point CONSOLIDATION needs a regression pin proving the OLD bug classes stay fixed, not just
the new shape (#405).** `conf-CTRL-fnbody-autoawait-choke-point.test.js` exercises the unified
`injectFnBodyServerCallAwaits` across if/for/while AND `given`/match-block/`try` bodies in one file —
retiring `injectPromiseAwait` without this coverage would have re-opened `g-hash87-member-read-await-
misparen`-class regressions silently, since the retired function's bare-prefix mis-paren and its
scope-fencing were two INDEPENDENT defects a narrower test could miss one of.

**A reset-init-thunk fix needs an RT case proving `reset()` actually restores the DECLARED value, not
just that the fix compiles (#417).** `reactive/reset-init-after-assignment-rt` and its `-in-if`
sibling assert the EXECUTED post-`reset()` value (0), not merely the absence of a diagnostic — a
compile-only case cannot distinguish "clobbers the thunk" from "doesn't".

## (carried) §14.8.11 DB-authoritative tier — live-Postgres skip-graceful pattern
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 0/0 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

The three integration tests (`db-authoritative-pg`, `db-authoritative-p2-pg`, `db-migrate-pg`) and
the M1/P2 conformance pair run the ACTUAL negative test against a real Postgres — the ONLY proof that
separates real DB enforcement from an egress-JS-shaped gap (SPEC §14.8.11: "a half-shipped RLS 'looks
enforced and isn't' — worse than none"). They SKIP (not fail) when no live Postgres is reachable.
`schema-introspect-pg.test.js` originated the pattern. **Do not convert these to a mocked/in-memory
Postgres** — RLS/GRANT/SECURITY DEFINER behaviour is not faithfully mockable. Residual:
`g-dbauth-no-request-path-test` (MED) — the lock asserts EMISSION, not a login-over-HTTP round trip.
Related standing hazard: **session-auth full-bundle-over-HTTP conformance is cloud-runner-infra-flaky**
(passes local, fails cloud-only) — execute the shipped helper and assert wiring instead.

## (carried) Fixtures & Factories
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 0/0 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. Paths cited that do NOT exist at f92d1a8fb: `compiler/tests/parser-conformance-within-node-allowlist.json`._
compiler/tests/fixtures/ — 8 shared fixture files
compiler/tests/helpers/ — 3 shared test-helper modules
compiler/tests/browser/FAILURE-BASELINE.json — **NEW.** The browser tier's documented failure NAME
SET. `@generated`; regenerate with `bun scripts/browser-baseline.ts --write`.
compiler/tests/commands/migrate-program-shape-fixtures/ — `scrml migrate` (source-codemod, NOT
`db-migrate`) fixture set — the `<machine>` retirement codemod's regression surface.
compiler/tests/parser-conformance-within-node-allowlist.json — per-file native-vs-live divergence
allowlist. **Adding a FIELD to a structural AST node grows this if the native mirror is not paid.**
samples/compilation-tests/ — 12 fixture dirs compiled by `scripts/compile-test-samples.sh`
(`bun run pretest`) before the suite; dist/ is gitignored. **These go STALE** — a browser-test triage
starts by recompiling them, before comparing anything.
conformance/cases/ + conformance/adapters/ — the D3 corpus (**883 cases** at `c93a692c`, FLAT this window; re-derived by `find conformance/cases -name expected.json | wc -l`, which is exactly `facts.ts`'s own definition, and `docs/FACTS.md` is the authority) + per-impl adapters. **The prior window's +3 (`each/each-body-decl-unsupported-pos`, `ssr/i-ssr-each-client-rendered-subset-pos`, `derived/e-derived-server-only-reach-nested-loop`) are landed and carried.**
docs/tutorial-snippets/ + docs/readme-snippets/ + docs/website/ — the public snippet corpus; REAL
programs under a compile gate.

## (carried) Pattern
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 6/6 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
Bun's native `describe`/`test`/`expect` from `bun:test`. Files import directly from `compiler/src/*`
or `compiler/runtime/stdlib/*.js` (not through the public CLI) to unit-test internals — EXCEPT
`db-migrate-pg.test.js`/`db-authoritative-p2-pg.test.js`, which deliberately drive `runDbMigrate` /
the CLI surface (the acceptance gate is "proven THROUGH the CLI"). Naming ties a test file to its
originating bug/gap/session tag (`g-<slug>`, `ss<N>-<slug>`, `E-<CODE>-*`, `issue-<N>-<slug>`,
`i<issue#>-<slug>`, `gh<issue#>-<slug>`, `d<N>-<slug>`, `conf-<CODE>-<milestone>`) so a diagnostic
code or gap-id greps directly to its regression test. Assertions favor `toBe`/`toMatch`/`toThrow`
over mocks. A dated pattern (`<bug-slug>-YYYY-MM-DD.test.js`) is used for HIGH-severity security-fix
regressions with the root-cause narrative in a header docstring.

**Format-gated assertions.** The `esm-*.test.js` files establish the convention for the two client
module formats: assert the CLASSIC output is byte-unchanged AND assert the esm shape separately.

**DOM-shape assertions.** A top-level `<each>` renders as the comment fence
`<!--scrml-each:N-->` / `<!--/scrml-each:N-->` with rows as SIBLINGS between the anchors. An
`if=`-gated per-item root may be a `<!--scrml-if-row-->` COMMENT rather than an absent node — assert
the ELEMENT is gone, not that the child count dropped.

**A duplicate-node-id bug is invisible to every single-component test.** The S299 component-expander
defect needed TWO instantiations (or two different components) in ONE file. Anything keyed on
`node.id` — each fences, `_scrml_each_renderers`, chunk-namespace tokens — instantiate twice.

**An escalation/placement test must assert the ARTIFACT, not the diagnostic.** §12.2 Trigger 3 emits
NO code, so `result.errors`/`result.warnings` are both empty on success AND on failure. The
discriminating assertions are: does a `.server.js` exist, and is the identifier absent from the
client bundle. Copy the Trigger-3 evasion battery's shape.

**Byte-identity anti-regression.** Several landings are gated on "emits byte-identically when the
feature is not used" (the `<#`-scoped condition re-parse, the `stateChildRules` substitution, the
`serverFnPeerAliasNames` thread, D-5's client bundle, a project with no `pages/` segment under D-4).
Where that guarantee is claimed, assert it — and note one such guarantee has already been formally
RETIRED (zero-immutable-columns DB-authoritative byte-identity, S288).

**Browser-suite triage order.** Recompile `samples/compilation-tests/` fixtures FIRST (they go
stale), then compare the WHOLE suite rather than an isolated file — happy-dom global state leaks
between files, so a single-file run can be green while the suite is red, and vice versa. **Then run
`bun scripts/browser-baseline.ts` and diff NAMES**, which is the comparison a human was doing by hand —
**and READ the reason excerpt it prints beside each new name (#537): `took N ms` + `^ this test timed
out after 5000ms.` means a TIMEOUT, not an assertion failure, and the two wear the same `(fail)`
marker.**

## (carried) THE PRE-LAND GATE FOR CODEGEN — `corpus-emit-differential` (NEW #428), and it is NOT `bun test`
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 0/0 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

**If your task changes anything under `compiler/src/codegen/`, this is the gate.** It is not in
`ci.yml`, not in `bun test`, not in any git hook — it is run BY HAND, base-vs-head, before landing.
There was no routing row for this task shape before this pass and the absence cost a dispatch.

```
bun scripts/corpus-emit-differential.ts capture --compiler-root <abs checkout> \
    --label base-<sha> --work /scratch/base --manifest /scratch/base.manifest.json
bun scripts/corpus-emit-differential.ts capture --compiler-root <abs checkout> \
    --label head-<sha> --work /scratch/head --manifest /scratch/head.manifest.json
bun scripts/corpus-emit-differential.ts diff --base /scratch/base.manifest.json \
    --head /scratch/head.manifest.json [--json /scratch/diff.json]
```

Default roots `examples,samples,conformance,stdlib,benchmarks` (RECURSIVE; the 453 deliberate
exclusions are PRINTED with per-directory counts, so what is not measured is a visible decision rather
than an invisible default). Population at this HEAD: **1878 sources / 7254 artifacts.** Reported:
compile-failure delta, artifact-SET delta, artifact-CONTENT delta, syntax delta under three goggles,
and the bare-server-fn-site count. **Exit codes are three-valued and the third one is the point:**
0 = no differences; 1 = differences found; **2 = NOT A VALID COMPARISON** (different roots, an
enumeration disagreement, the same revision on both sides, differing check contexts, a
`--reuse-artifacts` manifest, or a VACUOUS run in which zero artifacts were compared). A capture NEVER
exits non-zero merely because sources failed to COMPILE — compile failure is DATA.

**Why the syntax half is a separate `node` subprocess, and why "simplifying" it re-breaks it:**
`node --check` on a bare `.js` **ACCEPTS a top-level stranded `await`** (Node resolves it by
module-syntax auto-detection and parses it as a module). **The compiler emits `<script src=…>` with NO
`type="module"`** — a CLASSIC SCRIPT, where the same bytes are a fatal SyntaxError and the whole bundle
is dead on arrival. That is the auto-await work's own dominant failure mode. **`node --check` is not
used here and must not be reintroduced.** Compounding it: **bun's `vm.Script` does not reject a
top-level `await` either**, so an in-process fix under Bun would have been a THIRD hollow gate.
`corpus-check-goggles.js` parses each artifact under BOTH goggles via `vm.Script` /
`vm.SourceTextModule` — source text and nothing else, unlike `node --check`, whose verdict is a
function of (content, extension, nearest `package.json` `"type"`), an input living OUTSIDE the artifact.
The EFFECTIVE goggle is derived from the emitted HTML's own `<script>` tag.

**The anti-pattern it exists to kill had shipped THREE times, and it reads exactly like success:** a
truncated enumeration produces no error, well-formed output, and every downstream count, ratio and
scoping decision inherits the truncation (`artifact-diff.mjs` compared 8 of 115 · `u1-corpus-emit.sh`
measured 329 of 1818 and reported "708/708 byte-identical" · that same script's `node --check` half
inherited the same population). `pa-base v2.13 §8` names it THE TRUNCATED PROBE. Every defense in the
tool is marked `HARD REQ n` at its site so a future editor can see what they would be removing.

## Section audit (test.map.md, pre-f92d1a8fb → this file)
| old section | disposition |
|---|---|
| dated `S4xx — … DELTA` / `ZERO DIFF FOR THIS MAP` blocks and the stacked header stamps | dropped: dated stamp blocks |
| Test Framework | now lives in test.map.md "Test Framework" (re-read) |
| Test Categories (compiler/tests/, ⛑ **S402: 1,435** `*.test.js` total at `499eecce`, +10 this window) | no longer true — S402 figures (1,435 files at 499eecce) and per-dir counts; now lives in test.map.md "Test Categories" (re-counted at f92d1a8fb: 1,872) |
| THE CONFORMANCE `expect` VOCABULARY IS NOW A DECLARED TABLE (NEW #652, `conformance/run.ts:179`) | carried above as "(carried) …" (10/10 ids; anchors 0 ok/0 re-derived; flags 0) |
| INSTRUMENT INTEGRITY — the `bracketed !== parsed` refusal (NEW #646/#652) | carried above as "(carried) …" (5/5 ids; anchors 0 ok/5 re-derived; flags 0) |
| WHICH RUNTIME EACH TIER ACTUALLY EXECUTES — read this before believing a green runtime half | carried above as "(carried) …" (8/8 ids; anchors 0 ok/5 re-derived; flags 0) |
| THE BROWSER TIER IS NOW GATED — and the mechanism generalizes | carried above as "(carried) …" (2/2 ids; anchors 0 ok/0 re-derived; flags 1) |
| Coverage shapes worth knowing before writing a test here | carried above as "(carried) …" (4/4 ids; anchors 0 ok/0 re-derived; flags 0) |
| §14.8.11 DB-authoritative tier — live-Postgres skip-graceful pattern | carried above as "(carried) …" (0/0 ids; anchors 0 ok/0 re-derived; flags 0) |
| Public-content + generated-artifact gates (NOT `bun test`, but CI-required) | no longer true in part — facts/SPEC-INDEX staleness now WARNS (S474 bot), browser NAME-SET runs in the `browser` job; the gate list now lives in build.map.md "CI/CD Pipeline" (checks job) and .github/CI.md |
| CI test-tier mapping (see build.map.md for the full workflow) | no longer true — describes the pre-S468 `gate`/`tracking`/`windows` split; now lives in build.map.md "CI/CD Pipeline" |
| Fixtures & Factories | carried above as "(carried) …" (0/0 ids; anchors 0 ok/0 re-derived; flags 0) |
| Pattern | carried above as "(carried) …" (6/6 ids; anchors 0 ok/0 re-derived; flags 0) |
| THE PRE-LAND GATE FOR CODEGEN — `corpus-emit-differential` (NEW #428), and it is NOT `bun test` | carried above as "(carried) …" (0/0 ids; anchors 0 ok/0 re-derived; flags 0) |
| Tags | replaced by the new footer |
| Links | replaced by the new footer |

## Tags
#scrml #map #test #bun-test #conformance #acceptance #playwright

## Links
- [primary.map.md](./primary.map.md)
- [bootstrap.map.md](./bootstrap.map.md)
- [build.map.md](./build.map.md)
- [master-list.md](../../master-list.md)
- [pa.md](../../pa.md)
