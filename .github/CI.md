# CI notes

Workflows live in `workflows/`. The required check on `main` is the `gate` aggregator in `ci.yml`. `main` is protected by ruleset 25356240, which requires a pull request, `gate` and the merge queue, with no bypass actors. Every automated write therefore goes in through a PR.

## Generated blocks: regenerated on main after merge (S469 FACTS, S474 everything derived)

Owner rulings: S469 "Regenerate on main after merge." (FACTS.md), then S474 "Generated files move to a post-merge bot. PRs stop committing regenerated blocks (known-gaps counts, coverage totals, `severity.scrml`, SPEC-INDEX, bootstrap-conformance.md and the like); a post-merge bot (the FACTS.md pattern) regenerates them on main; CI checks only the sources." (scrml-support `user-voice-scrml.md` §S474.) Why: in S473 every PR that touched gaps went dirty when another landed, costing ~8–10 re-merge rounds; FACTS had the same problem at S469, when 48 of 78 landings moved it.

| block | producer | derives from | PR-side (CI `checks`; hook) | stale exit | still BLOCKS on |
|---|---|---|---|---|---|
| `docs/FACTS.md` | `facts.ts` | compiler/src, tests, SPEC, conformance, stdlib … | warns; pre-push warns | 4 | 1 crash, 2 zero measurement, 3 missing anchor, 5 dangling symlink |
| `compiler/SPEC-INDEX.md` totals + row Lines/Size | `regen-spec-index.ts` | `SPEC.md` | warns; pre-push warns | 4 | 1: a § with **no row** (a new § needs a hand-written row), a truncated row scan, a row naming a § SPEC lacks, missing anchors, a **duplicate** SPEC section heading (S474 r1) |
| `docs/bootstrap-spec-coverage.md` `@generated:coverage-totals` | `spec-coverage-check.ts --write` | the doc's own rows | warns; pre-commit warns | 4 | 1: a § with no row, a SILENT row with no gap, a cited gap that doesn't exist, bad status/token, totals anchors missing / duplicated / swapped (each exactly once, START first — S474 r1) · 2: unparseable inputs |
| `docs/generated/gap-counts.md` `@generated:gap-counts`, `docs/generated/recent-sessions.md` `@generated:recent-sessions` (S474 r2: moved out of `known-gaps.md` / `master-list.md`; a PR may not modify them — see below) | `state.ts --write` | `docs/known-gaps.md`'s `@gap` markers; `git log` wrap commits | warns (**new step at S474** — was not CI-gated at all) | 4 | 1: an unclassifiable `@gap` status, a stray 2nd START/END anchor, an old block left in `known-gaps.md` / `master-list.md` · 2: zero markers parsed · 3: missing anchor or file |
| `docs/bootstrap-conformance.md` | `bootstrap-conformance.ts --write` | a bootstrap run over `conformance/cases` | warns (PR touching `conformance/cases` / `compiler/self-host-v2`; `tracking` otherwise) | 4 (the PASS/FAIL/CRASH/UNSUPPORTED delta vs the committed report is printed as a `::warning`) | 2: the bootstrap failed to build/load or 0 cases · 1: CRASH or INVALID **rose** vs the committed report (S474 r1 ratchet; the FAIL count stays free), or a crash |
| `compiler/self-host-v2/severity.scrml` | `gen-bootstrap-severity.ts` | SPEC §34 + bootstrap code literals | warns (**moved from `tracking` to `checks`** at S474) | 4 (byte drift that changes no answer) | 1: the fresh render's `"CODE" :> Severity.X` answers differ from the file's (S474 r1 — catches a broken GENERATOR, which `slice-m4/severity.test.js` cannot see: it grades the on-disk table) · 1: crash |

Every row's PR-side check runs through `scripts/ci-stale-warn.sh` (FACTS has its own identical step): exit 4 becomes a `::warning::`, and any other non-zero fails. A broken source or a broken producer still fails the PR. Only staleness passes, and nobody has to fix it in the PR. Pinned by `compiler/tests/unit/generated-stale-exit-codes-s474.test.js` and `facts-check-exit-codes-s472.test.js`.

**Not moved: generated code the build or runtime consumes.** These stay in-PR and blocking, because a stale copy on main between the merge and the bot's landing would be a wrong program, not a wrong number:

- `compiler/runtime/stdlib/md.js` (`gen-md-shim.ts --check`; the runtime loads it, and SPEC §67.8 allows one md reader).
- The URL-guard verbatim block in `compiler/self-host-v2/slice-m1/runtime/runtime.js` (`sync-bootstrap-url-guard.ts`, checked byte-exact by `bootstrap-url-guard-verbatim.test.js`; security).

`severity.scrml` is code too. It is on the bot only because answer-changing drift fails the PR. `severity.test.js` catches a wrong table on disk. `gen-bootstrap-severity.ts --check` (S474 r1) catches a generator whose fresh render answers differently. So the only drift that can reach main is byte drift that changes no answer.

**Stuck bot PR.** If an open bot PR already carries the right content but a required check on it has failed or was cancelled (S474 r2), the run ends red with `STUCK` and names the check (S474 r1). Auto-merge would otherwise never fire while the run stayed green.

### The bot: `generated-regen.yml`

1. Every push to `main` (and `workflow_dispatch`) runs the six producers on main's **current** tip, in dependency order: severity → SPEC-INDEX → coverage (reads SPEC-INDEX) → state → bootstrap-conformance (compiles severity) → FACTS (measures the rest).
2. If a producer fails, its files are restored to main's content, so a broken measurement is never committed. The bootstrap report runs as `--write --ratchet` (S474 r2): if CRASH or INVALID rose over main's committed report, the write is refused and the run ends red naming the delta, so the baseline never ratchets up. This catches what the PR-side check cannot: a `compiler/src`-only PR (impl#1 compiles the bootstrap) skips that path-scoped step, and two passing PRs can merge into a rise. The others still land, and the run ends red with the failure named.
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

**Why a clean local merge still went DIRTY on GitHub (S474 r2).** After #1702 (a bot regen) landed, #1699 and #1701 both went DIRTY and were dropped from the queue, while `git merge origin/main` was clean locally. GitHub's merge runs no custom merge driver. With the driver disabled, the merge of #1701's head `7bbd04ee5` with main `548cd4824` (base `5318337bb`) conflicts in exactly one hunk, the `@generated:gap-counts` LOW row of `docs/known-gaps.md`: `671` on the branch against `667` from the bot. #1699's head `8cde7879e` conflicts in the same block. The branches carried their own counts for two reasons. Their commits ran `state.ts --write`. And the driver **always** regenerates gap-counts in each local `git merge origin/main`, because it is a "self-contained" section. So any branch that changed a gap carried its own count lines, and every bot regen of those lines conflicted with it. The local driver resolved the conflict, so it never showed locally.

The fix: `gap-counts` and `recent-sessions` now live in their own files, **`docs/generated/gap-counts.md`** and **`docs/generated/recent-sessions.md`**. Only the bot writes them. `docs/known-gaps.md` §0 and `master-list.md` §0.6 just point at them. A file that a PR never touches cannot conflict, and the blocking `checks` step **"Bot-owned generated files untouched"** (`scripts/bot-owned-untouched.sh`) refuses a PR that modifies or deletes anything under `docs/generated/`. Adding a file there is allowed, and the bot's branch is exempt. `state.ts --check` exits 1 if either old block reappears in its former file, for example when a pre-move branch is merged forward. (Landing the bot's PR through the merge queue sooner would not have helped: whenever it lands, it rewrites the lines.) Still exposed to the same problem: the derived blocks inside hand-edited files (SPEC-INDEX totals and row cells, the coverage totals) and the wholly generated files a PR may still commit (FACTS.md, bootstrap-conformance.md, severity.scrml). See `g-ci-generated-blocks-in-hand-edited-files-dirty-s474` in `docs/known-gaps.md`.

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
| PR whose diff touches a non-`.md` file the Windows suites run or read (the filter in the job header: compiler source, `stdlib/`, `lsp/`, `scripts/*.{ts,js,mjs}`, `conformance/`, `compiler/tests/{unit,conformance,e2e-render-map,helpers,fixtures}/`, the toolchain files, the baseline) | suites run, judge decides | judge's verdict |
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
