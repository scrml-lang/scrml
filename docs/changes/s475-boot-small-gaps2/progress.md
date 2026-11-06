# s475-boot-small-gaps2 progress

- 2026-11-05T22:24:45-07:00 start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-a66b800fbf82d4ab2, branch s475-boot-small-gaps2 from origin/main 16ffdaee8; bun install + pretest ok.
- 2026-11-05 analyze.scrml: hostImportClash reads imp.ns; resolveAtOf/placeAt record nsAt for `@m` (namespace re-read makes `@m.x` one name); cross-file own-value whole write refused (O2/O39, INTERIM); file-scope own-value READ refused (was silent "[object Object]" on main, measured) — new gap g-boot-file-scope-own-value-read-unbuilt-s475; lateExits reports per exit (exitAt); browser call string no longer doubled.
- 2026-11-05 tests: slice-m4/boot-small-gaps2-s475.test.js 19/19 on head, 13 RED with origin/main analyze.scrml. client-bang-compose-s474 (b) span pin -> `fail .Bad`; slice-m2 typer §66.19 pin +1 E-BOOTSTRAP-UNSUPPORTED (theme @mode).
- 2026-11-05 gates: slice-m4 4949 pass/0 fail; m1 109, m1 lowered 109, m2 619, m3 60, codec 166 all 0 fail; e2e-render-map 259/0; bootstrap-conformance --check current; gen-bootstrap-severity --check current; types-gate unchanged; s34-census PASS; spec-coverage-check 0 violations; state.ts --check stale-counts only (bot-owned); lints 0 violations.
- 2026-11-05 WIP commit hook: default shards hit the memory ceiling (shard killed at 3203 MB); reran with SCRML_HOOK_SHARDS=1, passed.
