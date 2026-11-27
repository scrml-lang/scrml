# fix-2140-r1 progress (S483) — drop before PR push

- [x] merged origin/main into s483-marked-bump-r1 (local branch; s483-marked-bump is checked out in another worktree)
- [x] commonmark.js primary reader (sourcepos + AST-sibling markers), marked cross-check only, reader crashes -> named exit 2
- [x] unit tests: HIGH-1 failopen1 (line 13, exit 1), sibling-marker rules, LOW-1 crash exit 2; 96/96
- [x] real repo --base-ref origin/main: 5462 hits, identical to main (marked 14 script)
- [ ] fuzz (mulberry32, extended generator) seeds 11/23/37/101
- [ ] docs: SPEC §63, known-gaps (resolved text, residual), crossCheck comment
- [ ] a-set / b-set
- [ ] push HEAD:s483-marked-bump
