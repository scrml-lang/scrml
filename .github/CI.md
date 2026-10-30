# CI notes

Workflows live in `workflows/`. The required check on `main` is the `gate` aggregator in `ci.yml`. `main` is protected by ruleset 25356240, which requires a pull request, `gate` and the merge queue, with no bypass actors. Every automated write therefore goes in through a PR.

## Generated docs: which are gated, and where

| doc | producer | PR-side | kept current on `main` by |
|---|---|---|---|
| `docs/FACTS.md` | `scripts/facts.ts` | **warns** when stale (exit 4 only); every other non-zero fails — a broken measurement (2), a missing anchor (3), a dangling symlink (5), or a crash (1, bun's uncaught-exception code) | `facts-regen.yml`, after every merge |
| `compiler/SPEC-INDEX.md` | `scripts/regen-spec-index.ts` | blocking (`checks`) and pre-push | the PR that edits `SPEC.md` |
| `docs/bootstrap-conformance.md` | `scripts/bootstrap-conformance.ts` | blocking only when the PR touches `conformance/cases` or `compiler/self-host-v2`; `tracking` reports it otherwise | the PR that changes the corpus or the bootstrap |
| `docs/known-gaps.md` `@generated:gap-counts` | `scripts/state.ts` | not CI-gated; derived only from the same file, so a PR's table always agrees with its own gap markers | the PR that adds or resolves gaps (`cloud-maps.yml` does not stage this file) |

## FACTS: regenerated on main after merge (S469)

Owner ruling, S469: "Regenerate on main after merge." FACTS holds repo-wide totals that most landings move. 48 of the 78 landings between 2026-10-10 and 2026-10-22 changed it. A PR's FACTS edit was stale, and in textual conflict, as soon as any other PR landed.

The flow, in `facts-regen.yml`:

1. Every push to `main` (and `workflow_dispatch`) runs `bun scripts/facts.ts --write` on main's **current** tip.
2. If there is no drift, nothing happens, and a leftover bot PR is closed.
3. If there is drift, the job makes one commit on top of the tip and force-pushes it to the fixed branch `bot/facts-regen`. It opens a PR from that branch, or reuses the open one, and enables auto-merge. The PR goes through `gate` and the merge queue like any other PR.
4. When that PR lands, its push re-runs the job, which finds a fixpoint: FACTS.md is not an input to any figure in it. So there is no loop.

The job also does not race. `concurrency: facts-regen` with `cancel-in-progress` keeps only the newest run alive, and there is only ever one bot branch and one bot PR. An open bot PR that already carries the right figures is not force-pushed, so it is not dequeued.

**What this means for a PR author:**

- Don't commit a FACTS.md regen. It only conflicts with the bot's.
- The CI step and the pre-push hook print a warning. That's expected.

**Token:** the job writes with the `MAPS_PAT` secret, the fine-grained PAT that `cloud-maps.yml` also uses (Contents R/W, Pull-requests R/W). The default `GITHUB_TOKEN` can't be used, because a PR it opens does not trigger `gate`, so the queue would never take it. Fine-grained PATs expire. When `MAPS_PAT` lapses, both bot workflows go red at checkout. Merges aren't blocked, since neither is a required check, but FACTS drifts until the PAT is renewed. Then re-fire with `gh workflow run facts-regen`.

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
