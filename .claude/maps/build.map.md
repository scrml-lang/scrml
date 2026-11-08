# build.map.md
# project: scrml
# updated: 2026-11-08T16:47:39Z  commit: f92d1a8fb
# `facts-regen.yml` no longer exists. It was deleted in S474 and replaced by `generated-regen.yml` (below).

## Development Commands (package.json scripts)
bun run compile <file|dir> — impl#1 compile (`bun run compiler/src/cli.js compile`)
bun run watch — impl#1 compile under `bun --watch`
bun run boot:compile <file.scrml> — compile with the BOOTSTRAP (scripts/scrml-boot.ts compile; see bootstrap.map.md)
bun run boot:dev <file.scrml> — bootstrap dev server (scrml-boot dev)
bun run lsp / bun run lsp:boot — impl#1 LSP / bootstrap diagnostics LSP (stdio)
bun test — the impl#1 suite under compiler/tests/ (bunfig root). `pretest` installs the merge driver and runs scripts/compile-test-samples.sh (it populates samples/compilation-tests/*/dist)
bun run test:coverage — the same with --coverage
bun run types / types:check — scripts/types-gate.ts (tsc diagnostic NAME-SET vs compiler/tests/TYPES-BASELINE.json)
bun run e2e / e2e:ui / e2e:docs / e2e:install — Playwright (e2e/playwright*.config.ts)
bun run docs:build — docs/build.ts
bun run bench — compile examples/ --verbose
bun run security — compile samples/compilation-tests and `node --check` the client JS
impl#1 CLI verbs (compiler/src/cli.js): init, compile, dev, build, serve, migrate, fix, db-migrate, promote, generate, introspect, semdiff

## Bootstrap / generated-file tools (scripts/)
bun scripts/bootstrap-conformance.ts [--filter s] [--cases dir] [--json p] [--check] [--write [--ratchet]] — bootstrap conformance run (report docs/bootstrap-conformance.md)
bun scripts/gen-bootstrap-severity.ts [--check] — compiler/self-host-v2/severity.scrml from SPEC §34
bun scripts/lint-no-default-arm.js / lint-duplicate-fn.js — bootstrap lints
bun scripts/facts.ts [--check|--write] — docs/FACTS.md
bun scripts/state.ts [--check|--write] — docs/generated/{gap-counts,recent-sessions}.md + the known-gaps heading/marker drift report (WARN-only)
bun scripts/regen-spec-index.ts — compiler/SPEC-INDEX.md totals + rows
bun scripts/spec-coverage-check.ts [--write] — docs/bootstrap-spec-coverage.md gate + totals
bun scripts/windows-ratchet.ts validate|judge|retry-list|report — Windows baseline ratchet
bun scripts/sync-bootstrap-url-guard.ts — copies compiler/src/runtime-url-guard.js into the bootstrap runtime
bun scripts/gen-md-shim.ts [--check] — compiler/runtime/stdlib/md.js from stdlib/md/index.scrml (blocking, in-PR)
Others: claim-gate.js + claim-gate-c2.js, snippet-gate.js, corpus-compile-floor.ts, host-global-scan.ts, s34-census.ts, conflict-marker-gate.ts, delta-lint.ts, ci-shards.ts, ci-pr-base.sh, ci-stale-warn.sh, bot-owned-untouched.sh, test-sharded.ts, inbox-debt.ts, review-debt.ts, worktree-sweep.ts

## Build & Release
Not published from CI. package.json `files` is an allowlist: compiler/{bin,src,native-parser,runtime}/, stdlib/, README.md, LICENSE (self-host*, tests, SPEC, examples excluded). Version 0.8.0.

## Git hooks (scripts/git-hooks/, install: ./scripts/git-hooks/install.sh)
pre-commit — warns on a commit to main; runs `bun test compiler/tests/{unit,integration,conformance} --bail` sharded by scripts/test-sharded.ts; also runs the bootstrap slices + lints when the staged diff touches a slice input (compiler/self-host-v2, compiler/src, compiler/runtime, compiler/native-parser, conformance, stdlib, SPEC.md, known-gaps.md, …); SPEC-coverage step (warns on stale)
pre-push — full suite on update pushes (new refs defer to CI); SPEC-INDEX and FACTS steps warn on stale; no slices
post-merge / post-rewrite — phase 2 of the `scrml-generated` merge driver (scripts/git-merge-generated.ts --regen)
core.hooksPath is absolute: hooks run from the main checkout's scripts/git-hooks.

## CI/CD Pipeline  [.github/workflows/ci.yml, 867 lines]
Triggers: push to main (paths-ignore **.md, handOffs/**, docs/**), pull_request, merge_group, schedule 06:41 UTC, workflow_dispatch. Bun pinned 1.4.3.
checks — fast gates: types gate, parser/native conformance, snippet gate, claim gates (C1 + C2), compile-floor, FACTS currency (warn), md shim (blocking), bootstrap conformance report (PRs touching conformance/cases or self-host-v2; stale warns), conflict markers, SPEC-INDEX, SPEC-coverage, state.ts, bot-owned docs/generated untouched, severity table, delta-log sequence, every blocking job in gate.needs, Windows baseline validate, §34.0 row provenance
unit (3 shards) — bun test compiler/tests/unit compiler/tests/conformance
integration (3 shards) — pretest, then bun test compiler/tests/integration compiler/tests/lsp compiler/tests/commands
browser — pretest, gauntlet quick check (TodoMVC), scripts/browser-baseline.ts --check (failure NAME-SET gate)
slices — bootstrap lints + slice-m1/m2/(m1 lowered)/m3/m4/codec, then compiler/tests/e2e-render-map/
host-global (sharded by emission mode) — scripts/host-global-scan.ts: no user binding can capture a host global
postgres-live — postgres:18 service; slice-m4 pg-envelope / sql-error-pg / statement-savepoint-pg s475 tests; fails on any skip. Skipped on merge_group. Required since S475 (#1791)
windows — windows-latest unit + conformance + e2e-render-map with junit, one retry, judged by windows-ratchet.ts against .github/windows-baseline.json; path-filtered on PRs (step `env.WIN_TRIGGER`), skipped on merge_group
tracking — non-blocking: bootstrap-conformance --check (staleness report)
gate — the ONE required check. needs: checks, unit, integration, browser, slices, host-global, windows, postgres-live. Every need must be success, except windows / postgres-live may be `skipped` on merge_group. It also reconciles the shard partition (ci-shards.ts reconcile)

## Other workflows
generated-regen.yml — on push to main, a daily 08:23 UTC backstop and workflow_dispatch: runs severity -> SPEC-INDEX -> coverage -> state -> bootstrap-conformance (--write --ratchet) -> FACTS on main's tip; on drift, force-pushes branch `bot/generated-regen` and auto-merges its PR through gate. Token: MAPS_PAT. Closes any leftover `bot/facts-regen` PR
windows-main-report.yml — daily 07:47 UTC + dispatch: reports main's latest windows result and its first red SHA
cloud-maps.yml — daily 09:17 UTC + dispatch: thread-board probe only (writes nothing since S474)
advisory-review.yml — workflow_dispatch only (disabled since S310, cost decision): advisory AI review comment
Branch protection: ruleset 25356240 on main (PR + gate + merge queue, no bypass). Details: .github/CI.md

## Docker
No Dockerfile or docker-compose. The only CI service container is postgres:18 (postgres-live job).

---

# Carried detail (pre-f92d1a8fb body sections)
The sections below are the previous map generation's body (mostly impl#1, `compiler/src`), carried rather than lost. They were NOT re-read line by line. Each carries a verification line from f92d1a8fb: code identifiers checked to exist, `symbol` :line anchors re-derived by grep, cited paths checked, cited gaps whose marker is no longer `open`, and STALE-RISK flags for the CI/bot facts that changed in S468–S475. Where a carried section disagrees with a refreshed section above, the refreshed section wins.

## (carried) Packaging — scrml is PUBLISHABLE as of this window (`171f5f23`)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 2/2 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. Paths cited that do NOT exist at f92d1a8fb: `compiler/package.json`._

`"private": true` removed · `"workspaces": ["compiler"]` removed · **`compiler/package.json`
DELETED** (acorn + astring hoisted into the root `dependencies`) · a `files` ALLOWLIST added. There
is now exactly ONE manifest. Published surface: `compiler/bin/`, `compiler/src/`,
`compiler/native-parser/`, `compiler/runtime/`, `stdlib/`, `README.md`, `LICENSE` — an allowlist, so
**anything new is excluded by default**. `stdlib/` is REQUIRED at runtime
(`module-resolver.js`'s `STDLIB_ROOT` resolves `../../stdlib`), not documentation. Deliberately
excluded: `compiler/tests` (20M), `self-host*`, `samples/`, `examples/` (12M),
`SPEC.md`/`PIPELINE.md` (docs live on scrml.dev) — widening a published surface is easy, narrowing
it is not. `bin: { scrml: "compiler/bin/scrml.js" }` is unchanged. Any doc or brief describing a
`compiler/` workspace at v0.2.0 is stale.

## (carried) scrml CLI subcommands (compiler/src/cli.js -> commands/*.js)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 13/13 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
compile, dev, build, serve, migrate, **db-migrate (NEW S287)**, promote, generate, init, introspect, semdiff — **11 verbs** (was 10; `db-migrate` is the only addition this window). `migrate` and `db-migrate` are DELIBERATELY DISTINCT commands, not a rename: `migrate` is the pre-existing scrml-SOURCE syntax codemod tool; `db-migrate` (below) applies a project's `<schema>` to a REAL database. `compile`, `dev` and `build` carry `--module-format=<classic|esm>` (prior window, unchanged).

### `scrml compile` flags
--parser (live|scrml-native), --mode, --output/--output-dir, --watch, --embed-runtime, --self-host, --convert-legacy-css, --prod/--production (§20.6.5 log() strip), --validate-emit/--no-validate-emit, --no-gather, --debug-perf, --verbose, --chunk-size-budget, --emit-batch-plan, --emit-block-analysis, --emit-engine-graph, --emit-reachability, --emit-token-set, --emit-per-route, --emit-machine-tests, --module-format=<classic|esm>, --help.
`compileScrml()` (compiler/src/api.js) carries an internal `contentHashAssets` option (default `false`) — NOT a CLI flag; `scrml compile`'s output stays byte-identical (un-hashed `.client.js`/`.css` names). See "Content-addressed build assets" below.

### `scrml dev` flags
--port, --idle-timeout <n> (configurable Bun.serve idleTimeout, default 120s), --embed-runtime, --convert-legacy-css, --validate-emit/--no-validate-emit, --no-gather, --verbose, --module-format=<classic|esm>, --help.
`scrml dev` attaches cache headers to every static response (see below) — always on, no flag gates it. **Does NOT auto-apply DB-authoritative security DDL** (see `scrml db-migrate` below — auto-apply-on-boot is deliberately eliminated for Postgres).

### `scrml build` flags
--target, --minify, --output, --idle-timeout, --embed-runtime, --copy-config, --validate-emit/--no-validate-emit, --verbose, --module-format=<classic|esm>, --help.
`scrml build` calls `compileScrml({ ..., contentHashAssets: true })` unconditionally and threads the returned `hashedAssets` set into the generated `_server.js`.

### `scrml db-migrate <project-dir|entry.scrml> --db <url> [options]` flags (NEW S287, §14.8.11.1 — the migration-apply seam)

Applies a project's `<schema>` (including the §14.8.11/.2 DB-authoritative RLS/role/SECDEF DDL) to a
REAL database — the APPLY inverse of `scrml introspect`'s EMIT (introspect: live DB -> `<schema>`
source; db-migrate: desired `<schema>` -> reconciling DDL on the live DB).

--db <url>            REQUIRED. The MIGRATOR/owner connection string (`postgres://…` or a SQLite
                       path/`sqlite:` URL) — a DIFFERENT, MORE-PRIVILEGED principal than the app
                       runtime's own `db=` (a DDL-capable role: `CREATE ROLE`, `ALTER TABLE … FORCE
                       ROW LEVEL SECURITY`, `CREATE POLICY`, `GRANT`). This separation IS the
                       security property — the compiler will not make the app process able to apply
                       or alter its own security DDL.
--dry-run              Print the reconcile plan; apply NOTHING (no lock, no ledger write, no txn).
--allow-destructive    Permit a bare `DROP TABLE` for a table present in the DB but absent from
                       `<schema>` (default: refused — see `W-SCHEMA-DESTRUCTIVE-DROP`, error.map.md).
--help, -h

**Postgres apply flow** (the acceptance-gated, db-authoritative-capable path), all inside ONE
transaction under the migrator connection: `pg_advisory_xact_lock(<fixed key>)` (serializes
concurrent migrators; auto-releases at commit/rollback — a dead migrator process leaks no lock) ->
ensure the thin `_scrml_migrations` ledger (`id`, `applied_at`, `object_kind`, `object_name`,
`ddl_hash` — apply-atomicity + object-authorship, NOT a versioned migration-file history) -> read
actual state (`readActualSchemaPg` + a narrow `pg_policies`/`pg_roles` scrml-managed-object presence
read) -> `diffSchema(desired, actual, {driver:"postgres", allowDestructive})` (appends the idempotent
DB-authoritative DDL for each `db-authoritative` table + any SECDEF `fn`) -> apply each statement,
recording `{object_kind, object_name, ddl_hash}` per statement -> commit. A statement failure rolls
the WHOLE run back.

**SQLite apply flow** (Fork 5 — general, no privilege model): read actual via `readActualSchema`,
diff, apply the whole plan in one `BEGIN`/`COMMIT` transaction. Makes a plain `<schema>` finally
do-something-at-deploy for every adopter, not only db-authoritative ones.

**Pre-flights (fail closed BEFORE touching the DB):** `E-DBAUTH-SQLITE` (a db-authoritative table or
SECDEF `fn` against a non-Postgres `--db`), `E-DBAUTH-NO-TENANT-COLUMN` (a db-authoritative table
with no `tenant_id` column — the M1 policy is keyed on it). Echoes the recognized db-authoritative
table set and surfaces `W-DBAUTH-MARKER-NEARMISS` for a mistyped marker (silent-downgrade guard).
See error.map.md for all four codes, domain.map.md for the tier's concept, migrations.map.md for the
full apply model.

### `scrml semdiff <base> <head>` flags (the #6b P0 semantic-diff primitive, landed S264)
Classify a change between two .scrml versions by AXIS + soundness TIER — never a boolean "safe".
--emit-classification  Emit the per-matched-entity classification (default).
--json                 Structured JSON output (the consumer review-row / merge input).
--help, -h.
Both versions are compiled in-process (full pipeline, write:false); the synthesized top-level `verdict` field is the single value a consumer keys on. Exit codes: **0** = cosmetic (no-op on every modeled axis) · **1** = behavioral (a change on some axis; gate/review stays consumer-side) · **2** = a version failed to compile (fail-closed — the compiler is the first reviewer). Consumers: giti MERGE, flogence REVIEW. Classifier math lives in `compiler/src/semdiff.ts` (pure, unit-tested); the command is the I/O shell.

## (carried) `--module-format=classic|esm` (ESM-chunks arc U1-U3)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 1/1 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

Selects the CLIENT module format. Accepted on `compile`, `dev` and `build`, in both the
`--module-format=esm` and `--module-format esm` shapes; any other value is a hard exit with
`Unknown --module-format value: "<x>". Valid values: classic, esm`. Parsed in each command's arg
loop (compile.js, dev.js, build.js) and threaded to `compileScrml({ moduleFormat })` -> `runCG`
(codegen/index.ts).

- **`classic` is the DEFAULT and the only conformance-tested path.** The client runtime is a
  non-module `<script src>` sharing one global scope with every page chunk; cross-file linkage goes
  through the global `_scrml_modules` registry. Every esm transform is gated, so classic output is
  byte-identical to pre-arc output.
- **`esm`** emits the runtime as an ES module with a derived `export {…}` surface, each client chunk
  as an ES module that namespace-imports its deps and the runtime subset it uses, `type="module"` on
  the emitted `<script>` tags, and (on the build path) content-hashed in-chunk import URLs. Still
  EXPERIMENTAL: the module-capable browser-test harness and the default-flip are not built.
- **`esm` + `--embed-runtime` = no effect** — the embedded runtime stays a classic script.
- Selecting esm prints an operational stderr notice keyed **`W-MODULE-FORMAT-ESM-INCOMPLETE`**
  (`compiler/src/commands/module-format-notice.js`). Deliberately NOT a §34 catalog code and never
  enters the diagnostic stream or the compile result; classic prints nothing.

## (carried) Public-claim gates (S280)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 2/2 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. STALE-RISK: describes CI `gate`: since S468–S475 `gate` is an aggregator over checks/unit/integration/browser/slices/host-global/windows/postgres-live (build.map.md "CI/CD Pipeline")._

Three scripts, two of them CI-required. They exist because a public claim that was true when
written rots silently.

- **`scripts/snippet-gate.js`** — GATE. Discovers every `.scrml` under a declared corpus and
  compiles each through `compiler/bin/scrml.js compile` into a temp dir; exit 1 on any failure.
  **Wired into CI `gate` and the release-tag `pre-push` hook.** **CORPUS WIDENED S292:**
  `SNIPPET_CORPUS = ["docs/tutorial-snippets", "docs/readme-snippets", "docs/website"]`. The
  scrml.dev pages are the most-read public surface shipped and sat OUTSIDE the gate until now — the
  same hollow-gate shape the gate was built to close at S280, one directory over. The ROOT is
  declared (98 files at time of addition) rather than individual pages, so a NEW page is gated by
  EXISTING rather than by someone remembering to list it. A declared-but-absent row is tolerated.
  **Known limit, stated in the source:** this gates that a page COMPILES; it cannot gate whether the
  page's PROSE is true — the seven false claims corrected at S292 were all prose on a page that
  compiled fine. Prose currency needs an empirical re-verify, not this gate. `docs/FACTS.md`'s
  "public code samples under the compile gate" figure (12) counts the tutorial/readme snippet
  corpus, not the widened `docs/website` root.
- **`scripts/facts.ts`** — generator + checker for `docs/FACTS.md`. `bun scripts/facts.ts` prints,
  `--write` regenerates the `@generated:*` anchored sections in place (idempotent), `--check`
  regenerates in memory and exits 1 on any stale section. **`--check` is wired into CI `gate`.**
  Derives: compiler version, live compiler LOC + file count, test files, SPEC lines, conformance
  cases, stdlib modules, **CLI verbs (now 11, `db-migrate` included)**, LSP capabilities, editor
  integrations, deploy targets, gated snippets. **A public doc SHALL cite FACTS.md rather than
  hardcode any of these figures.**
- **`scripts/regen-spec-index.ts`** — generator + **NEW `--check`er (S290)** for
  `compiler/SPEC-INDEX.md`. Regenerates the Sections-table line ranges/sizes AND the
  `@generated:spec-index-totals` block in place from SPEC.md headings, preserving hand-written
  summaries. **`--check` is wired into CI `gate` (a 6th step) and the local pre-push currency gate.**
  Only the TOTALS are gated — the per-section line ranges drift by design between amendments, and a
  gate that cries wolf gets bypassed then deleted. The totals line (`Total lines: N | Total
  sections: M + appendices`) was hand-maintained while the script regenerated the rows around it, so
  it had rotted to `33,436 lines / 61 sections` against a 36,575-line, §65-deep SPEC. The line count
  drops a trailing empty split element so it matches BOTH `wc -l` and `scripts/facts.ts`'s
  `specLines()` — two generated figures for one quantity disagreeing by one makes a reader distrust
  both.
- **`scripts/claim-gate.js`** — the fenced-block (C1) half: extracts ```scrml fences from a declared
  PUBLIC_SURFACE, compiles + ghost-pattern-lints each, `// gate: skip` opt-OUT. **Not wired into CI**
  (measure-mode only).
- **`scripts/browser-baseline.ts` — NEW (S313, #361). GATE, in BOTH `gate` and `tracking`.** Three
  modes mirroring `facts.ts`/`state.ts` exactly: bare = PRINT the tier's current failure set,
  `--write` = record the baseline (idempotent), `--check` = diff and exit 1 on ANY difference.
  **It asserts the failure NAME SET — not the exit code, and not the count.** The premise it removes:
  the browser tier always exits 1 against a documented ~48-failure baseline, so an exit-code gate
  could not express "the same failures as before", every blocking gate excluded the tier, and a
  genuinely new browser failure was therefore INVISIBLE — `pa-base` §8's "a gate that has never
  failed is indistinguishable from a gate that CANNOT fail", in its purest form. The key is
  `<suite> > <test name>` and nothing else; **timings, pass/fail COUNTS, file paths and ordering are
  deliberately stripped** as non-deterministic or uninformative. **BIDIRECTIONAL by design:** a name
  JOINING is a regression; a name LEAVING means the baseline is STALE (prune it in the commit that
  fixes the test) — a baseline nobody prunes re-acquires the blind spot it was built to remove.
  **Scar worth keeping:** the `(fail)` regex is deliberately NOT line-anchored, because a failing
  test whose assertion dumps a happy-dom object emits the marker MID-LINE and the anchored first cut
  silently under-counted by exactly one — which would have been the precise hollow gate the script
  exists to prevent. Baseline artifact: `compiler/tests/browser/FAILURE-BASELINE.json` (48 names + 2
  env-exclusions, `recordedAt` 2026-08-02). **Scope is the browser tier only** — lsp / commands /
  self-host have no name-set assertion (`g-lsp-commands-selfhost-tiers-have-no-failure-name-set-assertion`,
  LOW). **Deliberately NOT in pre-push:** local environments vary far more than CI, and it was
  exactly a local environment difference that made the first recorded baseline wrong.
  **#537 (S346): every NEW failure name now prints a REASON EXCERPT beside it (`failureReason()`).**
  The name-set key is deliberately blind to everything but `<suite> > <name>`, and
  `spawnSync(..., {encoding:"utf8"})` swallows the tier's stdout — so a TIMEOUT (bun: `(fail) <name>`
  THEN `^ this test timed out after Nms.`) was indistinguishable from an assertion failure (bun:
  `error:` block THEN `(fail) <name>`) at the gate's output. The excerpt is the nearest preceding
  `error:` block (capped at 8 lines), the marker's own timing, and any `^`-prefixed line after the
  marker. **Best-effort and diagnostic-only — NEVER an input to the comparison.**
- **`scripts/s34-census.ts` — NEW (S310). GATE (`--check-new`), and the §34 oracle otherwise. ⚑ ITS WINDOWS-ONLY `ENOENT` IS FIXED AT #473 (S332-peter) — `fileURLToPath(import.meta.url)`, not `new URL(import.meta.url).pathname`. The four-window-old "this tool is broken" note is RETIRED; it runs on every platform now. Re-executed at `616688ea`: `807 rows (§34 19113..19991, derived) · 1887 source files · 880 conformance cases`.**
  `bun scripts/s34-census.ts [--full] [--json]` classifies every catalogued diagnostic into
  STRUCK / PINNED / IMPL-SITES / DECLARED-AHEAD / RUNTIME-SURFACED / FALSE-CLAIM;
  `--check-new --base <ref>` enforces **SPEC §34.0** against a DIFF, never the legacy corpus.
  **No hardcoded line numbers — §34's range is derived from the headings every run**, explicitly
  because a baked line number in a maintained artifact rots silently and nothing fails (the 3,140-line
  stale SPEC-INDEX and the ~9x-wrong LOC figure are the two precedents, and are why `docs/FACTS.md`
  exists). See error.map.md for the buckets and the traps it defeats.

## (carried) `scripts/boot.ts` — the executable boot read-set gate (NEW #492/#493/#498) — NOT a CI gate
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 3/3 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

**Why it exists, in one sentence: a memory NAVIGATES and does not GATE, so it "leaves room for
misdirection."** S335 short-booted — skipped BOTH user-voice ledgers and the per-user profile — and
led orientation with a fresh option-menu instead of the agreed left-off pickup. The remedy is an
executable check the boot always runs, not a stronger reminder.

**Four things it does, and the third is the design decision worth copying:**

1. **FETCHES both repos READ-ONLY** and reports behind/ahead/dirty. Fetch yes; pull, commit and push
   never — so it is safe to run at any time.
2. **VERIFIES every Profile-A read-set source EXISTS and is CURRENT.** Both user-voice ledgers and
   the per-user profile are in the set **BY CONSTRUCTION** (that is the S335 miss encoded).
3. **DELEGATES the mandatory probes to their authoritative scripts** — `review-debt.ts`, `threads.ts`,
   `dpa-debt.ts`, **`issue-debt.ts` (NEW #536)**, and `gh` for issues/PRs/runs — **never a
   reimplementation, so a probe cannot drift from its source of truth.** This is the same rule `dpa-debt.ts` states from the other direction, and it is the
   generalisable one: **a second implementation of a probe is a second thing that can be wrong.**
4. **EXTRACTS and PRINTS the `## ⏭ NEXT-SESSION PICKUP` block from `hand-off.md` FIRST** — orientation
   leads with the handshake, not a menu.

**Modes.** `bun scripts/boot.ts` = digest (default) · `--json` = machine-readable · `--check` = the
strict gate · `--no-probes` = skip the `gh`/sub-script calls (fast, offline; still fetches).

**DETECTION, NOT CONTROL, BY DEFAULT — and the failure classes are enumerated, not implied.**
`--check` exits 1 **iff** a read-set file is MISSING or the PICKUP block is ABSENT. **A repo merely
BEHIND origin is a WARNING, not a failure** — that is timing, not a defect, and the `/boot` skill
still owns pull.

**DERIVE-DON'T-DECLARE, GUARDED — with an honest residual it states about itself.** The read-set
manifest MIRRORS the `.pa-base/profile` Profile-A block. Because a hand manifest can drift from the
contract, **each item carries a `needle` proving its mandate, and `driftCheck` asserts that needle is
still present in the mandating artifact** — so the manifest cannot silently outlive a read the
contract renamed or dropped. **The REVERSE direction is NOT auto-detected** (the contract adding a
read the manifest lacks), and the script says why rather than hiding it: the profile prose also NAMES
reads it tells you to SKIP, so a token scan would be cry-wolf (§8). The manifest is reviewed against
the profile at each amendment.

**WINDOWS-FIRST, and it names the precedent.** `ROOT` via `fileURLToPath`, **never**
`new URL().pathname` — that is the S262/#473 Windows break this map set tracked for four windows.
Sub-processes via `spawnSync` with explicit arg arrays, no shell.

**SCOPE — additive.** It does NOT touch bryan's boot contract (`.pa-base/profile` · `/boot` ·
`pa-base.md`); it is wired into peter's `/boot` only, and the shared-contract amendment was ROUTED.

## (carried) `scripts/issue-debt.ts` — the adopter-issues obligation probe (NEW #536, S346) — NEVER a gate, never in CI
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 3/3 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

**The same `pa-base` §10 hole as dpa-debt, in the ISSUES channel: the boot probe READ `gh issue list
--state open` and the PA STATED the open issues — which discharges nothing.** At S346 three open
issues (#519, a DX bug, 08-12 · #509, offline/PWA direction · #471, document-workflow direction) had
been NAMED in the S343/S344/S345/S346 boot reports and acted on by NOBODY: zero comments, no
`docs/known-gaps.md` entry, no `handOffs/dpa-queue.md` item. Adopter BUGS have a lane (peter); a
DIRECTION question had none, so it was everyone's and therefore no one's.

**The obligation it asserts: every OPEN adopter issue has a HOME, or it is OWED.** A HOME is one of
exactly two in-repo artifacts — a `#<n>` mention in `docs/known-gaps.md` (HOMED-GAP) or in
`handOffs/dpa-queue.md` (HOMED-DPA). OWED prints number · age · comment count · title; **0 comments
AND >2 days old is the loud shape (SILENT)** — the adopter has heard nothing and the repo holds
nothing.

**Design constraints, each a named prior scar:** DETECTION NOT CONTROL (exit 0 always in default
mode; `--check` is for the PA's hand, NEVER CI — §8 cry-wolf); ANCHORED MATCH (`#51` must not match
`#519`; the `issues/<n>` URL form counts as a mention — the repeating false-positive class: boot's
PICKUP `indexOf` #492, the S337 ledger regex, dpa-debt's status cell); PURE CLASSIFIER (`classify()`
over strings + a fixed `now` — no gh, no fs, no clock — pinned by `unit/issue-debt.test.js` without a
network; `import.meta.main` gates the CLI); SELF-REPORTED TOTALS NEVER HEAD-CUT (`--limit`
auto-widens ×4 to a ceiling and prints `SCAN MAY BE TRUNCATED` if still full — §8 truncated probe);
DETERMINISTIC AGE (`--now=<ISO>`); WINDOWS-FIRST (`fileURLToPath`, `spawnSync` arg arrays, no shell).

**Modes.** bare = boot-probe report (exit 0) · `--check` = exit 1 iff any OWED · `--json` ·
`--now=<ISO>` · `--repo=owner/name` · `--gaps=<path> --queue=<path>` · `--limit=N`.

## (carried) `scripts/dpa-debt.ts` — the deliberation-queue probe (NEW #507) — NEVER a gate, never in CI
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 1/1 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

**The rule it discharges is `pa-base` §10's most-repeated failure: an obligation recorded in one
artifact while every probe reads another.** `handOffs/dpa-queue.md` is the ONE file the dPA drains,
and until this landed **no boot probe read it** — the boot gate probed review-debt, the thread board,
gh issues/PRs and CI, every inbound channel except the deliberation queue. **Measured cost:**
`dpa-024` sat `BANKED — UNRUN` from S331 to S337 (six sessions), filed under "OWED BY BRYAN" when it
was the question only the DD could answer, so it sat in a list where it could never move; bryan
surfaced it himself. Separately, `dpa-022`/`dpa-023` read `BANKED — UNRUN` for a full day AFTER they
had run. **The rule: a channel the probe does not read does not exist to the PA.**

**BIDIRECTIONAL, deliberately, and this is the part to copy.** The queue states in its own words that
the PA-maintained status TABLE supersedes the per-item `status:` lines, so the probe reads the table.
**It ALSO parses the per-item lines and reports any DISAGREEMENT** — because the dpa-022/023 miss was
a STALE TABLE, and **a probe that trusts its authoritative surface unconditionally cannot see that
surface go wrong.**

⚠ **ITS CLASSIFIER IS ANCHORED ON THE LEADING TOKEN, AND THE COMMENT EXPLAINING WHY NAMES THE THIRD
INSTANCE OF A REPEATING BUG.** A `contains` test reports dpa-022/023 as UNRUN, because those cells
NARRATE the string (*"this row read \"BANKED — UNRUN\" until S325 corrected it"*) — **a false
positive on the very rows whose staleness motivated the probe.** Same unanchored-match class as the
boot gate's PICKUP `indexOf` bug (#492) and the S337 ledger-section regex. It also reads ratification
from **column 3, not column 2**, because the dPA never flips a row to `ratified` (RUN-not-RATIFY) —
reading col 2 alone reports dpa-019/020/021 as owed when they were ratified at S319.

## (carried) `scripts/source-text-regex-census.ts` — the post-AST source-text rule's probe (NEW #513) — deliberately NOT a CI gate
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 4/4 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

**THE RULE (bryan, S338):** *a regex applied to SOURCE TEXT in a POST-AST stage requires a one-line
justification, or the structural route.* **Binds NEW-OR-TOUCHED code only.** Detection is a RATIO,
not an inspection.

**Why the rule exists: five adversarial reviews across two unrelated branches in ONE session found
the same substitution every time** — a text-level shortcut standing in for a structural one, where
the parsed tree was already in hand. Five instances, five authors, no coordination: a `wired`
classification table validated by COUNTING TEXT OCCURRENCES (circularly — the delta it measured
included the declaration that existed only because the table had already said "wired");
`bareAttrValueIsWired` restating codegen's `name.startsWith("on")` as `/^on[a-z]/`, which then
drifted on `on=` / `on-tap=` / `on_tap=`; an `import.meta` fence regexing source text TWO LINES
BEFORE the `parseExprToNode` call that would have answered it structurally; `bareBindingReferenceOf`
anchored on trimmed RHS source text, so `(@v)` defeated a guard `@v` tripped; a lifecycle variant
branch matching `.Published` inside a STRING LITERAL. **None was caught by a 22,385-test suite or a
7,375-artifact differential — and that is a property of the class, not a gap in the gates: a regex
over source text is indistinguishable from a correct check until someone writes a string literal.**

**WHAT IS AND IS NOT A DEFECT — the partition IS the instrument.** A regex over source text in the
tokenizer, block-splitter, ast-builder, expression-parser or native-parser is **CORRECT** — turning
text into structure is their job. The defect class is a stage that **already holds the parsed tree**
asking the text instead. `PRE_AST_MARKERS` encodes the exempt set. **The raw count of regexes (11,196
literals at the time of writing) is worthless and the script says so — never quote it.**

⚠ **IT REPORTS A FLOOR, NOT A COUNT, AND YOU MUST SAY SO WHEREVER YOU QUOTE IT.** It keys on argument
identifier NAMES, so it cannot see `postRe.test(t)` — **which is exactly where the confirmed
pre-existing defect at `type-system.ts:26346` lives.** The opaque-argument population (`t`, `s`, `v`,
`x`, …) is reported SEPARATELY and is unclassifiable by this instrument. **The script records this
about itself in its own header:** its author built a name-pattern-matching probe to detect the
practice of pattern-matching instead of resolving structure, and it inherited the same blind spot.
**The honest upgrade path is named too** — a structural successor would walk the TypeScript AST and
resolve each regex argument to its declared type and origin rather than guessing from its name.

## (carried) PR review-floor tracker — `scripts/review-debt.ts` (NEW, S316) — NOT a CI gate
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 1/1 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

Built after the review floor (pa.md's mandatory-review contract) was measured at a **0% execution
rate** the day after ratification: boot reads `gh pr list` (**open** PRs only), while the review floor
binds **merged** PRs, and nothing computed the difference — eight PRs merged unreviewed and the debt
was invisible to the session that incurred it and every session after (a second instance of the S262
"a contract can name an obligation with no probe that reads it" class). `scripts/review-debt.ts`
drains merged-but-unreviewed PRs against `docs/pr-reviews.md`, and is wired into **PA boot step 0.6**
— it is bookkeeping for the PA operating loop, **not a CI step**, and does not appear in `ci.yml`.
First drain (S316) found a real incomplete fix (#391). Standing measurement, per S319: the review
floor's execution rate over a 3-session window is itself the thing being tracked.

**REWRITTEN AT #481 (S331), and the rewrite is a lesson in what a health metric actually measures.**

**TWO carve-out rates now print, and ONLY THE SECOND IS A HEALTH SIGNAL.** The all-PR rate cannot
distinguish a docs-heavy stretch from a floor being evaded: a wrap / continuity / gap-filing PR has
**no code path to review BY CONSTRUCTION**, so its carve-out is the CORRECT classification, not an
escape. Measured S328: all-PR **57%** while every code-bearing PR in scope had received a full pass;
code-bearing was **1/28 = 4%**, and the single exception was `scripts/review-debt.ts` itself.
Re-measured S331: all-PR 50%, code-bearing **0/4**. So the all-PR figure prints as a **volume
statistic with no alarm**, and the alarm rides the code-bearing rate where the target is ~0%.

**The code-bearing population is a directory WHITELIST, not a doc-extension blacklist:**
`/^(compiler|stdlib|scripts)\/|^conformance\/cases\//`. The direction is deliberate — **a new docs
directory should default to "not code"; a new source directory must be added here consciously.**
`docs/` is excluded even though it holds `docs/changes/**` briefs (a brief has no runtime surface);
**`scripts/` is INCLUDED because a probe defect is exactly the class this floor exists to catch.**
A PR whose file list `gh` did not return is reported as a THIRD bucket — **not folded into either
rate.** An absent file list is not evidence of docs-only.

**The threshold is a COUNT (>= 2), not a percentage, and the reason is measured.** The target is ~0%,
and a percentage floor scales tolerance with population — at 36 in scope a 20% trigger silently
permits SEVEN carved code-bearing PRs. **Proven by bite test at S331: five injected carve-outs
reached 17% and did NOT fire.** Two is the trigger because exactly one standing exception is
expected and legitimate (`#397`, the script itself, which has no code path a review could probe);
two is a pattern. **The carved list prints unconditionally regardless of the threshold**, so nothing
hides below it.

**The truncation guard, and why the naive version was DELETED rather than tuned.** `gh pr list
--limit N` returns at most N rows, so a full list may have been cut and a cut enumeration reads
exactly like a complete one (the §8 truncated-probe class). But **the completeness test is NOT "was
the list full"** — a full list is only a problem if the cut could have removed an IN-SCOPE PR. Once
the scan has seen a single PR numbered BELOW the floor epoch, the in-scope population is provably
complete no matter how many rows came back. Written the naive way (`merged.length >= limit`) the
guard fired at `--limit 300` while the in-scope count had been stable since `--limit 100` — **a
guard red for reasons no change caused, which is the cry-wolf shape §8 says gets bypassed and then
deleted.** Caught by proving the bite.

**Detection alone was judged insufficient — it AUTO-WIDENS.** `limit` defaults to **150** (from 40)
and quadruples up to a `WIDEN_CEILING` of 1000 until the scan provably clears the epoch, printing
`(scan auto-widened X -> Y …)` when it does. **Root fix, not a louder warning.** And the widening
happens BEFORE anything is counted: computing `bound` first and widening after would leave every
figure derived from the pre-widen list while the widen message claimed otherwise — *the exact defect
this guard exists to prevent, one level up*.

## (carried) Wide-corpus emit-differential + dual-goggle syntax gate — `scripts/corpus-emit-differential.ts` + `scripts/corpus-check-goggles.js` (NEW #428) — **NOT a CI gate; the STANDING PRE-LAND GATE for codegen**
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 1/1 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. Paths cited that do NOT exist at f92d1a8fb: `scripts/u1-corpus-emit.sh`._

**Task-shape routing: any change under `compiler/src/codegen/` runs this, base-vs-head, before it
lands.** It is not in `ci.yml`, not in `bun test`, not in a git hook. It is run by hand. (There was no
routing row for this task shape until this pass, and the absence cost a dispatch.)

```
# capture one side (repeat for base and head, from two checkouts)
bun scripts/corpus-emit-differential.ts capture \
    --compiler-root /abs/path/to/a/scrml/checkout \
    --label base-<sha> --work /scratch/base --manifest /scratch/base.manifest.json
    [--roots examples,samples,conformance,stdlib,benchmarks]   # default; RECURSIVE
    [--concurrency 10] [--expect-total 1878] [--reuse-artifacts] [--no-syntax-check]

# compare
bun scripts/corpus-emit-differential.ts diff \
    --base /scratch/base.manifest.json --head /scratch/head.manifest.json
    [--json /scratch/diff.json] [--allow-same-revision] [--allow-reuse-manifest]
```

**Population at this HEAD: 1878 `.scrml` sources / 7254 emitted artifacts.** The 453 deliberate
exclusions are PRINTED with per-directory counts, so what is not measured is a visible decision rather
than an invisible default (`docs/` illustrative snippets · `compiler/native-parser/` deliberately
malformed fixtures · `handOffs/` session artifacts). `stdlib/` and `benchmarks/` were ADDED to the
default roots after an adversarial review noted the original three covered 1818 of 2368 sources and
excluded both shipped scrml and the most app-shaped programs in the tree.

**Exit codes are three-valued and the third one is the whole design:**
| verb | 0 | 1 | 2 |
|---|---|---|---|
| `capture` | manifest written, every self-check agreed | a self-check FAILED (enumeration disagreement, `--expect-total` mismatch, slug collision, unreadable artifact) | — |
| `diff` | no differences at all | differences found | **NOT A VALID COMPARISON** — different roots, enumeration disagreement, same revision both sides, differing check contexts, a `--reuse-artifacts` manifest, or a VACUOUS run (zero artifacts compared / zero checkable artifacts checked) |

**A capture NEVER exits non-zero merely because sources failed to compile — compile failure is DATA**
(`HARD REQ 5`). Every defense in the tool is marked `HARD REQ n` at its own site so a future editor can
see exactly what they would be removing.

### The load-bearing fact: `node --check` is the WRONG instrument, and so is bun

**`node --check` on a bare `.js` ACCEPTS a top-level stranded `await`** — Node resolves it by
module-syntax auto-detection and happily parses it as a module, where TLA is legal:

```
$ printf 'const x = 1;\nawait fetch("/y");\n' > tla.js
$ node --check tla.js ; echo $?            # -> 0   (PASSES)
```

**But the compiler emits `<script src="…client.js">` with NO `type="module"`.** Client bundles and the
shared runtime load as **CLASSIC SCRIPTS**, where the same bytes are a fatal SyntaxError and the whole
bundle is dead on arrival. **A gate built on `node --check` certifies bundles that cannot load** — and
that is precisely the auto-await work's own dominant failure mode. `node --check` is not used here and
**must not be reintroduced**.

**And the obvious in-process fix would have been a THIRD hollow gate:** measured,
`bun -e 'new (require("node:vm").Script)("await f();")'` does **not** throw, while the same line under
`node` throws `SyntaxError`. **Bun's `vm.Script` does not reject a top-level `await`.** The parent is a
Bun script; `corpus-check-goggles.js` is deliberately a separate **NODE** subprocess
(`node --experimental-vm-modules corpus-check-goggles.js <jobs.json> <results.json>`), batched — one
process, many files — so the correctness does not cost a spawn per artifact.

Two further reasons the goggles are explicit rather than ambient: `node --check`'s verdict is a function
of (content, extension, **nearest `package.json` `"type"` field**) — an input that lives OUTSIDE the
artifact, so dropping a `package.json` above the output tree swings the same bytes between pass and
fail; `vm.Script` / `vm.SourceTextModule` take source text and nothing else. And the EFFECTIVE goggle
per artifact is derived from the emitted HTML's own `<script>` tag, not guessed.

**It earned its cost on its first real run:**
`g-stdlib-module-resolver-emits-import-meta-into-a-classic-script-bundle` (MED, open) — a cleanly
compiling stdlib source emitting `Cannot use 'import.meta' outside a module`, invisible to every prior
gate on TWO counts at once (wrong goggle AND `stdlib/` outside the corpus roots).

### Why it is a repo tool and not another per-arc script

The same defect had shipped **three times**, each time in a throwaway harness, each time leaving a gate
that reported green while measuring a fraction of its population: `docs/changes/chunk-namespacing/
artifact-diff.mjs` compared **8 of 115** files (a re-anchored `relative()` plus a `catch { continue }`
that swallowed the throw); `scripts/u1-corpus-emit.sh` globbed TOP-LEVEL-ONLY in two directories,
measured **329 of 1818**, and reported "708/708 byte-identical"; that same script's `node --check` half
inherited the truncated population and reported base 2 / head 2 while an independent wide measurement of
the same two revisions got base 44 / head 46. **`pa-base v2.13 §8` names this THE TRUNCATED PROBE: a
truncated enumeration reads exactly like a complete one.** `scripts/u1-corpus-emit.sh` was deliberately
EXCLUDED from the #429 landing — it is the gate this tool retired.

## (carried) ⛔ SPLIT ON `/\r?\n/`, NEVER ON A BARE `"\n"` — four boot/gate probes were BLIND on every Windows clone (NEW section, S402, #848 `c516aadc`)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 0/0 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

**On a CRLF checkout (`core.autocrlf=true` — i.e. every Windows clone) a bare `"\n"` split leaves a
trailing `\r` on every line.** That silently defeats any END-SENSITIVE construct: a `$`-anchored
regex (`.` never matches `\r`, so `$` is unreachable) **and** an exact string compare alike.
⛑ **ALL FOUR PROBES FAILED AT EXIT 0 TOWARD A FALSELY-CLEAN RESULT — the direction that gets believed
rather than investigated.**

| script | what it read as clean | truth |
|---|---|---|
| `scripts/dpa-debt.ts` | `0 queued · ✓ nothing owed` | **43 items banked, 3 UNRUN, 4 ADVISORY awaiting bryan** |
| `scripts/generate-api-reference.js` | (see #848) | — |
| `scripts/regen-spec-index.ts` | (see #848) | — |
| `scripts/corpus-compile-floor.ts` | (see #848 / #844) | — |

⚑ **MEASURED BOTH WAYS, NOT REASONED:** the same real file parsed **CRLF -> 0 / LF -> 43**.
`handOffs/dpa-queue.md` alone carries **2,721 CRs**. bryan's S399 boot (Linux) read 40 queued; **every
Windows boot read zero, and the boot report stated zero.** This is the `pa-base` §8 hollow-gate class
landing on the one instrument whose entire purpose is to make an invisible obligation visible.

⛔ **THE RULE, AND IT GENERALISES BEYOND THESE FOUR:** any script that line-splits a repo `.md` and
then does an anchored or exact match **must** split on `/\r?\n/`. The fix puts the split in **one
named constant per file** so the next reader cannot reintroduce a bare `"\n"` locally.
⚠ **A `wc -l` or a `grep -c` will NOT reproduce this** — both are `\n`-based and agree across
encodings. **Reproduce by parsing the file under both encodings, which is how #848 was verified.**

## (carried) Content-addressed build assets + cache headers (S265, adopter #82, PR #96)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 4/4 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

**Naming (build path only).** `scrml build` → `compileScrml({ contentHashAssets: true })`. The
FNV-1a 32-bit hash (8-char base36) of each artifact's FINAL on-disk bytes is spliced in before the
extension: `<base>.client.js` → `<base>.client.<hash>.js`, `<base>.css` → `<base>.<hash>.css`.
`scrml compile` / `scrml dev` keep un-hashed names.

**Cache-header contract (both serve paths).**
- Content-addressed asset → `Cache-Control: public, max-age=31536000, immutable` (decided by EXACT
  SET MEMBERSHIP against `compileScrml()`'s returned `hashedAssets`, never a filename-shape guess).
- HTML entry document → `Cache-Control: no-cache` (always revalidate).
- Every other static asset → `Cache-Control: no-cache` + a WEAK validator (ETag/Last-Modified).

Implementation: `compiler/src/api.js` (`contentHashAssets` option), `compiler/src/commands/build.js`
(`generateServerEntry`), `compiler/src/commands/dev.js` (`devCacheHeaders`).

## (carried) Gate topology — the two failure modes, and why they pull in opposite directions
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 0/0 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. Cited gaps whose marker is no longer open: g-parity-canary-outside-every-blocking-gate=resolved. STALE-RISK: describes CI `gate`: since S468–S475 `gate` is an aggregator over checks/unit/integration/browser/slices/host-global/windows/postgres-live (build.map.md "CI/CD Pipeline"); cites `continue-on-error`: `windows` is now a required ratchet job and `tracking` is the only non-blocking job._

**Read this before adding a test tier to a gate, or removing one.** Both rules below were violated in
this repo, one of them for the whole life of the root-level test files.

**FAILURE MODE 1 — a tier that NOTHING blocking runs.** The 14 root-level `compiler/tests/*.test.js`
(parser-conformance-\*, native-\*) had **no runner at all** for 13 of them; the 14th
(`parser-conformance-within-node`) ran only in `tracking`, which is `continue-on-error: true`. They
were also outside the pre-commit hook's unit/integration/conformance scope. **Measured cost: a
38-failure native-parity regression passed pre-commit AND the required `gate`**, surfacing solely as
a red `tracking` — the job everyone (correctly) reads as the documented browser/serve-tool baseline.
**The transferable rule: a gate that is correctly non-blocking and habitually red is where a real
regression hides.** Fixed at `b7dda491` by wiring the files into `gate` AND `pre-commit`; they are
deterministic (no dist / browser / network deps) and cost ~16s; green at wiring time at 6394 tests /
0 fail. Gap: `g-parity-canary-outside-every-blocking-gate`.

**FAILURE MODE 2 — a blocking tier pointed at a tree with a DOCUMENTED FAILURE BASELINE.** pre-push
used to run the WHOLE of `compiler/tests/`. browser / lsp / self-host / commands carry a documented
baseline of **~42 failures (2026-07-30)** that is assessed by comparing failure-NAME SETS, not counts.
**An exit-code gate cannot express "the same names as before"**, so that scope made the hook
structurally unpassable — every push blocked, on every clone, for a baseline no change caused. That
is the `pa-base` §8 cry-wolf shape: a gate that cannot pass is bypassed, and a bypassed gate gets
deleted. Fixed at S301 by narrowing pre-push to the same unit+integration+conformance subset
pre-commit and `gate` use (verified 21597 pass / 0 fail on a clean checkout — so it CAN go red for a
real regression and green otherwise, which is the whole point).

**FAILURE MODE 2 IS NOW HALF-SOLVED, and the solution is the general one.** S313 (`#361`, bryan RULED
promote) resolved the tension for the browser tier by **gating on the wrong thing less**: not the
COUNT (which says nothing about WHICH test broke) and not the exit code (permanently 1), but the
**failure NAME SET** — a condition an exit-code gate CAN carry, because `--check` exits 0 while the
set is unchanged and 1 the moment a name joins or leaves it. The tier is now in the BLOCKING `gate`.
**The shape generalizes and is deliberately not yet applied:** lsp / commands / self-host carry their
own baselines and have no name-set assertion (`g-lsp-commands-selfhost-tiers-have-no-failure-name-set-assertion`,
LOW). Extending it is mechanical once this is proven in anger.

The two original rules remain in tension and both are load-bearing: **widen a blocking gate only over
a subset that is reproducibly green from source OR name-set-assertable; never leave a tier whose only
runner is non-blocking.**

## (carried) Gap-status vocabulary + LEDGER INTEGRITY — `scripts/state.ts` (CHANGED S299; THREE more integrity fixes #485, S334)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 6/6 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. STALE-RISK: mentions cloud-maps.yml: since S474 it writes nothing (thread-board probe only)._

`scripts/state.ts` parses `<!-- @gap id=… sev=… status=… -->` markers out of `docs/known-gaps.md`
to generate the §0 counts rollup. It runs in `cloud-maps` **Stage 1** and via `bun scripts/state.ts
--write` locally.

**TWO silent-drop guards now exist, and the second one is new this window.**

**Guard 1 (S299) — an unrecognised STATUS.** The status was previously a CLOSED alternation *inside
the regex*, so a marker carrying any other status **did not match at all — not miscounted,
INVISIBLE.** Fourteen such markers had accumulated across six unrecognised statuses, **two of them
open HIGHs**. Surfaced by ARITHMETIC: a landing resolved two HIGH entries and the count moved 12 → 11.

**Guard 2 (S307, #335) — an unparsed MARKER.** The regex also required `status=` to be followed
IMMEDIATELY by `-->`, so **any marker carrying an extra attribute was silently dropped** — and
`pa-base v2.9` had just made `locus=` a REQUIRED field on this exact marker, so every entry filed
under the new rule became invisible, in the direction that under-reports open defects. Measured at
the fix: **3 markers dropped, 2 of them OPEN.** The parser (`gapMarkersFrom`) is now an ATTRIBUTE BAG
— any order, any extra attribute (`locus=`, and `prov=` as of S313) — it SKIPS the doc's own
`id=<placeholder>` format example so the guard cannot fire on the documentation of its own syntax,
and it **THROWS naming the offenders** when the parsed count disagrees with the marker count.
`parseGapMarkers` is EXPORTED and the CLI dispatch is gated on `import.meta.main`, **specifically so
the guard is testable** — a gate that cannot be exercised from a test is the `pa-base` §8 unproven
gate, indistinguishable from one that cannot fail (`compiler/tests/unit/gap-marker-parser-s307.test.js`).

**The guard has since fired on its author, correctly.** At S313 a marker used `status=partial-impl` —
a value `docs/known-gaps.md`'s own header legend already defines ("some sub-units shipped, others
pending") but the classifier did not know. **The throw was right**; the fix was to teach the script a
value the ledger sanctions (added to `GAP_STATUS_OPEN` — a half-built guarantee is a live gap), not to
downgrade the marker to fit the script.

**The fix is deliberately not "widen the alternation".** The regex now matches ANY
`status=([a-z-]+)` and classification happens in three named sets:

| Set | Members | Counts as |
|---|---|---|
| `GAP_STATUS_OPEN` | `open`, `in-progress`, `narrowed`, `ruling-gated`, **`partial-impl` (S313)** | OPEN |
| `GAP_STATUS_CLOSED` | `resolved`, `fixed`, `deferred`, `non-gap`, `forensic`, `root-caused-elsewhere` | CLOSED |
| `GAP_STATUS_NOMINAL` | `nominal` | NOMINAL |

**A status in none of the three THROWS.** That is the gate: the ledger cannot grow a seventh
vocabulary word without someone deciding how it counts. **Practical consequence — introducing a new
`status=` string in `docs/known-gaps.md` will break CI Stage 1 by design.** Add it to the right set
in `scripts/state.ts` in the same commit.

Author intent is preserved rather than normalized — `ruling-gated` is not rewritten to `open`,
because the distinction is real to a human reading the entry. Only the COUNTING semantics are
decided in the script. (Design rationale: a closed list that silently drops what it does not
recognise fails the `pa-base` §8 gate test — a gate whose blind spot is invisible is not a gate.)


**#485 (S334) added THREE ledger-integrity fixes, and each one is a distinct silent-omission class.
Together they are the argument for treating a probe as code-bearing.**

**(1) The marker parser TRUNCATED on an internal `>`.** The `@gap` attribute bag was matched with
`[^>]*?`, so a marker whose `prov=`/`locus=` value contains a literal `>` — a code literal like
`<msg> = ""`, or a `->` arrow — was cut at the internal `>` and **silently dropped from the count**.
Witnessed on a real marker on main. It is now `[\s\S]*?`; non-greedy still stops at the first `-->`,
so a well-formed marker is unaffected. **A character class that excludes a delimiter is a truncation
bug waiting for prose that contains it.**

**(2) Duplicate `@gap` ids DOUBLE-COUNTED.** The counts are per-ENTRY, but an entry may carry two
`@gap` markers sharing one id, and marker-granular counting counted both. `gapCountsFromTokens` now
dedupes to one token per id (first wins). **A same-id pair that fully AGREES collapses silently; a
pair with DIFFERING sev/status THROWS LOUD** — the count cannot resolve which is the entry's real
state, so guessing would be worse than failing. Same posture as this file's other silent-omission
guards.

**(3) Heading-vs-marker status drift is now DETECTED — and it is WARN-only ON PURPOSE.** Each entry
carries both a machine `@gap` marker and a human `### ` heading whose trailing `…; <SEV>; <status>`
span can drift from it (a fix flips the marker to `resolved` and leaves the heading reading `open`,
or the reverse). `state.ts` derives counts from the MARKER, so the CI gate passes while **the line a
human greps is wrong.** `headingMarkerDrift()` reports the disagreement; `open`/`deferred`/`nominal`
collapse to "open-ish" and only open-ish-vs-`resolved` counts, and only headings with a parseable
structured status tail are checked, so free-text headings never false-fire. **It never gates**:
pre-existing drift exists, a hard gate would block CI, and this is doc hygiene rather than a
currency guarantee. **At `616688ea` it reports 13 DRIFT** — up from the 10 the prior map generation
recorded as a Key Fact. See non-compliance.report.md.

**Also WARN-only in the same `--check` output, and worth knowing at boot:** `maps: N commits behind
HEAD (watermark <stamp>, HEAD <head>)`. **It reads the watermark off LINE 3 of `primary.map.md` and
does `git rev-list --count <watermark>..HEAD` with NO ancestry check** (invariant 48) — against an
off-main stamp it prints a number that means nothing and prints it as a staleness figure. Nothing
fails either way. At the start of this pass it read **19 commits behind**.

## Section audit (build.map.md, pre-f92d1a8fb → this file)
| old section | disposition |
|---|---|
| dated `S4xx — … DELTA` / `ZERO DIFF FOR THIS MAP` blocks and the stacked header stamps | dropped: dated stamp blocks |
| Development Commands (root package.json scripts) | now lives in build.map.md "Development Commands (package.json scripts)" — re-read from package.json at f92d1a8fb |
| Packaging — scrml is PUBLISHABLE as of this window (`171f5f23`) | carried above as "(carried) …" (2/2 ids; anchors 0 ok/0 re-derived; flags 0) |
| scrml CLI subcommands (compiler/src/cli.js -> commands/*.js) | carried above as "(carried) …" (13/13 ids; anchors 0 ok/0 re-derived; flags 0) |
| `--module-format=classic\|esm` (ESM-chunks arc U1-U3) | carried above as "(carried) …" (1/1 ids; anchors 0 ok/0 re-derived; flags 0) |
| WHICH GATE RUNS WHICH TEST TIER — and the two greps that give the wrong answer (NEW section, S396) | no longer true — S396 runner table (gate ran unit+conformance; integration/commands only in non-blocking tracking; windows continue-on-error). At f92d1a8fb unit/integration(+lsp+commands)/browser/slices/windows/postgres-live are separate blocking jobs; now lives in build.map.md "CI/CD Pipeline" |
| Public-claim gates (S280) | carried above as "(carried) …" (2/2 ids; anchors 0 ok/0 re-derived; flags 1) |
| `scripts/boot.ts` — the executable boot read-set gate (NEW #492/#493/#498) — NOT a CI gate | carried above as "(carried) …" (3/3 ids; anchors 0 ok/0 re-derived; flags 0) |
| `scripts/issue-debt.ts` — the adopter-issues obligation probe (NEW #536, S346) — NEVER a gate, never in CI | carried above as "(carried) …" (3/3 ids; anchors 0 ok/0 re-derived; flags 0) |
| `scripts/dpa-debt.ts` — the deliberation-queue probe (NEW #507) — NEVER a gate, never in CI | carried above as "(carried) …" (1/1 ids; anchors 0 ok/0 re-derived; flags 0) |
| `scripts/source-text-regex-census.ts` — the post-AST source-text rule's probe (NEW #513) — deliberately NOT a CI gate | carried above as "(carried) …" (4/4 ids; anchors 0 ok/0 re-derived; flags 0) |
| PR review-floor tracker — `scripts/review-debt.ts` (NEW, S316) — NOT a CI gate | carried above as "(carried) …" (1/1 ids; anchors 0 ok/0 re-derived; flags 0) |
| Wide-corpus emit-differential + dual-goggle syntax gate — `scripts/corpus-emit-differential.ts` + `scripts/corpus-check-goggles.js` (NEW #42 | carried above as "(carried) …" (1/1 ids; anchors 0 ok/0 re-derived; flags 0) |
| `scripts/native-parser-flip-harness.ts` — THE NATIVE-PARSER DEFAULT-FLIP METER (NEW #870, `94572819`, S402) — **NOT a CI gate, and it MUTATE | no longer true — scripts/native-parser-flip-harness.ts does not exist at f92d1a8fb (and `--parser=scrml-native` is retired, compile.js) |
| ⛔ SPLIT ON `/\r?\n/`, NEVER ON A BARE `"\n"` — four boot/gate probes were BLIND on every Windows clone (NEW section, S402, #848 `c516aadc`) | carried above as "(carried) …" (0/0 ids; anchors 0 ok/0 re-derived; flags 0) |
| Content-addressed build assets + cache headers (S265, adopter #82, PR #96) | carried above as "(carried) …" (4/4 ids; anchors 0 ok/0 re-derived; flags 0) |
| CI/CD Pipeline  [.github/workflows/ci.yml] — ⛑ S391: ONE NEW **BLOCKING** STEP (the compile-floor gate, in `gate`). The prior-window note be | no longer true — S391 job/step topology (14-step `gate`, non-blocking windows/tracking); now lives in build.map.md "CI/CD Pipeline" (re-read from ci.yml at f92d1a8fb) |
| Gate topology — the two failure modes, and why they pull in opposite directions | carried above as "(carried) …" (0/0 ids; anchors 0 ok/0 re-derived; flags 2) |
| CI/CD Pipeline  [.github/workflows/advisory-review.yml] — **DISABLED THIS WINDOW (#351)** | now lives in build.map.md "Other workflows" (still workflow_dispatch-only) |
| CI/CD Pipeline  [.github/workflows/cloud-maps.yml] — **STAGE 2 DELETED; NO SCHEDULED MAP REFRESH** | no longer true in part — cloud-maps no longer has a Stage 1 writer either (S474); now lives in build.map.md "Other workflows" |
| Gap-status vocabulary + LEDGER INTEGRITY — `scripts/state.ts` (CHANGED S299; THREE more integrity fixes #485, S334) | carried above as "(carried) …" (6/6 ids; anchors 0 ok/0 re-derived; flags 1) |
| Git Hooks (source-controlled, `.git/hooks/pre-commit` + `pre-push`; install via `scripts/git-hooks/install.sh`) | now lives in build.map.md "Git hooks" (re-read from scripts/git-hooks/README.md at f92d1a8fb) |
| Docker | now lives in build.map.md "Docker" |
| Tags | replaced by the new footer |
| Links | replaced by the new footer |

## Tags
#scrml #map #build #ci #github-actions #hooks #generated-regen

## Links
- [primary.map.md](./primary.map.md)
- [test.map.md](./test.map.md)
- [infra.map.md](./infra.map.md)
- [bootstrap.map.md](./bootstrap.map.md)
- [master-list.md](../../master-list.md)
- [pa.md](../../pa.md)
