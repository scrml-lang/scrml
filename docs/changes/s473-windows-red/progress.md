# s473-windows-red — progress

Main's non-required `windows` job has been red since run 40754958089 (#1620, 2026-10-28). Last green: 40726257771 (#1608).

## Failure families (from `gh run view <id> --log-failed`, runs on main)

| family | first red run | PR | root cause | class |
|---|---|---|---|---|
| facts.ts dangling-symlink message (exit 5 test) | 40754958089 | #1620 | `rel()` prints the native path (`stdlib\dangling`); test expects `/` | (b) script output, fixed in scripts/ |
| pre-commit bootstrap-slice trigger (2 tests) | 40754958089 | #1620 | test stubs `git` via `PATH=${stub}:${PATH}` — `:` is not the Windows PATH delimiter, real git runs, nothing staged | (b) test-only |
| `_ e :>` imported-call typing (4 tests) | 40982570210 | #1658 | type-system.ts reads `routeMap.functions` with the module graph's POSIX `depFilePath`; route inference keys by the NATIVE filePath (`\`) | (a) impl#1 product bug — STOPPED, not edited |
| transport routing `plainS` (15 + acorn emitted test) | 40994045158 | #1664 | same as above (`transportRoutableCallee`, line ~11566) | (a) impl#1 product bug — STOPPED, not edited |
| spec-coverage-check (4 tests) | 41058630150 | #1673 | CRLF checkout (autocrlf on windows-latest): totals block compare + `\n` splits/replaces | (a) script bug (scripts/), fixed |

Intermittents seen once each (not families): S27 §51.11 timer audit (40928533707, 40982570210), runtime-url-guard classic-script (40990243753).

## Steps
- [x] bisect windows status over last 30 main runs
- [x] diagnose each family
- [x] fix facts.ts rel()
- [x] fix hook-slice test stub
- [x] fix spec-coverage-check CRLF + test (new CRLF cases: 2 red with the normalization removed)
- [x] known-gaps: g-windows-facts-dangling-… and g-windows-hook-trigger-… resolved; filed g-windows-impl1-routemap-native-key-miss-s473 (MED, defer=impl1-s471-policy)
- [x] PR #1681. Dispatched windows run 41069177484: the three fixed families are green; only the 20 impl#1 cases remain (down from 28 unique on main)

## Guard (proposal, not implemented)
All four introducing PRs (#1620, #1658, #1664, #1673) ran `windows` on the PR itself and it was RED. They merged anyway because main was already red, so a new family looked the same as the old ones. The missing piece is a ratchet, more than visibility: a committed baseline of known Windows failures, each tied to a gap id, where the job fails only on a failure outside the baseline. That makes `windows` safe to require.
