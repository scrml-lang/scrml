Lane: `s475-boot-namespace-import-and-tx-fail-error`. Compiler: the bootstrap (impl#2, `compiler/self-host-v2/`). impl#1 (`compiler/src/`) gets NO work (bryan S475: "we are not wasting resources on the impl#1") — do not touch it.

Follow the "Process rules" section of /tmp/claude-1000/-home-bmacs-scrmlMaster-scrml/301cd492-80a9-4555-b6d2-52e1bdbd0640/scratchpad/pg-common.md exactly (startup gate, maps — start with primary.map.md then bootstrap.map.md, worktree-absolute Edit/Write, no stash, no pkill, bounded waits, incremental commits + progress.md, draft PR, final report). Ignore that file's other sections. First commit: copy this prompt verbatim to docs/changes/s475-boot-namespace-import-and-tx-fail-error/BRIEF.md.

Rulings (verbatim: /home/bmacs/scrmlMaster/scrml-support/user-voice-scrml.md, section "## S475", items 1 and 3 — read it, read-only). A parallel SPEC lane writes the SPEC text; you do NOT edit compiler/SPEC.md. Governing text until it lands is the ruling itself — quote it in your report.

Part A — `E-TX-FAIL-AFTER-COMMIT` (ruling item 1). The bootstrap emits `W-TX-FAIL-AFTER-COMMIT` (analyze.scrml; severity.scrml; test `compiler/self-host-v2/slice-m4/client-bang-compose-s474.test.js`). Make it an Error under the new code `E-TX-FAIL-AFTER-COMMIT`, message naming the fix (move the check before the first server call). No W- code remains. Update tests (red on base / green on head). Direction: newly-rejecting — MEASURE corpus impact by compiling (not grepping) the bootstrap's own corpus/conformance set and `examples/` with the bootstrap; report the command, file count and any newly-failing file.

Part B — namespace import (ruling item 3). Gap `g-boot-namespace-import-unbuilt-s474` (docs/known-gaps.md ~:1067; read it and the #1715 note at ~:1063). Today parse.scrml `parseImport` refuses `import * as m` by name (E-BOOTSTRAP-UNSUPPORTED). Build:
 - `import * as m from './x.scrml'` binds `m` to the module's exports; `m.name` in logic resolves to that export (functions, types, enums, constants) through the same (declaring file, orig) lookups #1715 introduced (ScopeName.orig / boundAs);
 - markup `<m.card …/>` and `<m.card>…</>` render the exported component (its own per-file scope key/CSS, as aliasing does); `<*m.card/>` addresses the shared instance if the bootstrap already supports `<*x/>` (if not, refuse it by name INTERIM and say so);
 - resolution by binding kind: a dotted tag whose head is a namespace-import binding → module member; otherwise the existing compound-field meaning, unchanged (prove the compound-field path is untouched with an existing or new test);
 - unknown member → E-IMPORT-004 naming the member; namespace name colliding with another file-scope name → E-SCOPE-010 (existing rule);
 - a namespace import of a `.js` file keeps ES semantics (unchanged).
 If re-exports (`g-boot-reexport-from-s473`) are not built, a namespace over a module that re-exports refuses the re-exported member by name — do not build re-exports here.
 Tests in the bootstrap's layout incl. a Chromium case beside `slice-m4/css-chromium-s469.test.js` for two namespaced components rendering with their own CSS (opt-in env as that file does). A conformance case if the bootstrap conformance runner can pin it (report why/why not).
 You OWN `docs/known-gaps.md` for `g-boot-namespace-import-unbuilt-s474` only: flip to resolved (or narrowed, stating what remains) when green. Touch no other entry.

A parallel bootstrap lane (Postgres savepoints, likely server-runtime.js / emit paths) may touch analyze.scrml too; keep your diff minimal and localized so a later rebase is a clean 3-way.
