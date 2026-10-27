# progress — s471-bootstrap-stdlib-import

- 2026-10-27 start: base a8bac7248 == origin/main; bun install + pretest OK.
- 2026-10-27 baseline `bootstrap-conformance.ts` (run, not --write): PASS 251 · FAIL 63 · NOT-TWINNED 685 · UNSUPPORTED 814 (bootstrap-unsupported 499 · parse-reject 315) of 1813 — equals the committed docs/bootstrap-conformance.md.
- 2026-10-27 symptom reproduced: `import { slug } from "scrml:format"` → only `E-SCOPE-001 slug is not declared`. Also found: (a) `import { nothere } from "./lib.scrml"` INSIDE `<program>` compiled CLEAN (analyze checkImports walked only top-level items — a second silent drop); (b) a name was accepted when ANY file in the link set exported it, not the file the import names (§21.3); (c) the not-exported code was a bootstrap-local `E-IMPORT-NOT-EXPORTED` (no §34 row) where §21.6 names `E-IMPORT-004`.

## Step 1 — fail closed (DONE)

- link.scrml: `importTarget(importer, from, paths)` is THE resolver (relative → resolveFrom; `scrml:NAME` → `scrml:NAME/index.scrml` then `scrml:NAME.scrml` in the set; a relative source never crosses the `scrml:` prefix). `importedPaths` (link order) reads it; `importsOfItems` exported.
- analyze.scrml `checkImports`: every import (a `<program>`'s own included) resolves or is refused AT THE IMPORT:
  - `scrml:compiler*` → E-BOOTSTRAP-UNSUPPORTED (§41.17 KNOWN-DEFERRED)
  - other `scrml:X` not supplied → E-BOOTSTRAP-UNSUPPORTED naming the module
  - relative `.scrml` not in the build → E-IMPORT-006; relative non-`.scrml` (`.js`) → E-BOOTSTRAP-UNSUPPORTED
  - `vendor:` / `bun:` / `node:` → E-BOOTSTRAP-UNSUPPORTED; bare → E-IMPORT-005 (§41.4)
  - resolved: each name must be exported by THAT file → E-IMPORT-004 (§21.6 code; replaces E-IMPORT-NOT-EXPORTED).
  - no cascade: a use of a name that a REFUSED import brings is not also E-SCOPE-001 (`importRefusesName`; only a refused import qualifies, so a use is never left unreported).
- severity.scrml regenerated (E-IMPORT-004/005/006 now have §34 rows; E-IMPORT-NOT-EXPORTED gone).
- tests: slice-m4/imports-s471.test.js (12); slice-m2/typer.test.js BASE_66_19 lists re-pinned (two §66.19 blocks import an unsupplied `./…` file: one E-IMPORT-006 each, was 2 / 7 per-name E-IMPORT-NOT-EXPORTED; two cascade E-SCOPE-001 gone).

## Step 2 — stdlib survey (probe: each `stdlib/<m>/index.scrml` compiled as a bootstrap entry on this branch)

Class: P = pure scrml logic (no host reach beyond scrml); H = reaches JS host globals (`Math.*`, `Intl.*`, `Date`, `RegExp`, `new X`, `location`…), client-usable; S = server-only (impl#1 `SERVER_ONLY_SCRML_MODULES`, `Bun.*`, `?{}`, `bun:`). Every module also has a JS shim `compiler/runtime/stdlib/<m>.js` (impl#1 ships the shim, not the compiled `.scrml`).

| module | class | files | bootstrap errors (as entry) | what the bootstrap would need |
|---|---|---:|---:|---|
| auth | S (Bun.password, `?{}`) | 5 | 7 (parse) | host bridge + server stdlib; dialect port |
| compiler | deferred §41.17 (`import:host` ×28) | 16 | 120 | stays refused (§41.17) |
| cron | S (Bun.cron) | 1 | 20 | host bridge (server); dialect port |
| crypto | S (Bun.*, `?{}`) | 1 | 15 | host bridge (server); dialect port |
| data | S (impl#1 set) — mostly P logic, `new X` ×9 | 8 | 11 (parse) | dialect port; `Rule` enum / struct forms; host for RegExp |
| format | H (Intl ×12, Math, String.normalize) | 1 | 168 | host bridge (Intl); dialect port |
| fs | S (node fs via scrml:host safeCall) | 1 | 63 | host bridge; dialect port |
| host | H/S — IS the host bridge (safeCall) | 1 | 5 | a host bridge design (does not exist) |
| http | S (fetch) | 1 | 11 | host bridge; dialect port |
| math | H (Math.* ×11) — pure semantics | 1 | 84 | host bridge for `Math.*`, OR native rounding ops; dialect port |
| mcp | S, compiler-internal | 1 | 3 | not an app import |
| md | P+ (the `<md>` reader; host only `Math.floor` ×4, `new Set/Map` ×3) | 1 | 717 (492 missing `;`, 40 `while`, 20 `.push`) | dialect port (largest) + int halving + a set/map shape |
| oauth | S | 6 | 206 | host bridge (server); dialect port |
| path | H (node `path` via `require("path")` ×5; the `Bun.`/`?{` hits are a comment) | 1 | 84 | host bridge (or a scrml-native rewrite of basename/dirname/…); dialect port |
| process | S (process.*) | 1 | 29 | host bridge (server) |
| random | H (Math.random), not `fn`-callable | 1 | 23 | host bridge |
| redis | S (Bun.redis) | 1 | 4 | host bridge (server) |
| regex | H (RegExp) | 1 | 16 (parse) | host bridge for RegExp; dialect port |
| router | H (location/history) | 1 | 55 | host bridge (DOM); dialect port |
| store | S (bun:sqlite) | 2 | 4 | host bridge (server) |
| test | H (assertions) | 1 | 104 | dialect port; not an app import |
| time | H (Date, Intl, timers) | 1 | 330 | host bridge; dialect port |

Blockers common to ALL 22 modules (independent of host reach):
1. Every `stdlib/<m>/index.scrml` wraps its exports in a top-level `<program>`. As an imported file that is `E-BOOTSTRAP-UNSUPPORTED: a <program> outside the entry file` (analyze.scrml programStub). SPEC §21.5 / :26517 describes a library file as one with exports and NO top-level `<program>`; the wrapper is the impl#1 F1 device (progress.md F1 in self-host-v2).
2. The stdlib source is the pre-§66 dialect (kickstarter §9: "written in the older dialect"): no `;`, untyped parameters, string truthiness (`!str`, `a || "x"`), `while`, `.push`. The bootstrap speaks only the ruled language.
3. 13 modules carry inline `~{ … }` test blocks at logic-block level → E-PARSE-ITEM on the bootstrap.
4. The bootstrap has NO host bridge: a member call outside a fixed allowlist (`Math.round(…)`, `new Intl.NumberFormat`) is E-BOOTSTRAP-UNSUPPORTED, and `_{}` / `import:host` / `^{}` host code is not in the bootstrap. Per the brief, no host bridge is invented here.

Result: with the source as it stands, NO stdlib module is compilable on the bootstrap, so none can be importable yet. The minimal stdlib change (for the PA — NOT made here, per the brief) is per module: drop the `<program>` wrapper, port to the ruled dialect (`;`, typed params, explicit comparisons, `for`, `.append`), move `~{}` tests out of the module (or the bootstrap learns `~{}`), and — for every class-H/S module — a host bridge the bootstrap does not have. No module is a dialect-only port: even `path` reaches node's `path` through `require`. The nearest is `md` (pure logic; only `Math.floor` halving ×4 and `new Set`/`new Map` ×3 to replace), but it is 2.3k lines.

Caveat for a dual-implementation port: impl#1 compiles stdlib `.scrml` only for its export lists / checks (it ships the JS shims), and impl#1 does not parse §66 declaration forms. A function-only module (`;`, typed params, `for`, templates) is readable by both; the `<program>` wrapper removal must be checked against impl#1's stdlib readers (module-resolver.js `validateStdlibImports`, value-function-stored.ts, md-reader) before it lands.

## Step 3 — the resolution (DONE: mechanism; no real module is importable yet)

- `slice-m2/lowered.js` `stdlibSources(mods, files, {stdlibRoot, exclude})`: finds every `scrml:` import with the bootstrap's OWN parser (parse.scrml `parseFile` + link.scrml `importsOfItems` — no regex over source), supplies `stdlib/NAME/index.scrml` (else `stdlib/NAME.scrml`) and its relative closure under the prefix (`scrml:NAME/…`). Not supplied: the `scrml:compiler` family (§41.17), a non-stdlib name (`..`, `.`, empty segment), a module with no file.
- `frontEndStdlib(mods, files, entry, opts)`: frontEnd over files + stdlib sources; a module whose files carry an Error is WITHDRAWN (fixpoint — a module importing a withdrawn one is withdrawn next round) so its import is refused BY NAME at the import (step-1 path); stdlib-file diagnostics never reach the user. A project file named under the prefix throws (driver error).
- `scripts/scrml-boot.ts` uses it, and for each withdrawn module the user imports directly adds ONE E-BOOTSTRAP-UNSUPPORTED located at the module's first error saying why (`scrml:format … 170 errors on the bootstrap; the first: [E-STMT-MISSING-SEMICOLON] …` at stdlib/format/index.scrml:23:19). `--stdlibRoot` is an API option only (tests).
- `scripts/bootstrap-conformance.ts` uses the same driver (so its grading follows scrml-boot's).

## Step 4 — end to end (DONE)

- slice-m4/stdlib-s471.test.js (8): over a ruled-dialect FIXTURE stdlib (`slice-m4/src/stdlib-s471/`: dir form `greet` with a relative file, file form `calc`, `welcome` importing `scrml:greet`, `broken` (pre-§66), `leans` importing `broken`): client page computes the imported functions and re-computes on a write; a server function calls an imported function — route answers, client shows it over the bridged fetch; withdrawal + fixpoint; not-supplied names; the real `scrml:format` refused.
- acceptance/imports/{local-module-runs (compiles + RUNS), stdlib-format-refused, neg-not-exported, neg-missing-file, neg-bare-specifier} — all PASS.
- "One acceptance case per supported real module": none possible — zero real modules compile (step 2).

## Step 5 — bootstrap-conformance (DONE, `--write`)

PASS 251 → **253** · FAIL 63 → **50** · UNSUPPORTED 814 → **825** (bootstrap-unsupported 499 → 519 · parse-reject 315 → 306) · NOT-TWINNED 685 (=) · 1813 cases. Graded 314 → 303; hold rate 79.9% → 83.5%.
- FAIL → PASS (3): module/e-import-004-name-not-exported-reject, module/e-import-005-bare-specifier-reject, module/e-import-006-missing-file-reject (each was a silent drop / a misleading E-SCOPE-001).
- FAIL → UNSUPPORTED (10): the cases that import a `scrml:` module (module/e-import-004-stdlib-* ×3, derived/e-derived-server-only-reach-fn-path, parse-variant/* ×6) — they failed on a misleading E-SCOPE-001 and are now refused by name at the import.
- PASS → UNSUPPORTED (1): module/e-import-004-stdlib-subpath-name-clean — was a VACUOUS pass (the `scrml:` import silently dropped, nothing emitted); now honestly refused.

## Gaps (for docs/known-gaps.md — PA files; id · sev · locus · symptom)

- `g-boot-stdlib-none-compiles` · HIGH (blocks the operator's goal) · stdlib/*/index.scrml · no stdlib module compiles on the bootstrap: top-level `<program>` wrapper (E-BOOTSTRAP-UNSUPPORTED "a `<program>` outside the entry file"), pre-§66 dialect, `~{}` tests, host reach with no bootstrap host bridge. Every `scrml:` import is refused by name.
- `g-boot-no-host-bridge` · HIGH · compiler/self-host-v2/analyze.scrml (member-call allowlist) · the bootstrap has no `_{}` / `import:host` / `^{}` / host-global surface; 20 of 22 stdlib modules need one (math, format, time, regex, random, router, every server module).
- `g-boot-flat-link-namespace` · MED · analyze.scrml `fnNamed` ("the bootstrap links one namespace") · an imported module's functions are reachable whether or not they are imported (import is checked, scope is not), and a user name that collides with a stdlib module's name is a redeclare that WITHDRAWS the module — reported as "does not compile on the bootstrap", a misattribution. Fail-closed, but the wrong reason.
- `g-boot-unknown-stdlib-code` · LOW · analyze.scrml `importRefusal` / lowered.js `stdlibSources` · `scrml:nope` (no such module) is E-BOOTSTRAP-UNSUPPORTED, where §41.5 / §41.11 name E-IMPORT-006; the pure compiler cannot tell "no such module" from "not supplied" — the driver can.
- `g-boot-import-alias` · LOW · parse.scrml `parseImport` · `import { a as b }` reads `as` and `b` as imported names (fails closed as E-IMPORT-004, wrong code); no alias form in the bootstrap.
- `g-boot-stdlib-printer-refusal-unattributed` · LOW · scrml-boot.ts · a printer (checkCore) refusal caused by stdlib code carries no file, so it cannot be attributed to the module / withdrawn.
- observation (impl#1, out of scope): module-resolver.js `resolveModulePathNative` resolves `scrml:` to the bundled stdlib only — §41.5 tier 2 (`vendor/scrml/<name>` takes precedence) is not implemented. The bootstrap does not implement it either.

## Open questions for the PA

1. Is a stdlib library module wrapped in `<program>` canonical? §21.5 / :26517 describe a library file as exports with NO top-level `<program>`; every stdlib module has one (the impl#1 F1 device). The bootstrap refuses a non-entry `<program>`. Recommendation: drop the wrapper in the stdlib (one-line per module) rather than teach the bootstrap that a non-entry `<program>` is a library — the latter would give `<program>` two meanings.
2. Port order: no module becomes importable with a dialect port alone. `md` is closest (pure; three host spots); everything else waits on a host-bridge design for the bootstrap — which this lane did not invent (brief: stop and report). That design is the real next wall.

