# progress — s474-s34-census-scrml-symbols (append-only)

- Started at the worktree; base = origin/main 34ebef81d. No existing tests for s34-census (grep of compiler/tests, scripts: none).
- Base measurement (base script, `--check-new --base <empty tree>` = every SPEC table row): 2 STALE — E-CLASS-NOT-IN-SCRML, E-DYNAMIC-IMPORT-NOT-IN-SCRML (both name `compiler/self-host/`, retired S447). Pre-existing.
- Extracted the resolver to scripts/s34-provenance.ts (pure, testable); census imports it. Added `--check-all` (every §34 row; measurement, not CI).
- Stripper iterations, each measured:
  1. JS strings+templates blanked → 2 false STALE (E-PROTECT-005: a regex literal with a backtick in protect-egress.ts foldIdent opened a template and hid findAuthoredResponseConstruction; W-LEAK-010: `_scrml_idempotency_keys` lives in template-literal SQL). Fix: regex-literal recognition; template-literal text KEPT (emitted code; runtime-template.js has 259 runtime defs inside one template).
  2. scrml markup/logic split (`${}` + `<program>`) → missed 2 of 13,666 defs: the current item-position library surface (brand-theme.scrml `export function` at file scope). Dropped the split: read file whole, blank comments + literal contents.
  3. Final: 0 of 13,666 top-level fn/function/class defs across scanned trees hidden; --check-all: 2 STALE (same as base), 289 citations resolved (path-sym 165, path-paren 42 + 28 .scrml, via 28, in 26). Default census --json identical base vs head.
