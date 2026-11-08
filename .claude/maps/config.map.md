# config.map.md
# project: scrml
# updated: 2026-11-08T16:47:39Z  commit: f92d1a8fb
# Key names only. No `.env.example` / `.env.template` exists in the repo; keys below come from `process.env.*` greps of tracked source.

## Environment Variables — read by emitted programs (impl#1 output)
PORT — optional — server port of a `scrml build` output (commands/build.js :796; default 3000)
SCRML_DATA_DIR — optional — root for SQLite file targets in built output (codegen/sqlite-file-target.ts :81, commands/build.js :554); `scrml dev` ignores it and unsets it (commands/dev.js :1934)
NODE_ENV — optional — `production` disables the dev-only MCP boot (commands/build.js :896, compute-program-config.ts, attribute-registry.js)
SCRML_MCP_WATCH — optional — `1` enables the MCP watch in built output (commands/build.js :904)
JWT_SECRET — app-defined — shown in doc comments of stdlib/auth/jwt.scrml (`signJwt` / `verifyJwt`); not read by the compiler

## Environment Variables — compiler / tooling
SCRML_PORT — optional — `scrml serve` port (commands/serve.js :87, default 3100; serve-client.js)
SCRML_BOOT_CACHE_DIR — optional — bootstrap bundle cache dir (scripts/scrml-boot.ts); fallbacks XDG_CACHE_HOME/scrml/boot-bundle, ~/.cache/scrml/boot-bundle. Must be per-user (the bundle is executed)
XDG_CACHE_HOME — optional — see above
NO_COLOR — optional — plain diagnostics from scrml-boot
SCRML_BOOT_SRC_LOG / SCRML_BOOT_DIAG_LOG — optional — debug logs in slice-m1/harness.js
SCRML_BOOT_LSP_TEST_FAULTS — test-only — fault injection in lsp-boot/server.ts
SCRML_PROTECT_FLOW_DEBUG — optional — debug output of codegen/protect-flow.ts
SCRML_EQ_FALLBACK_LOG — optional — logs string-equality lowering fallbacks (codegen/string-equality-lowering.ts)
INBOX_DEBT_REMOTE — optional — remote for scripts/inbox-debt.ts
SCRML_HOOK_SLOTS / SCRML_HOOK_SHARDS / SCRML_TEST_TIMINGS — optional — scripts/test-sharded.ts (hook sharding)
CI / GITHUB_STEP_SUMMARY / GITHUB_REPOSITORY — set by Actions; read by CI scripts

## Environment Variables — tests
TMPDIR / TEMP / TMP — set per run by compiler/tests/helpers/tmp-root-preload.js (bunfig preload) to ~/.cache/scrml-test-tmp/<pid>-<rand>; base override SCRML_TEST_TMP_BASE
SLICE_CORE — `lowered` re-runs slice-m1 on lowered programs (slice-m1/cores.js)
SCRML_TEST_PG_URL — Postgres URL for slice-m4 pg-*-s475 tests (the role needs CREATE TABLE); unset = those tests skip
SCRML_TEST_PG_REAL — `1` in CI postgres-live: a real server (not PGlite) is expected
SCRML_PGTEST — `0` skips the PG tests (slice-m4 pg-*, integration/db-authoritative-p2-pg)
SCRML_CHROMIUM / SCRML_BROWSER_TESTS — enable the slice-m4 `*-chromium-*` tests
SCRML_RACE_BUILDS — slice-m4/scrml-boot-output-hardening-s475.test.js
REDIS_TEST_URL — stdlib redis unit test
MUTATIONS_PROOF / MUTATIONS_ONLY — slice-m1/bench/mutations.js
Other names seen in tests (SECRET, HMAC_KEY, API_KEY, DB_URL, APP_MODE, SCRML_TEST_TOKEN, SCRML_HOST, …) are fixture strings for secret-diagnostic and protect-flow tests, not configuration.

## Feature Flags
No runtime feature-flag system. Program-level switches are SPEC attributes (e.g. `<program reset="none">` §65.3.4, `kind="tool"` §64; `kind="service"` §68 is DRAFT and unimplemented).

## Config Files
### package.json
scripts: see build.map.md; engines.bun: >=1.3.13; bin.scrml: compiler/bin/scrml.js; files: the publish allowlist (compiler/{bin,src,native-parser,runtime}, stdlib, README.md, LICENSE)
### bunfig.toml
[test].root: compiler/tests/ (a plain `bun test` never reaches compiler/self-host-v2); [test].preload: tmp-root-preload.js. There is deliberately no timeout key (bun's default is 5000 ms per test)
### scrml.toml (project manifest, SPEC §22.13)
[capabilities].host-import: the `self-host-only` policy (`import:host` allowed only under stdlib/; everything else gets E-IMPORT-008)
### .github/windows-baseline.json
entries: [{file, test, gap, reason}]; every gap must be an open id in docs/known-gaps.md
### .gitattributes
the `scrml-generated` merge driver for generated blocks (install: scripts/install-merge-driver.sh)
### e2e/playwright.config.ts, e2e/playwright.docs.config.ts
Playwright projects (chromium, firefox, webkit installed by `bun run e2e:install`)
### Secrets used by CI (names only)
MAPS_PAT — the generated-regen bot's push/PR token (.github/workflows/generated-regen.yml; a fine-grained PAT, Contents + Pull-requests R/W; a GITHUB_TOKEN-opened PR would not trigger `gate`). When it lapses the bot goes red at checkout and blocks drift until renewed (`gh workflow run generated-regen`).
ANTHROPIC_API_KEY — advisory-review.yml only, which is workflow_dispatch-only since S310 (cost decision); treat as unset / not required

---

# Carried detail (pre-f92d1a8fb body sections)
The sections below are the previous map generation's body (mostly impl#1, `compiler/src`), carried rather than lost. They were NOT re-read line by line. Each carries a verification line from f92d1a8fb: code identifiers checked to exist, `symbol` :line anchors re-derived by grep, cited paths checked, cited gaps whose marker is no longer `open`, and STALE-RISK flags for the CI/bot facts that changed in S468–S475. Where a carried section disagrees with a refreshed section above, the refreshed section wins.

## (carried) `compilerSettings` — the SPEC §28 `lint.*` suppression knobs (an API option, NOT env vars)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 2/2 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
`compileScrml({ compilerSettings: { … } })` accepts a small, closed set of lint-suppression keys.
They mirror the spec-only `lint.*` config family at SPEC §28; **unknown keys are silently ignored**,
and there is no config FILE loader in this repo — an adopter's own project loader passes the object.

| Key | Values | Default | Suppresses |
|---|---|---|---|
| `lintTailwindUnrecognizedClass` | `"warn"` / `"off"` | `"warn"` | `W-TAILWIND-UNRECOGNIZED-CLASS` — for codebases relying on custom CSS class names, where the lint produces acknowledged false positives (SPEC §26.5 / §34) |
| `lintForeignUndeclaredCapability` | fires / `"off"` | fires | `W-FOREIGN-UNDECLARED-CAPABILITY` — the §23.5.5 presence-nudge, for an author who genuinely wants an undeclared foreign scope |

Declared at `compiler/src/api.js` (~:751-766); read at ~:1039. See error.map.md for both codes.

## (carried) Runtime constants in the emitted client (compile-time literals, NOT config)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 3/3 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
`_SCRML_NAV_CHUNK_TIMEOUT_MS` — the cross-chunk soft-nav script-load budget before falling back to a
hard navigation (`W-NAV-CHUNK-LOAD-FAILED`, §20.8.2/§20.8.7). Baked into `runtime-template.js`; not
author-settable and not an env var. Likewise the DB-authoritative GUC names (`scrml.tenant`,
`scrml.principal.caps`) and role/policy names (`scrml_app`, `scrml_tenant_iso`) are exported string
CONSTANTS in `schema-differ.js`, not configuration.

## (carried) Config Files
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 0/0 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. Paths cited that do NOT exist at f92d1a8fb: `compiler/src/unit-cc-exemption-list.json`, `compiler/tests/parser-conformance-within-node-allowlist.json`._

### bunfig.toml  [repo root]
`[test]` section: test root = `compiler/tests/` — **and deliberately NO `timeout` key (#537, S346).**
The file carried `timeout = 10000` from the initial split until S346 and **bun does not read
`[test].timeout`** — the effective per-test budget was always bun's default **5000 ms**. ⚠ The prior
generation of this map printed `timeout = 10000ms` as if it were live configuration; **that claim was
wrong at every stamp that carried it**, not merely stale. The standing rule (stated in the file
itself): a test/hook that legitimately runs multi-second declares its own budget at the site
(`test(name, fn, { timeout })` / `beforeAll(fn, { timeout })`) with a comment saying why; the only
per-run knob is the CLI flag `bun test --timeout <ms>`. **Do NOT re-add a key to widen the default
silently** — `scripts/browser-baseline.ts` gates on the browser tier's failure NAME SET, and a
timed-out test produces the same `(fail) <name>` marker as a failed assertion.

### ~~compiler/src/unit-cc-exemption-list.json~~ — ⛑ S445: DELETED (#1196); entry SUPERSEDED
List of unit-test files exempted from code-coverage enforcement (currently empty array).

### compiler/tests/parser-conformance-within-node-allowlist.json
Per-file allowlist of native-parser-vs-live-pipeline within-node divergence counts (COUNT-LENGTH / EXTRA-FIELD / FIELD-SHAPE buckets), maintained per GITI-024 shape-change tracking.

## Section audit (config.map.md, pre-f92d1a8fb → this file)
| old section | disposition |
|---|---|
| dated `S4xx — … DELTA` / `ZERO DIFF FOR THIS MAP` blocks and the stacked header stamps | dropped: dated stamp blocks |
| Environment Variables (referenced directly in compiler/src / lsp / scripts / e2e source) | now lives in config.map.md "Environment Variables — …" (three sections, re-grepped at f92d1a8fb; a superset) |
| Feature Flags | now lives in config.map.md "Feature Flags" |
| `compilerSettings` — the SPEC §28 `lint.*` suppression knobs (an API option, NOT env vars) | carried above as "(carried) …" (2/2 ids; anchors 0 ok/0 re-derived; flags 0) |
| Runtime constants in the emitted client (compile-time literals, NOT config) | carried above as "(carried) …" (3/3 ids; anchors 0 ok/0 re-derived; flags 0) |
| Config Files | carried above as "(carried) …" (0/0 ids; anchors 0 ok/0 re-derived; flags 0) |
| CI Secrets (GitHub Actions repo secrets, NOT env vars in source — names only) | no longer true in part — MAPS_PAT is consumed by generated-regen.yml, not cloud-maps.yml; now lives in config.map.md "Secrets used by CI" |
| Tags | replaced by the new footer |
| Links | replaced by the new footer |

## Tags
#scrml #map #config #env #bunfig #scrml-toml

## Links
- [primary.map.md](./primary.map.md)
- [build.map.md](./build.map.md)
- [test.map.md](./test.map.md)
- [master-list.md](../../master-list.md)
- [pa.md](../../pa.md)
