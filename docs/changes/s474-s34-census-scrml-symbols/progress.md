# progress — s474-s34-census-scrml-symbols (append-only)

- Started at the worktree; base = origin/main 34ebef81d. No existing tests for s34-census (grep of compiler/tests, scripts: none).
- Base measurement (base script, `--check-new --base <empty tree>` = every SPEC table row): 2 STALE — E-CLASS-NOT-IN-SCRML, E-DYNAMIC-IMPORT-NOT-IN-SCRML (both name `compiler/self-host/`, retired S447). Pre-existing.
- Extracted the resolver to scripts/s34-provenance.ts (pure, testable); census imports it. Added `--check-all` (every §34 row; measurement, not CI).
- Stripper iterations, each measured:
  1. JS strings+templates blanked → 2 false STALE (E-PROTECT-005: a regex literal with a backtick in protect-egress.ts foldIdent opened a template and hid findAuthoredResponseConstruction; W-LEAK-010: `_scrml_idempotency_keys` lives in template-literal SQL). Fix: regex-literal recognition; template-literal text KEPT (emitted code; runtime-template.js has 259 runtime defs inside one template).
  2. scrml markup/logic split (`${}` + `<program>`) → missed 2 of 13,666 defs: the current item-position library surface (brand-theme.scrml `export function` at file scope). Dropped the split: read file whole, blank comments + literal contents.
  3. Final: 0 of 13,666 top-level fn/function/class defs across scanned trees hidden; --check-all: 2 STALE (same as base), 289 citations resolved (path-sym 165, path-paren 42 + 28 .scrml, via 28, in 26). Default census --json identical base vs head.
- Committed resolver (327a6bcdc). Added compiler/tests/unit/s34-census-provenance-s474.test.js (26 tests).
- End-to-end bite (row injected after E-CSS-SYNTAX in working-tree SPEC, `--check-new --base origin/main`, base script vs head; test file moved aside for the base run — see note):
  correct path-sym: base FAIL / head PASS · correct path-paren: base PASS / head PASS · renamed path-sym: base FAIL / head FAIL · renamed path-paren: base PASS (silent) / head FAIL · tree-only symbol cited in wrong file: base PASS / head FAIL.
  Note: with the new test file present, base's "correct path-sym" PASSED — base counts string contents, and the test's template literals spell `resolveSlot`. Tree-wide (via/in) forms still read compiler/tests template text (pre-existing scope; deferred to PA).
- r1 (PA review of 1e8d3a09a):
  - F1: string contents KEPT in both languages (comments-only blanking, as base did for JS); strictness = per-file scoping. Chosen over a `_scrml_` allowlist: emitted code in strings is not only `_scrml_*` (and a codegen file citing a helper it emits a CALL to would still fail under any blanking). Regex literals tracked, text kept. All-definitions test (independent oracle, >10k defs incl. quoted/template lines): 0 misses; bites when "…" blanking is restored.
  - F2: buildTreeIdents skips isTestPath (tests/__tests__/test/fixtures/acceptance dirs, *.test.*/*.spec.*); SCAN_ROOTS moved to the module.
  - F3: compiler/tests/unit/s34-census-check-all-s474.test.js runs `--check-all --json`; fails against the base census.
  - Q3: `, / + and`-joined list in the parenthesis checked against the path. F4: non-source path/dir → STALE "cite the source file". Nit: "checked".
  - Bare filenames: sibling of last full path, else unique non-test repo match, else STALE. 20 §34 bare citations, all resolve. `control-015-try-catch.scrml` is in a §19.4.3 provenance blockquote (SPEC ~21194), not a §34 row; the file exists at samples/compilation-tests/.
  - --check-all head: 326 citations checked (path-sym 165, path-paren 47 + 40 .scrml, bare-sym 19 + 1 .scrml, via 28, in 26); stale = the same 2 as base → 0 of 1117 newly failing. Default census --json unchanged.
  - Filed LOW gaps g-s34-census-unparsed-citation-spellings-s474 (F5), g-s34-census-scrml-stripper-parity-s474 (F6).
- r2 (PA re-review of 5b396ad26):
  - N1: buildBasenameIndex walks SCAN_ROOTS only (was: whole repo, incl. .claude/worktrees/*). Reproduced red first by planting a copy of compiler/src + compiler/self-host-v2 at .claude/worktrees/fake in this worktree: the check-all test failed with 6 extra STALE (E-ATTR-UNQUOTED-OPERATOR, E-SCHEMA-012/013, W-AUTH-CONTENT-NOT-GATED, W-CG-SHIP-STRIP-FALLBACK, W-DISPLAY-TEXT-OVERQUOTE); after the fix, green with the copy still present. Fixture test plants duplicates under .claude/worktrees/x/ and docs/changes/; reverting the fix fails it (and 2 others).
  - isTestPath narrowed: compiler/tests/, acceptance/, fixtures/, __tests__/, *.test.*/*.spec.* (stdlib/test/index.scrml is a shipping module). --check-all unchanged: same 2 stale.
  - Bare-name errors say how the name was resolved ("resolved as sibling of `…`").
  - KNOWN_STALE failure message names the gap + fixed-row / renamed-code instructions.
  - Gaps: g-s34-census-known-stale-self-host-rows-s474, g-s34-census-string-occurrence-vouches-s474 (LOW); amended g-s34-census-unparsed-citation-spellings-s474 with samples/ + bare compiler/ paths.
