# s473-boot-one-name-per-program — progress (append-only)

Branched from origin/s473-boot-rulings-names-trap-lint (PR #1636, 6cfdcd991), per dispatch.

Ruling (verbatim, ../scrml-support/user-voice-scrml.md "⭐ RULED — S473 owner questions round 2, PA recs", item 5):

> 5. **One name per program for every user declaration** (extends the §7.6 uniform E-SCOPE-010 ruling past file scope).

## 2026-10-29T06:40Z — tests first

`compiler/self-host-v2/slice-m4/rulings-s473-one-name.test.js`: 21 tests; on base (6cfdcd991) 13 red, 8 green
(the green ones pin what must hold: imports, locals / params / loop binders, distinct names, the stdlib exclusion,
the one-file rule, two components keep E-COMPONENT-NAME-DUPLICATE, const+cell keeps E-NAME-COLLIDES-STATE).

Settled questions (each a default, none a one-way door: the change is newly-rejecting, so reversible):
- "program" = every file the compiler links (the CLI: the entry plus its import closure, scrml-boot sourceClosure).
- a private (non-exported) name colliding with another file's name: REFUSED ("every user declaration").
- locals, params, loop binders: not program-level, shadowing unchanged.
- imports: name a declaration made elsewhere, never a second binding.
- stdlib: not user declarations. A stdlib file's names are not compared with other files' (a stdlib file still
  binds each name once in its file). §7.6 says nothing of stdlib; the ruling's word "user" decides.
- host bindings: `import:host` is stdlib-only (E-IMPORT-008), so no user file has one.
- program cells: included (dispatch lists "cell"; #1636 review LOW-4 flagged cell+fn silent).

Base corpus measurement (bootstrap compileSource on every .scrml entry under examples/ samples/ benchmarks/
conformance/cases, 2811 entries): ~/.cache/scrml-agent-tmp/s473-boot-one-name-per-program/base.json.

## 2026-10-29T07:20Z — implemented

analyze.scrml: `fileNameClashes(files, t, lk)` now compares every program-level binding (declaration, type,
function, constant, and now program cell) across the whole program. It skips cross-file pairs that involve a
stdlib file. It reports once per later binding ("first" = earlier in link order, then in source order), naming
the first binding and its file. A pair another pass already reports is skipped so it is reported once: two
functions in one file (dupFns), two declarations in two files (dupDecls), cell+cell / cell+visible decl (dupFields),
const+cell in one file (dupConsts, E-NAME-COLLIDES-STATE), and a file that imports a name from the file that binds it
and also binds it (linkage, at the import; not for a cell, which linkage does not know).
`dupDecls`: a non-component pair from two user files is now E-SCOPE-010. A pair involving a stdlib file stays E-BOOTSTRAP-UNSUPPORTED.

Governing sentence written (SPEC §7.6, new bullet after the S473 file-scope one):
"**One name per program for every user declaration (S473 ruling).** A program-level name (a `const`, a `function`,
a `type`, a user declaration (`<card>`), or a program cell (`<count:int=0/>`)) SHALL be bound once in the program.
A second binding of that name in any user file of the program is a compile error (E-SCOPE-010), of the same kind
or another, exported or not. …"
The S473 file-scope bullet lost "Two files MAY each bind a name". §34 E-SCOPE-010 row and §21.2 note were extended. No new code.

Pins moved (s472/s473 tests that compiled a now-refused pair): rulings-s473-names (2), visibility-s472 (5; plus a
new "same name imported twice from ONE file" test that keeps the W-IMPORT-001 runtime pin), logic-block-const-s472 (1),
loop-wait-s471 (renamed `function total` beside `<total>` to `totalOf`; the test was not about names).
Gaps closed: g-boot-decl-same-name-noncomponent-s473, g-boot-imported-const-like-cell-s472.

Corpus: bootstrap compile of all 2811 .scrml entries (examples, samples, benchmarks, conformance/cases), base
vs head: 0 newly rejected, 0 code changes (68 of 2811 compile clean on the bootstrap either way). The
bootstrap-conformance report did not change (`--check` current). corpus-compile-floor is impl#1 (frozen, untouched).

## 2026-10-29T07:50Z — slices, gates, corpus re-measured

slice-m2 (typer.test.js 5, typer-s440.test.js 4 expectations): the s472 "legal: two files, two scopes" pins and a
cell `card` beside another file's `<card>` are now E-SCOPE-010. The twins still prove that each file's uses resolve
to its own declaration (E-TYPE-031 is reported against the file's own `helper` / `<box>`). typer-s440 r4 (c):
`function s` beside the CELLS fixture's `<s>` was renamed `sOf`.

Corpus re-measured on the final build: 0 newly rejected out of 2811 entries; the conformance report is current.
Heuristic source scan (scratchpad scan.ts / scan2.ts, not a compile):
- multi-file closures with a same-named function / type in two files: 0.
- files with a V5 `<x> = init` cell AND a function of its name in one file: 10. They are
  examples/23-trucking-dispatch/pages/driver/load-detail.scrml (openForm), samples/compilation-tests/gauntlet-r10-go-contacts.scrml
  (showAddForm), and 8 conformance/cases/server-db/sql-*hoisted-loop*-rt cases. Neither the bootstrap
  (it does not get that far on these legacy-dialect files) nor impl#1 (frozen, the rule is Nominal there) rejects them today. A
  compiler that implements the cell half WILL reject them. This is the latent cost of including cells, flagged for the PA.

## 2026-10-29T09:30Z — review round 1 (LAND-W-F/U) + RULING NARROWED

Ruling (verbatim, user-voice-scrml.md "⭐ RULED — 'one name per program' narrowed to exported names", S473, scrml-support 2bf30c5):
> Round 2 item 5 is narrowed. The program-wide one-name rule covers only **names a file exports**: two user files exporting the same name is E-SCOPE-010. A non-exported (private) name never collides with a name in another file, so two libraries may each keep a private `helper`. Unchanged: within one file, §7.6 file scope stays uniform (one name per file, #1636), and an imported name colliding with a local declaration stays E-SCOPE-010.

Rework (analyze.scrml):
- `fileNameClashes`: two bindings clash when they share a file, or are both EXPORTED from two user files (`bindingsClash`;
  FileName gains `exported`, decls via `declExported`). A program cell is never exported.
- MED-1: a cell beside an import of its name from ANY source (stdlib included, `importBringing`) is E-SCOPE-010 at the cell.
- LOW-1: the decision is per binding. A binding another pass reports at (`reportedElsewhereAt`) gets no second report. Otherwise it is
  reported against the first earlier clashing binding whose pair is not owned elsewhere (`pairOwned`), so one owned pair never hides an unowned one.
- LOW-2: `dupDecls` rewritten around `dupDeclKind` ("component" / "limit" / ""). It leaves a declaration whose file imports the name to
  linkage, and an exported user pair to fileNameClashes. A private pair (now legal by the ruling) or a stdlib pair stays the bootstrap
  limit E-BOOTSTRAP-UNSUPPORTED.
- LOW-5: messages name the first binding by file:line:col (`placeIn`, from FileAst.lines).
- LOW-3: with private pairs legal again, every moved s472 pin (visibility-s472 three helpers / two types / two routes `route$load$1` /
  writeset-overrefuse, logic-block-const "app-k/lib-k", rulings-s473-names, slice-m2 typer and typer-s440) is RESTORED to base from
  6cfdcd991, unchanged. Kept moves: typer-s440 `function s` → `sOf` and loop-wait `total` → `totalOf` (same-file cell + fn,
  file scope), plus visibility-s472's two-imports test (both files export `twice`, so it is still E-SCOPE-010), with a ONE-file W-IMPORT-001 runtime twin.
- LOW-4: typer.test.js F1 twin pins the exact list ["E-TYPE-STRUCT-FIELD", "E-TYPE-STRUCT-FIELD"].

SPEC §7.6: the program-wide bullet was rewritten to the narrowed scope ("**One name per program, for exported names (S473 ruling).** Two user
files of one program SHALL NOT export the same name: … A non-exported (private) name never collides with a name in another file …"),
citing both rulings. The file-scope bullet now names program cells (§7.6.1). The §34 row and the §21.2 note were narrowed.

Tests: rulings-s473-one-name.test.js rewritten, 23 tests, 10 red on base 6cfdcd991.
Gaps: g-boot-imported-const-like-cell-s472 resolved (any-source import); g-boot-decl-same-name-noncomponent-s473 REOPENED, narrowed (private
pair legal, bootstrap limit); filed g-corpus-cell-fn-same-name-migration-s473 (the 10 files).

## 2026-10-29T10:30Z — review round 2 (r1 re-review LAND-W-F/U)

- LOW-A: `dupDeclKind` returns "" for an EXPORTED declaration that has an earlier exported user declaration of its name in
  another file (`fileOrderBefore`). The exported pair is then fileNameClashes' E-SCOPE-010, even when a private declaration came first.
  Test: a private `<card>`, then b and c export one: b gets the bootstrap limit (vs the private a), c gets E-SCOPE-010 naming b.scrml:1:.
- LOW-B: `dupDeclKind` checks `importBringing` before the component rule, so importing a component and declaring one gives one report (linkage's).
  css-s469 pin moved (it expected the double report).
- LOW-C: visibility-s472 gained a runtime test of later-import-wins between a USER import and a STDLIB import (scrml:vis `pub`), in
  both orders ("lib-helper:X" / "user:x").
- Nit: the dupConsts E-NAME-COLLIDES-STATE message names the cell by file:line:col.
Main is NOT merged here (the base #1636 is merging it).

## 2026-10-29T11:30Z — merged origin/main (82df2fc5e)

Per the PA: merged origin/main (#1634 duplicate-fn renames + scripts/lint-duplicate-fn.js), no rebase. SPEC-INDEX regenerated by
git-merge-generated --regen; known-gaps gap ids diffed (2468, none lost). lint-duplicate-fn: 0 violations with this lane's new fns.

## 2026-10-29T12:30Z — merged origin/main after #1636 landed (dd373f8aa)

The merge brought no tree change: the branch already held #1636 and main. SPEC-INDEX, severity and gap-counts are current
(checked by script); gap ids: main 2467, merged 2468 (+ g-corpus-cell-fn-same-name-migration-s473), none lost.

## 2026-10-29T13:30Z — merged origin/main after #1630 landed

The one conflict was the §34 E-SCOPE-010 row. Resolution: this branch's narrowed one-name text, plus #1630's section refs (§21.3.1.1, §21.3.3)
and its host ALSO clause, kept verbatim. SPEC-INDEX, severity and gap-counts regenerated by script; gap ids 2471 = union of both sides.
