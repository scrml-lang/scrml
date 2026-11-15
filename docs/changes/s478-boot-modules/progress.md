# s478-boot-modules progress

Lane: bootstrap only (impl#2, `compiler/self-host-v2/`). Cluster C5 of the S478 triage (10 FAILs).
Gaps: `g-boot-reexport-from-s473`, `g-boot-import-cycle-unreported-s473` — both flipped to resolved.

## SPEC read (quoted in the PR body)

- §21.3: "Circular imports SHALL be a compile error (E-IMPORT-002). The compiler SHALL detect cycles in
  the import graph before any stage runs and report all files in the cycle." — ALL import cycles, not
  only re-export ones (no ambiguity: §21.3 names no allowed cycle).
- §21.4 (ratified S458, S462 Q19): named / renamed / star re-exports link like imports; explicit wins over
  stars; ambiguous star names are not exported (E-IMPORT-004 naming the stars); diamonds are not
  ambiguous; re-export edges are import-graph edges (E-IMPORT-002); a named re-export of a missing name is
  E-IMPORT-004 at the re-export; a missing re-export file is E-IMPORT-006 at the re-export and the names
  only it could supply are not reported again; `scrml:` / `vendor:` / `.js` stars are not expanded;
  a named re-export from `scrml:` is checked.

## Built

- ast.scrml: `AImport.re: ALink` (`Import | Reexport | ReexportAll | ExportList`). An enum, not a string
  (slice-m2 parse.test.js "§4 — no string outside literals").
- parse.scrml: `parseExportList` (from `parseLogicItem`'s export head); the `<program>`-body export head
  sends `export {` / `export *` to a Line-stopped region (a statement, like `import`).
- link.scrml: `reexportsOfItems`, `localExportsOfItems`, `linkFromsOfItems` (imports + re-exports — the
  link order's edges); `importCycles` (BFS shortest cycle through each file).
- analyze.scrml: `exportTables` / `exportTable` (per-file export namespace), `exportMiss`, linkage +
  namespace members + `importBringing` + `exportedBy` read the tables; `checkReexports`,
  `checkLocalExports` (E-EXPORT-001 for a cell; INTERIM refusal otherwise), `checkExportClashes`
  (E-SCOPE-010, PA reading), E-IMPORT-002 per cyclic file (`cycleWhy`).
- slice-m2/lowered.js `importFroms`: follows re-exports (stdlib module supply + scrml-boot closure).
- conformance/cases/module/*: the §21.4 aux fixtures gain their dpa-073 `;` (S473 D30 precedent).

## Measurements

- Corpus: 3,146 files (`git ls-files -- conformance/cases samples examples compiler/self-host-v2/acceptance`,
  `*.scrml`), each compiled by the bootstrap front end WITH its relative import / re-export closure
  (82 multi-file closures), base vs lane, per-file Error `code|file|start` sets: 0 newly rejecting,
  0 newly accepting, 51 changed. New E-IMPORT-002 only in deliberate negative fixtures (4
  conformance module cases + `samples/compilation-tests/gauntlet-s19-phase1-decls/phase1-import-circular-020.scrml`).
- self-host-v2/*.scrml (27 files): their 65 import statements, read by the bootstrap parser
  (link.parseProgram over each file's import lines — a full parse of the 76k-line sources through the
  bootstrap parser had not finished after 4 minutes and was stopped), 65 edges, `importCycles`: 0 cycles. impl#1
  builds the bootstrap bundle from these sources as before (every slice suite ran on it).
- Conformance (bootstrap): PASS 343 -> 352, FAIL 260 -> 250, UNSUPPORTED 638 -> 639; 10 verdicts changed,
  all C5 (9 FAIL -> PASS; e-import-004-stdlib-reexport-missing-name-reject FAIL -> UNSUPPORTED, its source is
  the server-only `scrml:crypto`). No other verdict changed.
- host-global-scan `--check --roots conformance/cases/module`: no new impl#1 throw (the 2 throws are pinned).

## Tests

- New: slice-m4/reexport-cycles-s478.test.js (34 tests; runtime for re-exported fn / struct / enum / const).
- Updated pins: import-alias-s474 (renamed re-export now RUNS), namespace-import-s475 (re-exported member
  is a member), boot-file-scope-own-value-s475 (cross-file value cycle also E-IMPORT-002).
