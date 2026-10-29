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
