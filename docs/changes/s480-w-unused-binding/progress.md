# s480-w-unused-binding — progress

Lane: build the ruled W-UNUSED-BINDING lint (user-voice "⭐ RULED — unused-binding lint code:
W-UNUSED-BINDING (S479, 2026-11-18)"). Gap g-spec-unused-binding-lint-code-s479.

- [x] SPEC §7.3.5 (new) + §34 row W-UNUSED-BINDING (Warning), provenance to the ruling
- [x] severity.scrml regenerated (gen-bootstrap-severity.ts; --check current)
- [x] analyze.scrml: AS.locs (addLoc at resolveLocal / bound loop / counted `let` / iterate binder);
      unusedBindings judged in analyzeRun over a compile with no Error; added once in analyzeSources
      from r1 (never the composed run)
- [x] slice tests slice-m4/unused-binding-s480.test.js
- [x] conformance: fn/unused-binding-{pos,neg}; linear/must-use-unread-pos pins the warning
- [x] known-gaps: g-spec-unused-binding-lint-code-s479 resolved; g-impl1-w-unused-binding-s480 carried
- [x] corpus fire count (bootstrap, 5247 files over examples/ samples/ benchmarks/ stdlib/ conformance/
      docs/ e2e/ lsp-boot/ self-host-v2 fixtures; 592 compile clean): 31 hits / 25 files, all verified
      genuinely unread. Slice fixtures: 311 unique hits, all verified (81 by hand where the name recurs)
- [x] slice tests whose fixtures hold incidental unread locals and pin every diagnostic use
      slice-m2/no-unused-lint.js (frontEnd minus W-UNUSED-BINDING); acceptance table gains the warning
      for loop/defer-per-iteration, loop/defer-loop-in-defer; kind-tool fixture `o` → `_o`
- [ ] full gate set on final head
