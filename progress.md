# fix-2140-r1 progress (S483) — drop before PR push

- [x] merged origin/main into s483-marked-bump-r1 (local branch; s483-marked-bump is checked out in another worktree)
- [x] commonmark.js primary reader (sourcepos + AST-sibling markers), marked cross-check only, reader crashes -> named exit 2
- [x] unit tests: HIGH-1 failopen1 (line 13, exit 1), sibling-marker rules, LOW-1 crash exit 2, b28 multi-line comment; 96/96
- [x] real repo --base-ref origin/main: 5462 hits, identical to main (marked 14 script)
- [x] fuzz (mulberry32, 4 generators) seeds 11/23/37/101: 0 fail-open, 0 mismatch; exit2 = reader disagreement only
- [x] docs: SPEC §63, known-gaps (resolved text, residual narrowed), test comments
- [x] a-set 24/24 exit 1; b-set: b04/b04b read, b27 probe error, b28 now unmarked (fail-safe)
- [ ] push HEAD:s483-marked-bump
Artifacts: ~/.cache/scrml/review/s483-marked-bump/r1/
