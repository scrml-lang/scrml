# s479-file-scope-init — progress

Ruling: user-voice-scrml.md "⭐ RULED — open owner questions, PA recs adopted wholesale (S478, 2026-11-17)" item 59 (b), (c); code names confirmed S479. Gap: g-boot-file-scope-init-eval-s478 (resolved), residue g-boot-file-scope-init-residue-s479.

## Done
- parse.scrml: `parseLetItem` — a file-scope `let` is an AConst with `mutable: true` (ast.scrml AConst.mutable). `let <x…/>` in a logic block keeps a by-name refusal.
- analyze.scrml: `initBlocker` replaces `constBlocker` (calls, tape/struct/payload-variant literals, index admitted); `calledRet` types a call by its callee's declared result; a `let`'s type is fixed (addAnnot); `fileLetLocal` / `fileLetHere` / `fileLetWriteGuard` (writes: rebinding, edits, grow shapes, part writes; cross-file write refused by name); `fileScopePass` — (a) server-placed callee, (b) by-name refusals (client-only reach, unresolvable call, construction, later binding), (c) E-FILE-SCOPE-LET-SERVER-WRITE (closed over calls), §48.3.3 E-FN-003.
- core/lower: CoreConst.mutable. print.scrml: `let` printing, writes count as uses (constReads), `fnClosureThroughConsts` (reachedOnlyByServer). print-server.scrml: serverReach follows bindings into initializer callees; `initFnClosure` prints those at module level.
- SPEC §7.6 rule (c) clarification + bootstrap note; §34 rows' emitter notes.
- Tests: slice-m4/file-scope-init-s479.test.js (26); s472 and s478 tests updated.

## Measurements
- conformance base: PASS 645 / FAIL 12 / UNSUPPORTED 576 / CRASH 0.
