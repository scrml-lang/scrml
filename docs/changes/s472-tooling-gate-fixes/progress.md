# s472-tooling-gate-fixes — progress

Input: S472 backfill review bf3 (six tooling/test-gate findings on #1488 #1511 #1428 #1498 #1505 #1544).
Logs: `~/.cache/scrml-pa/s472/tg-*`.

| # | finding | fix | regression test | red-proof |
|---|---|---|---|---|
| 1 | #1488 facts crash warned as stale (MED) | stale = exit 4, the only code CI / pre-push warn on; dangling symlink = named fail-closed exit 5; crash prints `facts: CRASHED`; `--write` missing anchor = 3; facts-regen `::error` | unit/facts-check-exit-codes-s472.test.js (runs the CI step + pre-push block verbatim against a stub bun) | main's facts.ts / ci.yml / pre-push: 10 of 14 fail |
| 4 | #1498 slice trigger list misses stdlib/ (LOW) | `stdlib/*` added (+ README) | unit/hook-slice-trigger-list-s472.test.js (decision block verbatim vs a stub git; slice repo-root reads covered) | main's pre-commit: 2 of 4 fail |
| 2 | #1511 whitespace-red baseline masks resolved guards (MED) | guards whitespace-insensitive; one dedicated baselined space test per section; baseline 8 → 4; GLUED_SRC added (the emit-lift fix was unreached by TERNARY_SRC) | browser/g-emit-lift-markup-text-interp + g-each-peritem-markup-value-ternary | each fix reverted: `--check` 3 NEW FAILURE (main: PASS, blind). emit-lift non-each lowering reverted: both GLUED tests NEW FAILURE (main: red only via 8 unrelated S469 round-6 tests) |
| 3 | #1428 await pack no positive control (MED) | 5 sentinels must be exactly PASS (first); class floor PASS ≥ 250, PASS-500 ≤ 60 (measured 317 / 18) | integration/security-await-pack/await-probe-pack.test.js | CSRF mismatch: 907 / 2 fail; happy-dom `--preload` leak: 907 / 2 fail (main under the leak: 907 / 0) |
| 5 | #1505 banner exemption unenforced (LOW) | `bannerProblems()` in claim-gate (+ `--list`): banner before the first code sample, listed file present, site slug twin bannered; both announcement pages bannered (choice: banner, not gate) | unit/claim-gate-banner-s472.test.js | banner stripped from i-am-jacks-program-PUBLISH.md → `claim-gate --list` exit 1, BANNER MISSING (main: exit 0) |
| 6 | #1544 inbox-debt needs vocab / basename handled (LOW) | fail-closed `owesResponse`; HANDLED = name + blob (main read/resolved, inbox resolved/ per contract v10); inbox read/ files counted; blank lines before `---` | unit/inbox-debt-s472.test.js (S470 API only) | main's inbox-debt.ts: 20 of 31 fail |

Ledger: 14 review markers (docs/pr-reviews.md), 6 gap entries filed resolved (docs/known-gaps.md); `state.ts --write` no count change (all six resolved).

Deferred (not in scope): the other site article pages under docs/website/pages/articles/ display `<pre><code>`
samples no gate reads (snippet-gate compiles each page, not the code it shows).
