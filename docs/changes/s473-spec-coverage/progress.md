# s473-spec-coverage — progress

Lane: consolidate the six SPEC-coverage audit parts (`~/.cache/scrml-agent-tmp/spec-coverage-audit/part-{1..6}.md`)
into a coverage table, gaps for every SILENT item, a CI gate, and a decisions doc.

- [x] Branch `s473-spec-coverage` from origin/main (741a2b51c); node_modules symlinked; pretest run.
- [x] Read all six parts in full.
- [x] Extract + merge rows → `docs/bootstrap-spec-coverage.md`
- [x] File / update gaps in `docs/known-gaps.md`; regen counts (`bun scripts/state.ts --write`, master-list.md NOT staged)
- [x] `scripts/spec-coverage-check.ts` + tests + fixtures; wire CI `checks` + pre-commit
- [x] `docs/changes/s473-spec-coverage/decisions.md`
- [ ] Gates run locally; PR opened, marked ready

Commits: 79482c3dd (gaps: 101 new, 10 updated). Next: coverage doc + gate + decisions. Totals: 1106 rows; SILENT-ACCEPT 44, SILENT-ABSENT 47, all gapped.
