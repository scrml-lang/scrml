# progress — s474-generated-files-bot

- start: brief committed; pretest green.
- inventory done (15 of 15 candidates; see PR body). Baseline on 34ebef81d: state --check rc1 (recent-sessions STALE on main — the wrap's own merge commit), facts rc4, spec-index/coverage/severity/md-shim rc0, bootstrap-conformance rc0 (134 s on a loaded box).
- unit 1: producers reserve exit 4 for stale-only (state.ts 4/3, regen-spec-index 4 vs structural 1, spec-coverage 4 vs violation 1, bootstrap-conformance 4, gen-bootstrap-severity 4); scripts/ci-stale-warn.sh; ci.yml currency steps through it (+ NEW blocking state.ts and severity steps in `checks`); pre-push SPEC-INDEX block + pre-commit coverage block warn on 4; facts-regen.yml -> generated-regen.yml (all producers, dependency order, restore-on-fail); cloud-maps Stage 1 removed (second writer). Test: compiler/tests/unit/generated-stale-exit-codes-s474.test.js (39) + spec-coverage test updated; 136/136 across the 5 related files.
- ⚠ INCIDENT (self-inflicted, recovered): the first unit-1 commit's hook ran the new test, whose bot-step sandbox spawned `git init/add -A/commit` with the hook's GIT_INDEX_FILE inherited -> the sandbox `add -A` REPLACED this worktree's index (14k paths staged as deleted). No commit was made (HEAD unchanged), working tree intact; recovered with `git read-tree HEAD && git add -A`. Fix: the test strips every GIT_* var (BASE_ENV) from every child and asserts the sandbox's git dir is the sandbox; re-proved by running the file with GIT_INDEX_FILE pointed at a scratch path (39/39 pass, real index untouched, scratch index never created).
- BITE PROOFS on the real tree (corrupt -> red -> restore -> green), each through scripts/ci-stale-warn.sh exactly as CI calls it:
  - SPEC-INDEX: baseline 0 · row §47 deleted -> 1 (BLOCKS) · SPEC.md +1 line -> 0 + ::warning (raw 4) · restored 0
  - SPEC-coverage: baseline 0 · SILENT row with gap cell blanked -> 1 (BLOCKS) · totals digit corrupted -> 0 + ::warning · restored 0
  - state.ts: baseline (after --write) 0 · stray START anchor -> 1 (BLOCKS) · gap-counts cell corrupted -> 0 + ::warning · unknown @gap status -> 1 (BLOCKS) · restored 0 · branch state (recent-sessions stale) -> 0 + ::warning
  - severity: baseline 0 · byte appended -> 0 + ::warning · restored 0 (crash -> non-4: unit test, SPEC.md as a directory)
  - bootstrap-conformance: report corrupted -> raw 4, wrapper 0 + ::warning · restored 0 · `--cases /nonexistent` -> 2 through wrapper (BLOCKS)
  - conflict-marker-gate (extended): clean 0 · S473 leaked regen line re-inserted -> 1 · failBlock body line -> 1 · restored 0
- unit 2: docs (CI.md table, hooks README, .gitattributes, FACTS prose, coverage prose, master-list state.ts line, facts.ts/merge-driver comments); SPEC-INDEX.md leaked line 1 removed; conflict-marker-gate flags driver block-body lines.

## r1 (PA review of 89e117fc9: LAND-WITH-FOLLOW-UP)
- F1 gen-bootstrap-severity --check compares ANSWER maps (`"CODE" :> Severity.X` + `_` default, a missing arm = the default) of fresh render vs disk: differ -> 1; byte-only drift -> 4. BITE (reviewer's exact mutation, render Info->Warning): rc 1 "DIFFERENT ANSWERS (6)"; restored 0. Unit: mirror with the mutated generator -> 1; answer-neutral arm move -> no diff.
- F2 bootstrap-conformance --check on stale ratchets vs the committed report: CRASH or INVALID rise -> 1; delta always printed as ::warning. BITE: severity.scrml with every explicit arm answering Info -> rc 1 "CRASH 0→3" (PASS 283→293, FAIL 241→272, UNSUPPORTED 604→560); default arm -> a non-existent variant -> rc 0 + warning (PASS 283→278, FAIL +4: FAIL is free by design — that table is ALSO refused by F1's severity step, answers differ); restored 0.
- F11 real build failure: unbalanced garbage appended to compiler/self-host-v2/ast.scrml -> rc 2 "the bootstrap failed to build/load" through ci-stale-warn.sh; restored 0. (Replaces the `--cases /nonexistent` claim.)
- F5 regen-spec-index: duplicate section key -> 1. BITE: `## 47.` twice -> rc 1 "duplicate SPEC section heading"; restored 0.
- F6 spec-coverage anchors exactly once each, START first; --write refuses a malformed pair. BITE: totals block duplicated -> rc 1; START/END swapped -> rc 1; --write on swapped -> rc 1, file untouched; restored 0.
- F7 conflict-marker-gate also flags the crash-wrapper banner. BITE: banner at column 0 -> rc 1; restored 0.
