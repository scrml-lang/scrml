# CI notes

Workflows live in `workflows/`. The required check on `main` is the `gate` aggregator in `ci.yml`. `main` is protected by ruleset 25356240, which requires a pull request, `gate` and the merge queue, with no bypass actors. Every automated write therefore goes in through a PR.

## Generated blocks: regenerated on main after merge (S469 FACTS, S474 everything derived)

Owner rulings: S469 "Regenerate on main after merge." (FACTS.md), then S474 "Generated files move to a post-merge bot. PRs stop committing regenerated blocks (known-gaps counts, coverage totals, `severity.scrml`, SPEC-INDEX, bootstrap-conformance.md and the like); a post-merge bot (the FACTS.md pattern) regenerates them on main; CI checks only the sources." (scrml-support `user-voice-scrml.md` §S474.) Why: in S473 every PR that touched gaps went dirty when another landed, costing ~8–10 re-merge rounds; FACTS had the same problem at S469, when 48 of 78 landings moved it.

| block | producer | derives from | PR-side (CI `checks`; hook) | stale exit | still BLOCKS on |
|---|---|---|---|---|---|
| `docs/FACTS.md` | `facts.ts` | compiler/src, tests, SPEC, conformance, stdlib … | warns; pre-push warns | 4 | 1 crash, 2 zero measurement, 3 missing anchor, 5 dangling symlink |
| `compiler/SPEC-INDEX.md` totals + row Lines/Size | `regen-spec-index.ts` | `SPEC.md` | warns; pre-push warns | 4 | 1: a § with **no row** (a new § needs a hand-written row), a truncated row scan, a row naming a § SPEC lacks, missing anchors |
| `docs/bootstrap-spec-coverage.md` `@generated:coverage-totals` | `spec-coverage-check.ts --write` | the doc's own rows | warns; pre-commit warns | 4 | 1: a § with no row, a SILENT row with no gap, a cited gap that doesn't exist, bad status/token, missing anchors · 2: unparseable inputs |
| `docs/known-gaps.md` `@generated:gap-counts`, `master-list.md` `@generated:recent-sessions` | `state.ts --write` | the `@gap` markers; `git log` wrap commits | warns (**new step at S474** — was not CI-gated at all) | 4 | 1: an unclassifiable `@gap` status, a stray 2nd START/END anchor · 2: zero markers parsed · 3: missing anchor |
| `docs/bootstrap-conformance.md` | `bootstrap-conformance.ts --write` | a bootstrap run over `conformance/cases` | warns (PR touching `conformance/cases` / `compiler/self-host-v2`; `tracking` otherwise) | 4 | 2: the bootstrap failed to build/load or 0 cases · 1: crash |
| `compiler/self-host-v2/severity.scrml` | `gen-bootstrap-severity.ts` | SPEC §34 + bootstrap code literals | warns (**moved from `tracking` to `checks`** at S474) | 4 | 1: crash. Answer-changing drift fails `slice-m4/severity.test.js` on the PR. |

Every row's PR-side check runs through `scripts/ci-stale-warn.sh` (FACTS has its own identical step): exit 4 becomes a `::warning::`, and any other non-zero fails. A broken source or a broken producer still fails the PR. Only staleness passes, and nobody has to fix it in the PR. Pinned by `compiler/tests/unit/generated-stale-exit-codes-s474.test.js` and `facts-check-exit-codes-s472.test.js`.

**Not moved: generated code the build or runtime consumes.** These stay in-PR and blocking, because a stale copy on main between the merge and the bot's landing would be a wrong program, not a wrong number:

- `compiler/runtime/stdlib/md.js` (`gen-md-shim.ts --check`; the runtime loads it, and SPEC §67.8 allows one md reader).
- The URL-guard verbatim block in `compiler/self-host-v2/slice-m1/runtime/runtime.js` (`sync-bootstrap-url-guard.ts`, checked byte-exact by `bootstrap-url-guard-verbatim.test.js`; security).

`severity.scrml` is code too. It is on the bot only because of the semantic test: an answer-changing drift fails the PR, so the only drift that can reach main is byte drift that changes no answer.

### The bot: `generated-regen.yml`

1. Every push to `main` (and `workflow_dispatch`) runs the six producers on main's **current** tip, in dependency order: severity → SPEC-INDEX → coverage (reads SPEC-INDEX) → state → bootstrap-conformance (compiles severity) → FACTS (measures the rest).
2. If a producer fails, its files are restored to main's content, so a broken measurement is never committed. The others still land, and the run ends red with the failure named.
3. If there is no drift, nothing happens, and a leftover bot PR is closed.
4. If there is drift, the job makes one commit on top of the tip and force-pushes it to the fixed branch `bot/generated-regen`. It opens a PR from that branch, or reuses the open one, and enables auto-merge. The PR goes through `gate` and the merge queue like any other PR.
5. When that PR lands, its push re-runs the job, which finds a fixpoint: no block is an input of its own figures, and the bot's merge commit is not a session wrap, so recent-sessions ignores it. So there is no loop.

The job also does not race. `concurrency: generated-regen` with `cancel-in-progress` keeps only the newest run alive, and there is only ever one bot branch and one bot PR. An open bot PR that already carries the right content is not force-pushed, so it is not dequeued.

**Why one workflow, not a sibling of facts-regen:** the producers read each other's outputs. Two bots would each compute from a tip that lacks the other's commit, and their PRs would stale and conflict with each other. That is the S473 problem again, between the bots. The S469 branch `bot/facts-regen` is retired, and the job closes any PR still open from it.

**What this means for a PR author:**

- Don't commit a regen of any block in the table. It only conflicts with the bot's.
- Do make the hand-written source edits the checks require: a new SPEC § needs its SPEC-INDEX row and a coverage row, and a SILENT coverage row needs a gap id. Those still fail the PR.
- `severity.scrml`: regenerate it when `severity.test.js` fails, which happens when a §34 change alters an answer the bootstrap gives. Leave answer-neutral drift to the bot.
- The CI steps and the hooks print warnings for stale blocks. That's expected.

**The merge driver stays.** `.gitattributes`' `scrml-generated` driver still helps locally: a branch that did run a producer (by habit, or a pre-S474 branch) merges main's bot output without conflict hunks, and the driver's gap-id union keeps two branches' same-spot gap entries. It is inert unless installed, and GitHub never runs it. With PRs no longer touching generated regions, it rarely has anything to do.

**`cloud-maps.yml` no longer writes.** Its Stage 1 (`state.ts --write` + a `maps/regen-*` PR) was a second, daily writer of `master-list.md`, and it would race the bot. It was removed, and only the thread-board probe remains.

**Token:** the job writes with the `MAPS_PAT` secret (Contents R/W, Pull-requests R/W). The default `GITHUB_TOKEN` can't be used, because a PR it opens does not trigger `gate`, so the queue would never take it. Fine-grained PATs expire. When `MAPS_PAT` lapses, the bot goes red at checkout. Merges aren't blocked, since it is not a required check, but the blocks drift until the PAT is renewed. Then re-fire with `gh workflow run generated-regen`.

## Windows: a ratchet, required through `gate` (S473)

Owner ruling, S473: the Windows CI ratchet (scrml-support `user-voice-scrml.md`, "RULED — S473 Windows … CI ratchet guard", item 2). Until S473 the `windows` job was `continue-on-error` and not required. It went red at #1620 and stayed red. #1658, #1664 and #1673 each merged with a red `windows` on their own PR, because a new failure looked exactly like the old ones.

**What the job does now** (`ci.yml`, job `windows`):

1. Runs `compiler/tests/unit` + `compiler/tests/conformance`, then `compiler/tests/e2e-render-map`, on `windows-latest`, each with a junit report. These steps record bun's exit code and never fail by themselves.
2. **Flake rescue.** It re-runs ONCE every test file that has a failure outside the baseline, or that did not report. It skips the retry when more than 40 files would be re-run, since that is a mass failure, not a flake.
3. **The judge**, `bun scripts/windows-ratchet.ts judge`, fails the job when:
   - a test fails that is not in `.github/windows-baseline.json`, and it failed again on the retry (**new failure**);
   - a baseline entry passes, is skipped, or no longer exists in a file that ran (**stale entry**). So the baseline only shrinks;
   - a suite left no report, an empty one, or exited non-zero with no failing test in it (a crash).

   A test that failed and then passed on the retry is listed as a **flake**, with a warning annotation. It does not fail the job.

The verdict is printed in the step log and in the job summary.

**Test ids** take the form `<repo-relative POSIX file> > <describe> > … > <test name>`. That is the string bun prints after `(fail)`, with the file in front. bun omits a file that throws at load from its junit. So the judge also lists the expected test files, and a missing one is a failure under the id `<file> > (file did not report)`.

**The baseline.** `.github/windows-baseline.json` has `entries: [{file, test, gap, reason}]`. Every `gap` must be an **open** gap id in `docs/known-gaps.md`. The `checks` job runs `windows-ratchet.ts validate` on every PR, so a PR that resolves a gap cannot leave an entry that points at it. You add an entry only for a failure you cannot fix in the PR, and only with an open gap. The reason is written for the next reader.

**How `gate` treats it:**

| event | windows job | gate reads |
|---|---|---|
| PR whose diff touches path-handling code (the filter in the job header) | suites run, judge decides | judge's verdict |
| PR outside the path filter | job runs and its filter step skips the suites; concludes `success` | pass, nothing was judged |
| `push` to main, nightly `schedule`, `workflow_dispatch` | always runs the suites | judge's verdict |
| `merge_group` | skipped by its job `if:` | `skipped` is accepted **for `windows` only, on this event only** |

The merge-queue run does not repeat Windows. The PR's run is the gate, and the queue's push to main runs it again.

**Visibility on main.** The path filter means a PR outside it can break Windows unseen until the push to main. `windows-main-report.yml` runs daily at 07:47 UTC, after the 06:41 nightly CI, and on `workflow_dispatch`. It reads main's CI runs, prints the latest concluded `windows` result, and while that result is red, prints the **first red** run and SHA and the last green one. It fails while main is red. It opens no issue or PR. Run it locally with `bun scripts/windows-ratchet.ts report`.

**Running a PR's Windows suites when the filter skipped them:** `gh workflow run CI --ref <branch>`. A dispatched run always runs the suites.

**Limits, stated plainly:**

- The retry re-runs whole files, not single tests. bun has no exact-test-id re-run, and `-t` is a regex over names. A file holding a flake re-runs its passing tests too.
- A flaky **baseline** test that passes on the first run reads as stale. Stale is judged on the first run, so a baseline entry must be a deterministic failure.
- A PR outside the path filter is not judged on Windows. When it breaks Windows, the next path-touching PR inherits the red, and so does main's report. Whoever opens that next PR pays, until it is fixed or baselined.
