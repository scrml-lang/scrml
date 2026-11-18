# s478-ruled-markup-events — progress (crash-recovery anchor)

Lane brief: user-voice open-Qs rulings 1, 2, 9–16, 60 (user-voice-scrml.md "⭐ RULED — open owner questions, PA recs adopted wholesale (S478, 2026-11-17)", scrml-support ccb6b40).
Worktree: .claude/worktrees/s478-ruled-markup-events (base origin/main b04fdc27a). Scratch: ~/.cache/scrml/review/s478-ruled-markup-events/.

Base conformance (b04fdc27a): PASS 614, FAIL 18, NOT-TWINNED 635, UNSUPPORTED 601, CRASH 0 (1868 cases).

| item | gap | status |
|---|---|---|
| 1 | g-boot-body-top-lift-render-s478 (b) | built (SPEC §17.3/§17.6.10.1/§34; parse logicBlockTP bodyTop tag + analyze resolveLift; 4 cases migrated) |
| 2 | g-boot-body-top-trailing-tokens-vs-semicolon-s478 | SPEC §40.8 + §7.2.2 row; case re-pinned (impl#1 xfail g-dpa063…) |
| 9 | g-boot-event-members-s478 | built (SPEC Appendix H.6; host-surface eventInterfaces; analyze evIfaceVia/resolveEventTargetRead; core HostCall.EventRead(member, slot)) |
| 10 | g-boot-event-cases-unhandled-server-call-s478 | 18 cases rewritten (impl#1 passes all 18) |
| 11 | g-boot-event-control-in-suspending-loop-s478 | built (SPEC §13.2/§34; analyze eventAfterAwait forSpansIn; new case + carried impl#1 gap) |
| 12 | g-boot-match-without-for-s478 (a) | built (SPEC §18.0.1; analyze matchEnumFromOn — on=@cell of an enum type) |
| 13 | match mount wrapperless | built (lower matchView View.Cond, analyze mkMatch; 6 cases updated, 1 new case; impl#1 carried gap g-impl1-match-mount-wrapper-div-s478) |
| 14 | g-boot-match-duplicate-binder-s478 | OPEN (code not chosen) — not touched |
| 15 | g-spec-18-10-pipe-guard-unruled-s478 | built (SPEC §18.10/§34; parse patStartAt) |
| 16 | g-conf-e-type-026-case-asserts-retired-code-s478 | SPEC §18.9/§34; case retargeted (impl#1 carried gap g-impl1-match-in-markup-control-flow-s478) |
| 60 | g-spec-two-pages-one-file-s476 | nested-program page built (E-STRUCTURAL-ELEMENT-MISPLACED); second page code OPEN (residue g-page-second-page-code-s478) |

## Corpus (old vs new bootstrap; base-tree inputs: samples, examples, conformance cases + twins, acceptance — 4035)
newly-rejecting 0; newly-accepting 2 (match-without-for twins); 13 code-set changes on already-rejected files.
Scripts: ~/.cache/scrml/review/s478-ruled-markup-events/corpus.ts, corpus-{old,new}.json.
