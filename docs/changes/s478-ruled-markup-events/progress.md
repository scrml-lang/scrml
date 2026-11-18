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

## Conformance (bootstrap, head vs base b04fdc27a)
PASS 614→629, FAIL 18→15, UNSUPPORTED 601→591, NOT-TWINNED 635, CRASH 0. 0 PASS→FAIL. 2 new cases (both PASS).
CI checks (types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim, severity): all green.

## Fix round 1 (review ~/.cache/scrml/review/s478-1945/review.md)
Merged origin/main (SPEC E-STRUCTURAL-ELEMENT-MISPLACED row: both sides kept; known-gaps: branch status + main's RULED paragraphs).
- MED-1: parse.scrml `patStartAt` + `qualPatStartAt` — `R.A` / `R::A` / `ns.R.A` after `|` is alternation (E-PARSE-ARM), a lowercase member read stays the guard (E-SYNTAX-011).
- MED-2: analyze.scrml `mkBranch` / `mkCarryRoot` / `mkSoft` (`MkCx.carry`) — `<match>` arms, `if=` branches, `<each>` / lift rows judged a second time in the parent's context; a fault only that pass finds is W-HTML-001 (Warning; §24.2/§28.1 default warn), NOT E-HTML-PARSER-REPAIR (§24.5 item 2 scopes the repair rule to one template). SPEC §18.0.1 sentence made precise + INTERIM; gap g-boot-branch-content-model-s478 (MED).
- LOW-3: gap g-boot-e-type-045-prefix-not-s478, cited from the case.
- LOW-4: patStartAt comment fixed (literals are a bootstrap addition; impl#1 reads them as a guard).
- LOW-5: §13.2 loop list → `for`, whatever its head.
- LOW-6: gap g-boot-synthetic-event-member-typing-s478.
- LOW-7: `htmlTagOrNone` — `e.target` narrows only on the HTML element, never a declaration of that name.
- LOW-8: `matchEnumFromOn` — no report beside E-MATCH-ON-REQUIRED / E-TYPE-UNKNOWN.
- LOW-9: not done (35 PTok literal sites).
Conformance: unchanged vs 6171f58cf (629/15/591/0 CRASH; 0 bucket or emitted-code changes). Corpus (4039 entries, 6171f58cf vs fix): 0 changes.
