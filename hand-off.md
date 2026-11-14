# scrml — Sessions 476 + 477 (bryan · theRog) — WRAPPED

> S476 ran 2026-11-08 and was never wrapped; S477 (2026-11-10 → 11-14, Profile A, several compactions, a 4-day API outage) wraps both. S475's hand-off is at `handOffs/hand-off-475.md`. **Rotate this file to `handOffs/hand-off-477.md` at the next wrap.** Board: `scrml-support/handOffs/active-sessions/S477-bryan.md` (S476's entry closed with it). Rulings verbatim: `scrml-support/user-voice-scrml.md` §S477. Delta-log [4019]–[4028].

## 0. Where things stand
- **bryan's Anthropic subscription ends soon** ("go, go, go … bootstrap only"). Future sessions may be few or none: this file and `handOffs/delta-log.md` must be enough to pick up cold.
- **Policy holds:** bootstrap only (`compiler/self-host-v2/`); impl#1 (`compiler/src/`) gets no work except the bootstrap-build carve-out.
- **Main at wrap:** bb3766f27 (+ this wrap PR).
- **In flight at wrap:**
  1. **#1841** `fix(bootstrap, S477): name a colon-spelled return type E-PARSE-FN`. It carries #1839's SPEC §64 `->` amendment and the 38-case migration. PA-reviewed clean, auto-merge on, branch updated to main. If it goes DIRTY (`docs/known-gaps.md`; GitHub cannot run the merge driver), merge origin/main locally, `bun run pretest`, push.
  2. **Negative-literal `insert` lane** (ruled S477: compile error E-WRITE-INVARIANT; closes g-boot-insert-negative-literal-static-s477). An agent was dispatched at wrap and opens `fix(bootstrap, S477): negative literal insert position is a compile error`. It needs an S239 review (or PA-direct, it is small) and a marker before merging.
- **Older open PRs:** #1448 (`s468-rulings-spec`) and #580 (draft).
- **Gap rollup (generated, main bb3766f27):** impl#1-owed HIGH 273 · MED 768 · LOW 751; bootstrap-carried HIGH 6 · MED 13 · LOW 4.
- **Conformance (bootstrap):** PASS 336 · FAIL 260 (S475: 302 / 243).

## 1. What landed
Every code PR had an S239 adversarial review on a frozen tree, except #1841, which the PA checked directly. Fix rounds were fresh agents, and the PA verified each with the reviewer's probes. Markers are in `docs/pr-reviews.md`.
- **S476:** #1815 (S475 wrap) #1816 (S475 records) #1819 (lotto-analyzer inbox §1–§5 gapped) #1820 (maps refresh at f92d1a8fb).
- **S477 bootstrap:** #1821 `<page>` in `<program>`; #1823 call/literal loop-source types; #1824 in-place local tape edits; #1826 pending-cell residue; #1828 `<program kind="tool">` (§64); #1830 bounded tapes + `insert` (O36: E-WRITE-INVARIANT / E-WRITE-INVARIANT-RT); #1831 nested functions (§7.3.1); #1834 tape forms (part edits, removal values, spread, concat); #1835 near-linear compile (2,720-line app 16.6 s → 1.0 s, byte-identical over 3,189 inputs).
- **Records:** #1829 #1838. #1827 closed (dev leak NOT REPRODUCED, superseded by #1835). #1839 closed into #1841.
- **Cross-repo:** flogence inbox `2026-11-14-1200-scrml-to-flogence-tool-main-arrow-return.md` tells them to rewrite `): T` → `-> T`.

## 2. Rulings (verbatim in user-voice §S477; brief from there)
Bootstrap only, maximum throughput; **O36** (provable invariant violation = compile error, unprovable = run-time trap); **§64 tool `main` return spelled `->`**; **E-WRITE-INVARIANT-RT ratified**; **negative literal `insert` position is a compile error**.

## 3. Owner questions open
1. **#1796 L3** (from S475, still no PA rec): may a whole-cell author write on a `let` or locked pending tape go through without `[replace]`? **PA rec: refuse it.** That is consistent with the grant model, and `[replace]` names the capability.
2. **g-spec-pending-reset-then-write-order-s477:** in `reset(@who); @who = "z";` the load currently wins, and §13.9.4 doesn't rule when a reset-triggered run starts. **PA rec:** the reset's load starts at the reset, so the later write wins (most recently started).
3. **Carried from S475 §3:** the #1793 veto-window readings; `.join` on `int[]` (needs the int→string ruling); per-row scoped slot spelling (O9); the S473 veto markers; `<m.card>` spelling.

## 4. Owed next (pick from here)
1. Land #1841 and the negative-insert PR (§0).
2. **Review follow-ups:** 22 LOW/MED gaps filed by #1829 and #1838, tagged `prov=review:s477-*` / `lane:s477-*` in `docs/known-gaps.md`. Best value first:
   - g-impl1-string-literal-fn-word-miscompile-s477 (MED; impl#1 is the bootstrap build tool);
   - g-boot-bound-branch-literal-static-s477;
   - g-boot-ownseq-op-allowlist-s477 (a latent fail-open).
3. **Tooling:**
   - g-hook-single-shard-test-pollution-s477;
   - g-hook-sharded-prepush-exit-s477.
4. **Carried from S475 §4:**
   - pending cells S6 (display-position values);
   - #1777 INTERIM residuals;
   - a maps refresh (last at f92d1a8fb; S477 changed analyze/print/check heavily);
   - the S474 tooling items.
5. **lotto-analyzer:** inbox §1–§8 are all filed (§7/§8 resolved by #1835). Tell the adopter that compile time is fixed.

## 5. Lessons
- **Main has a merge queue.** Use `gh pr merge N --squash --auto`; plain merge does not enqueue pending PRs, and `--delete-branch` is rejected. Pushing a pin or merge commit clears auto-merge, so re-enable it.
- **GitHub cannot run the `scrml-generated-merge` driver.** Any PR touching `docs/known-gaps.md` goes DIRTY once a sibling merges, even when a local merge is clean. Check first with `git merge-tree --write-tree --name-only origin/main origin/<branch>`.
- **CI host-global-scan:** §66-dialect conformance cases that impl#1 can't compile must be pinned in `scripts/host-global-scan.known-throws.txt` (sorted). Three PRs failed CI on it.
- **Merge-time compositions broke three times** (#1830 × #1834, #1831 × #1834 capWrite / C21 LocalFn). Each new Core variant or PrimOp needs an arm in every exhaustive match; the second lane to merge runs the other lane's tests.
- **Measure before fixing.** The "dev-server leak" was super-quadratic compile time, and measuring it found that first.
- **Brief facts, not hopes.** The PA told a rebase agent #1839 had merged when it hadn't; the agent caught it.
- **Hook:** `SCRML_HOOK_SHARDS=1` hits b17-4 order pollution; use default shards with `SCRML_HOOK_SHARD_MEM_MB=4608`. A landing tree needs `bun run pretest`.

## 6. Wrap state
- **Worktrees:** the PA removed what it could at wrap. Agent worktrees still locked by this Claude process: after it exits, bryan runs `! cd ~/scrmlMaster/scrml && git worktree list | awk '{print $1}' | grep -E '/worktrees/(agent|rev)-' | grep -v a036efcbcbcb1c8b0 | xargs -r -n1 git worktree remove -f -f && git worktree prune`. Keep `agent-a036efcbcbcb1c8b0` (#1448) and the negative-insert lane's tree until its PR merges.
- **Review probes:** `~/.cache/scrml/review/s477-*`; follow-up list `s477-followups.md` (all filed).
- **Test suite:** not re-run as one process. CI `gate` on each merged head is the record.
