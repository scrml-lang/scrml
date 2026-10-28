# progress — s472-boot-import-host-math

Branch `s472-boot-import-host-math` from `origin/s472-boot-link-visibility` (PR #1606, 67bd70862).

## Log

- start: worktree clean; node_modules symlinked from main; `bun run pretest` OK.
- step 2 (impl#1, S471 policy-authorized): `compiler/src/host-import.js` `SELF_HOST_PATH_PREFIX`
  `"stdlib/compiler/"` → `"stdlib/"` (§21.3.1 / §22.13 S471 text); `.d.ts` in step; repo `scrml.toml`
  comment; SPEC's three "Nominal on impl#1" notes updated. Tests: import-host.test.js — the
  allow-list unit pin widened (stdlib/math, stdlib/other admitted; src/stdlib/…, stdlibx/, app.scrml,
  and every file under "disabled" still refused) + one compile test (stdlib/math/m.scrml clean;
  src/stdlib/math/m.scrml → E-IMPORT-008). Red on base: 2 fail / 46 pass
  (~/.cache/scrml-pa/s472/hostmath-impl1-red.log); green after: 48 / 0.
