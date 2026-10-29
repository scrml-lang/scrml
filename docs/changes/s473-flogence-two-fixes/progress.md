# s473-flogence-two-fixes — progress (append-only)

Source: flogence S60 → scrml, `origin/inbox:handOffs/incoming/2026-10-29-from-flogence-S60-to-scrml-re-S473-note-not-delivered.md`.

## 2026-10-29 — part 1: scrml-boot sourceClosure quote style
- Measured on base `66242067a`: `scrml-boot compile` of a file with `import { listArcs } from '../graph-read.scrml'`
  → `E-IMPORT-006: ../graph-read.scrml does not resolve to a .scrml file in this build (§21.3)`.
  Cause: `scripts/scrml-boot.ts` `IMPORT_RE = /\bfrom\s*"(\.\.?\/[^"]*\.scrml)"/g` (double quotes only).
- Fix: the closure reads each file's imports with the bootstrap parser (`mods.parse.parseFile` +
  `mods.link.importsOfItems`, the reading `lowered.js` `stdlibSources` already uses). No regex.
  `sourceClosure` now takes the loaded bundle's `mods` (its one caller, `compileSource`, loads it first).
- Other import scanners checked: `scripts/host-global-scan.ts:114` (accepts both quotes; scans impl#1
  output closure — not a bootstrap path, left); `compiler/self-host-v2/slice-m2/lowered.js` stdlibSources
  (parser-based already); link.scrml / analyze.scrml resolve through the parser's AImport (quote-agnostic).
  No other `.scrml`-import regex in scripts/ or self-host-v2 harnesses.
- Tests: `compiler/self-host-v2/slice-m4/scrml-boot-import-quotes-s473.test.js` — 5 tests, 3 red on base
  (single-quoted, transitive `'../x'`, import-in-comment/string not followed), 5 green after.
