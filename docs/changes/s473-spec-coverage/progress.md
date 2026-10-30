# s473-spec-coverage — progress

Lane: consolidate the six SPEC-coverage audit parts (`~/.cache/scrml-agent-tmp/spec-coverage-audit/part-{1..6}.md`)
into a coverage table, gaps for every SILENT item, a CI gate, and a decisions doc.

- [x] Branch `s473-spec-coverage` from origin/main (741a2b51c); node_modules symlinked; pretest run.
- [x] Read all six parts in full.
- [ ] Extract + merge rows → `docs/bootstrap-spec-coverage.md`
- [ ] File / update gaps in `docs/known-gaps.md`; regen counts (`bun scripts/state.ts --write`, master-list.md NOT staged)
- [ ] `scripts/spec-coverage-check.ts` + tests + fixtures; wire CI `checks` + pre-commit
- [ ] `docs/changes/s473-spec-coverage/decisions.md`
- [ ] Gates run locally; PR opened, marked ready
